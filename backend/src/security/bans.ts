import type { Row, SqliteStore } from '../database/sqlite.js'
import type { Actor } from '../modules/actor.js'
import { AppError } from '../errors.js'
import { authorizeSecurityActor, requireSecuritySchema } from './authorize.js'
import { enqueueSecurityAudit } from './audit-outbox.js'

export function banExpiration(raw: unknown, now = Date.now()) {
  const minutes = Number(raw || 0), expires = minutes > 0 ? now + minutes * 60000 : null
  if (!Number.isFinite(minutes) || (expires !== null && (!Number.isFinite(expires) || expires > 8640000000000000))) throw new AppError('封禁时长无效', 'BAN_EXPIRY', 400)
  return expires
}
export function createBanService(options: {
  store: SqliteStore; ready: boolean; committed(): void; report(error: unknown): void
}) {
  const committed = () => { try { options.committed() } catch (error) { options.report(error) } }
  const cleanup = () => options.store.run('DELETE FROM banned_ips WHERE expires_at IS NOT NULL AND expires_at<=?', [Date.now()])
  return {
    cleanup,
    list: async () => {
      await cleanup().catch(options.report)
      return options.store.all('SELECT * FROM banned_ips ORDER BY created_at DESC')
    },
    blocked: async (ip: string) => {
      // Preserve the existing fail-open lookup policy; failures are diagnosed.
      const row = await options.store.get<Row & { reason: string | null }>('SELECT ip,reason,expires_at FROM banned_ips WHERE ip=?', [ip]).catch(error => { options.report(error); return undefined })
      if (!row) return undefined
      if (row.expires_at && Number(row.expires_at) <= Date.now()) {
        await options.store.run('DELETE FROM banned_ips WHERE ip=?', [ip]).catch(options.report)
        return undefined
      }
      return { reason: row.reason || '' }
    },
    ban: async (ip: string, reason = '', operator = 'ATRI', expires: number | null = null, actor?: Actor) => {
      if (expires !== null && (!Number.isFinite(expires) || Math.abs(expires) > 8640000000000000)) throw new AppError('Invalid ban expiry', 'BAN_EXPIRY', 400)
      requireSecuritySchema(options.ready)
      const until = expires ? ` until ${new Date(expires).toISOString()}` : ''
      await options.store.transaction(async tx => {
        const principal = actor ? await authorizeSecurityActor(tx, actor, true) : undefined
        const username = principal ? String(principal.username || 'System') : operator
        await tx.run('INSERT OR REPLACE INTO banned_ips(ip,reason,created_at,expires_at,created_by) VALUES(?,?,?,?,?)', [ip, reason, Date.now(), expires, username])
        await enqueueSecurityAudit(tx, username, 'BAN_IP', `封禁IP ${ip}${reason ? ` (${reason})` : ''}${until}`)
      })
      committed()
    },
    unban: async (ip: string, operator = 'ATRI', actor?: Actor) => {
      requireSecuritySchema(options.ready)
      await options.store.transaction(async tx => {
        const principal = actor ? await authorizeSecurityActor(tx, actor, true) : undefined
        await tx.run('DELETE FROM banned_ips WHERE ip=?', [ip])
        await enqueueSecurityAudit(tx, principal ? String(principal.username || 'System') : operator, 'UNBAN_IP', `解封IP ${ip}`)
      })
      committed()
    }
  }
}
export type BanService = ReturnType<typeof createBanService>
