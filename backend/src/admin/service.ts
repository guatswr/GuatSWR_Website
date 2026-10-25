import type { SqliteStore } from '../database/sqlite.js'
import type { Actor } from '../modules/actor.js'
import { createLogsRepository } from '../modules/logs/repository.js'
import { AppError } from '../errors.js'
import { hashPassword } from '../security/credentials.js'
import { createSecurityService } from '../security/service.js'
import { authorizeSecurityActor, nextUserVersion, requireSecuritySchema } from '../security/authorize.js'
import { enqueueSecurityAudit } from '../security/audit-outbox.js'
import { randomUUID } from 'node:crypto'
import { redactSecrets } from '../security/redact-secrets.js'

export function createAdminService(options: {
  main: SqliteStore; audit: SqliteStore; report(error: unknown): void
  ready?: boolean; committed(): void
}) {
  const committed = () => { try { options.committed() } catch (error) { options.report(error) } }
  const logs = createLogsRepository(options.main, options.audit)
  return {
    users: () => options.main.all('SELECT id,username,role,avatar,twofa_enabled FROM users ORDER BY id ASC'),
    deleteUser: async (id: string, actor: Actor) => {
      if (parseInt(id) === actor.id) throw new AppError('无法删除自己', 'delete_self', 400)
      requireSecuritySchema(options.ready)
      const deleted = await options.main.transaction(async tx => {
        const current = await authorizeSecurityActor(tx, actor, true)
        const deleted = await createSecurityService(tx).deleteAdmin(id, actor.id)
        if (!deleted) {
          const target = await tx.get('SELECT role FROM users WHERE id=?', [id])
          throw new AppError(target ? '不能删除最后一个超级管理员或使用已失效权限' : '用户不存在', 'delete_admin_rejected', target ? 409 : 404)
        }
        await enqueueSecurityAudit(tx, String(current.username || 'System'), 'DELETE_USER', `删除管理员: ${deleted.username}`)
        return deleted
      })
      committed()
      return deleted.username
    },
    resetPassword: async (id: string, password: string, actor: Actor) => {
      requireSecuritySchema(options.ready)
      const hash = hashPassword(password)
      await options.main.transaction(async tx => {
        const current = await authorizeSecurityActor(tx, actor, true)
        const target = await tx.get('SELECT username FROM users WHERE id=?', [id])
        await tx.run('UPDATE users SET password=? WHERE id=?', [hash, id])
        await nextUserVersion(tx, id)
        await enqueueSecurityAudit(tx, String(current.username || 'System'), 'RESET_PWD', `重置密码: ${target ? target.username : 'Unknown'}`)
      })
      committed()
    },
    resetSecondPassword: async (id: string, actor: Actor) => {
      requireSecuritySchema(options.ready)
      await options.main.transaction(async tx => {
        const current = await authorizeSecurityActor(tx, actor, true)
        const target = await tx.get('SELECT username FROM users WHERE id=?', [id])
        await tx.run('UPDATE users SET twofa_enabled=0,twofa_secret=NULL WHERE id=?', [id])
        await nextUserVersion(tx, id)
        await enqueueSecurityAudit(tx, String(current.username || 'System'), 'RESET_2FA', `重置二步密码: ${target ? target.username : 'Unknown'}`)
      })
      committed()
    },
    refreshVersion: async (actor: Actor) => {
      requireSecuritySchema(options.ready)
      const version = await options.main.transaction(async tx => {
        const current = await authorizeSecurityActor(tx, actor, true)
        const version = await createSecurityService(tx).incrementVersion()
        await enqueueSecurityAudit(tx, String(current.username || 'System'), 'REFRESH_TOKEN_VERSION', `强制刷新登录: version=${version}`)
        return version
      })
      committed()
      return version
    },
    logs: async (query: Record<string, unknown>) => {
      const page = parseInt(String(query.page)) || 1, limit = parseInt(String(query.limit)) || 20
      const { total, rows } = await logs.list(query.username || '', query.action || '', limit, (page - 1) * limit)
      return { total, logs: rows.map(row => ({ ...row, details: redactSecrets(row.details || '') })) }
    },
    deleteLog: async (id: string, actor: Actor) => {
      requireSecuritySchema(options.ready)
      const current = await options.main.transaction(tx => authorizeSecurityActor(tx, actor, true))
      // Both this mutation and its audit record live in the audit database.
      await options.audit.transaction(async tx => {
        await tx.run('DELETE FROM audit_logs WHERE id=?', [id])
        await tx.run('INSERT INTO audit_logs(username,action,details,source_id) VALUES(?,?,?,?)', [String(current.username || 'System'), 'DELETE_LOG', `删除日志: ${id}`, randomUUID()])
      })
    },
    pending: async (pageValue: unknown) => {
      const page = Math.max(1, parseInt(String(pageValue), 10) || 1)
      const total = await options.main.get<{ count: number }>("SELECT COUNT(*) AS count FROM events WHERE status='pending'")
      const rows = await options.main.all("SELECT * FROM events WHERE status='pending' ORDER BY created_at ASC LIMIT ? OFFSET ?", [20, (page - 1) * 20])
      const items = rows.map(row => {
        let content: unknown
        try { content = JSON.parse(String(row.content)) } catch { content = {} }
        return { ...row, content }
      })
      return { total: total?.count || 0, items }
    }
  }
}
export type AdminService = ReturnType<typeof createAdminService>
