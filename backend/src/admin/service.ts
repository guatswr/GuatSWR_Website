import type { SqliteStore } from '../database/sqlite.js'
import type { Actor } from '../modules/actor.js'
import { createLogsRepository } from '../modules/logs/repository.js'
import { AppError } from '../errors.js'
import { hashPassword } from '../security/credentials.js'
import type { SecurityService } from '../security/service.js'

export function createAdminService(options: {
  main: SqliteStore; audit: SqliteStore; security: SecurityService
  log(username: string, action: string, details: string): void; report(error: unknown): void
}) {
  const log = (actor: Actor, action: string, details: string) => { try { options.log(actor.username, action, details) } catch (error) { options.report(error) } }
  const logs = createLogsRepository(options.main, options.audit)
  return {
    users: () => options.main.all('SELECT id,username,role,avatar,twofa_enabled FROM users ORDER BY id ASC'),
    deleteUser: async (id: string, actor: Actor) => {
      if (parseInt(id) === actor.id) throw new AppError('无法删除自己', 'delete_self', 400)
      const deleted = await options.security.deleteAdmin(id, actor.id)
      if (!deleted) {
        const target = await options.main.get('SELECT role FROM users WHERE id=?', [id])
        throw new AppError(target ? '不能删除最后一个超级管理员或使用已失效权限' : '用户不存在', 'delete_admin_rejected', target ? 409 : 404)
      }
      log(actor, 'DELETE_USER', `删除管理员: ${deleted.username}`)
      return deleted.username
    },
    resetPassword: async (id: string, password: string, actor: Actor) => {
      const hash = hashPassword(password)
      const target = await options.main.get('SELECT username FROM users WHERE id=?', [id]).catch(() => undefined)
      await options.main.run('UPDATE users SET password=? WHERE id=?', [hash, id])
      log(actor, 'RESET_PWD', `重置密码: ${target ? target.username : 'Unknown'}`)
    },
    resetSecondPassword: async (id: string, actor: Actor) => {
      const target = await options.main.get('SELECT username FROM users WHERE id=?', [id]).catch(() => undefined)
      await options.main.run('UPDATE users SET twofa_enabled=0,twofa_secret=NULL WHERE id=?', [id])
      log(actor, 'RESET_2FA', `重置二步密码: ${target ? target.username : 'Unknown'}`)
    },
    refreshVersion: async (actor: Actor) => {
      const version = await options.security.incrementVersion()
      log(actor, 'REFRESH_TOKEN_VERSION', `强制刷新登录: version=${version}`)
      return version
    },
    logs: async (query: Record<string, unknown>) => {
      const page = parseInt(String(query.page)) || 1, limit = parseInt(String(query.limit)) || 20
      const { total, rows } = await logs.list(query.username || '', query.action || '', limit, (page - 1) * limit)
      return { total, logs: rows }
    },
    deleteLog: async (id: string, actor: Actor) => {
      await options.audit.run('DELETE FROM audit_logs WHERE id=?', [id])
      log(actor, 'DELETE_LOG', `删除日志: ${id}`)
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
