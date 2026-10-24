import { randomUUID } from 'node:crypto'
import type { Row, SqlExecutor, SqliteStore } from '../database/sqlite.js'

interface Intent extends Row { id: string; username: string; action: string; details: string; created_at: string }
export async function enqueueSecurityAudit(tx: SqlExecutor, username: string, action: string, details: string) {
  const id = randomUUID()
  await tx.run('INSERT INTO security_audit_outbox(id,username,action,details) VALUES(?,?,?,?)', [id, username || 'System', action, details])
  return id
}
export function createSecurityAuditDispatcher(main: SqliteStore, audit: SqliteStore, report: (error: unknown) => void) {
  let active: Promise<{ delivered: number; failed: number }> | undefined
  const deliver = async (signal?: AbortSignal) => {
    const jobs = await main.all<Intent>('SELECT id,username,action,details,created_at FROM security_audit_outbox WHERE delivered_at IS NULL ORDER BY attempts,created_at,id LIMIT 20')
    const result = { delivered: 0, failed: 0 }
    for (const job of jobs) {
      if (signal?.aborted) break
      try {
        // The audit database commits independently; its unique source_id closes
        // the crash window before the main database delivery acknowledgement.
        await audit.transaction(async tx => {
          await tx.run('INSERT OR IGNORE INTO audit_logs(username,action,details,created_at,source_id) VALUES(?,?,?,?,?)', [job.username, job.action, job.details, job.created_at, job.id])
          const stored = await tx.get('SELECT username,action,details,created_at FROM audit_logs WHERE source_id=?', [job.id])
          if (!stored || stored.username !== job.username || stored.action !== job.action || stored.details !== job.details || stored.created_at !== job.created_at) throw Object.assign(new Error('Security audit identity collision'), { code: 'SECURITY_AUDIT_COLLISION' })
        })
        await main.run('UPDATE security_audit_outbox SET delivered_at=CURRENT_TIMESTAMP,last_error=NULL WHERE id=? AND delivered_at IS NULL', [job.id])
        result.delivered++
      } catch (error) {
        const code = error && typeof error === 'object' && 'code' in error && error.code === 'SECURITY_AUDIT_COLLISION' ? 'SECURITY_AUDIT_COLLISION' : 'SECURITY_AUDIT_RETRY'
        report(Object.assign(new Error('Security audit delivery failed', { cause: error }), { code }))
        await main.run("UPDATE security_audit_outbox SET attempts=MIN(attempts+1,2147483647),last_error='audit_delivery_failed' WHERE id=? AND delivered_at IS NULL", [job.id]).catch(report)
        result.failed++
      }
    }
    return result
  }
  return {
    flush(signal?: AbortSignal) {
      if (!active) {
        active = deliver(signal).finally(() => { active = undefined })
      }
      return active
    }
  }
}
