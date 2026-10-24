import { createRequire } from 'node:module'
import type { loginSchema, profileSchema, registerSchema } from '@guatswr/shared/backend-v1'
import type { Row, SqliteStore, SqlValue } from '../database/sqlite.js'
import type { Actor } from '../modules/actor.js'
import { AppError } from '../errors.js'
import { comparePassword, createSecondPasswordCodec, hashPassword } from './credentials.js'
import type { SecurityService } from './service.js'
import { recordLoginFailure } from './service.js'
import { authorizeSecurityActor, nextUserVersion, requireSecuritySchema } from './authorize.js'
import { enqueueSecurityAudit } from './audit-outbox.js'

interface User extends Row { id: number; username: string; role: string; password: string; avatar: string | null; twofa_enabled: number; twofa_secret: string | null }
type Login = ReturnType<typeof loginSchema.parse>
type Profile = ReturnType<typeof profileSchema.parse>
type Registration = ReturnType<typeof registerSchema.parse>
const jwt = createRequire(__filename)('jsonwebtoken') as { sign(claims: Record<string, unknown>, key: string, options: { expiresIn: string }): string }
export function createAuthService(options: {
  store: SqliteStore; security: SecurityService; secret: string; secondSecret: string; ready?: boolean
  moveAvatar(value: string | null | undefined): Promise<string | null | undefined>
  report(error: unknown): void
  committed(): void
}) {
  const codec = createSecondPasswordCodec(options.secondSecret)
  const committed = () => { try { options.committed() } catch (error) { options.report(error) } }
  return {
    cleanup: () => options.store.run('DELETE FROM login_attempts WHERE updated_at < ?', [Date.now() - 86400000]),
    assertLoginAvailable: async (ip: string, now: number) => {
      requireSecuritySchema(options.ready)
      const attempt = await options.store.get<Row & { lock_until: number }>('SELECT count,lock_until FROM login_attempts WHERE ip=?', [ip])
      if (attempt && attempt.lock_until > now) throw new AppError(`尝试次数过多，请等待 ${Math.ceil((attempt.lock_until - now) / 1000)} 秒后再试`, 'login_locked', 429)
    },
    login: async (input: Login, ip: string, now: number) => {
      requireSecuritySchema(options.ready)
      const failure = async (message?: string): Promise<never> => {
        const attempt = await options.store.transaction(async tx => {
          const attempt = await recordLoginFailure(tx, ip, now)
          if (attempt.count >= 5) await enqueueSecurityAudit(tx, input.username || 'Unknown', 'LOGIN_LOCK', `IP ${ip} 锁定`)
          return attempt
        })
        committed()
        if (attempt.count >= 5) {
          throw new AppError('错误次数过多，锁定 1 分钟', 'login_locked', 429)
        }
        throw new AppError(message || `用户名或密码错误 (剩余 ${5 - attempt.count} 次)`, 'login_failed', 401)
      }
      const user = await options.store.get<User>('SELECT * FROM users WHERE username=?', [input.username])
      if (!user || !comparePassword(input.password, user.password)) return failure()
      if (user.twofa_enabled) {
        if (!input.twofa) throw new AppError('需要二步密码', 'second_password_required', 401)
        const stored = codec.decrypt(user.twofa_secret)
        if (!stored || stored !== String(input.twofa)) return failure('二步密码错误')
      }
      const versions = await options.store.transaction(async tx => {
        const current = await tx.get<User>('SELECT * FROM users WHERE id=?', [user.id])
        if (!current || current.password !== user.password || current.twofa_secret !== user.twofa_secret || current.twofa_enabled !== user.twofa_enabled
          || options.security.readVersion(current.auth_version) !== options.security.readVersion(user.auth_version)) throw new AppError('登录暂时不可用', 'login_changed', 503)
        const version = await tx.get("SELECT value FROM site_config WHERE key='token_version'")
        await tx.run('DELETE FROM login_attempts WHERE ip=?', [ip])
        await enqueueSecurityAudit(tx, current.username, 'LOGIN', `登录成功 (IP: ${ip})`)
        return { global: options.security.readVersion(version?.value), user: options.security.readVersion(current.auth_version), role: current.role, username: current.username }
      })
      committed()
      const token = jwt.sign({ id: user.id, username: versions.username, role: versions.role, token_version: versions.global, user_token_version: versions.user }, options.secret, { expiresIn: '24h' })
      return { token, username: versions.username, role: versions.role, avatar: user.avatar, id: user.id }
    },
    me: (id: number) => options.store.get('SELECT id,username,role,avatar,twofa_enabled FROM users WHERE id=?', [id]),
    profile: async (input: Profile, actor: Actor) => {
      requireSecuritySchema(options.ready)
      const avatar = await options.moveAvatar(input.avatar)
      const hash = input.password ? hashPassword(input.password) : undefined
      await options.store.transaction(async tx => {
        const current = await authorizeSecurityActor(tx, actor)
        const second = await tx.get('SELECT twofa_enabled FROM users WHERE id=?', [actor.id])
        const sets: string[] = [], params: SqlValue[] = []
        if (hash) { sets.push('password=?'); params.push(hash) }
        sets.push('avatar=?'); params.push(avatar || null)
        let secondAction = ''
        if (input.twofa_enabled === false) {
          sets.push('twofa_enabled=?', 'twofa_secret=?'); params.push(0, null); secondAction = '关闭二步密码'
        } else if (input.twofa_enabled === true || input.twofa_password) {
          if (!input.twofa_password) {
            if (!second?.twofa_enabled) throw new AppError('请填写二步密码', 'second_password_required', 400)
          } else {
            sets.push('twofa_enabled=?', 'twofa_secret=?'); params.push(1, codec.encrypt(input.twofa_password))
            secondAction = second?.twofa_enabled ? '更新二步密码' : '设置二步密码'
          }
        }
        await tx.run(`UPDATE users SET ${sets.join(',')} WHERE id=?`, [...params, actor.id])
        if (hash || input.twofa_enabled === false || input.twofa_password) await nextUserVersion(tx, actor.id)
        await enqueueSecurityAudit(tx, String(current.username || 'System'), 'UPDATE_PROFILE', secondAction ? `更新资料/二步密码(${secondAction})` : '更新个人资料')
      })
      committed()
    },
    register: async (input: Registration, actor: Actor) => {
      requireSecuritySchema(options.ready)
      const hash = hashPassword(input.password)
      try {
        await options.store.transaction(async tx => {
          const current = await authorizeSecurityActor(tx, actor, true)
          await tx.run('INSERT INTO users(username,password,role) VALUES(?,?,?)', [input.username, hash, 'admin'])
          await enqueueSecurityAudit(tx, String(current.username || 'System'), 'CREATE_USER', `创建管理员: ${input.username}`)
        })
      } catch (error) {
        if (error instanceof AppError) throw error
        options.report(error)
        throw new AppError('添加失败', 'registration_failed', 400)
      }
      committed()
    }
  }
}
export type AuthService = ReturnType<typeof createAuthService>
