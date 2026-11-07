import type { SqlExecutor } from '../database/contracts.js'
import type { Actor } from '../modules/actor.js'
import { AppError } from '../errors.js'
import { readVersion } from './service.js'

export function requireSecuritySchema(ready: boolean | undefined) {
  if (!ready) throw new AppError('请先升级数据库', 'security_migration_required', 503)
}
export async function authorizeSecurityActor(tx: SqlExecutor, actor: Actor, superOnly = false) {
  // Serialize privilege/version mutations, including the last-superadmin check.
  // This is a security-domain lock, not a global business writer lock.
  if (tx.dialect === 'postgres') await tx.get('SELECT pg_advisory_xact_lock(57123,1)')
  const user = await tx.get(`SELECT id,username,role,auth_version,
    (SELECT value FROM site_config WHERE key='token_version') AS global_version FROM users WHERE id=$1`, [actor.id])
  if (!user || readVersion(user.auth_version) !== readVersion(actor.user_token_version)
    || readVersion(user.global_version) !== readVersion(actor.token_version)) throw new AppError('会话已失效，请重新登录', 'session_expired', 401)
  if (superOnly && user.role !== 'super_admin') throw new AppError('权限不足', 'forbidden', 403)
  return user
}
export async function nextUserVersion(tx: SqlExecutor, id: string | number) {
  const row = await tx.get("SELECT auth_version FROM users WHERE id=$1", [id])
  if (!row) return
  if (readVersion(row.auth_version) >= Number.MAX_SAFE_INTEGER) throw new Error('User version exhausted')
  await tx.run("UPDATE users SET auth_version=auth_version+1 WHERE id=$1", [id])
}
