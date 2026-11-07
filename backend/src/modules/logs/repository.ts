import { placeholders, likeExpression } from '../../database/sql.js'
import type { Row, SqlExecutor, SqlValue } from '../../database/contracts.js'
export interface UsernameRow extends Row { username: string | null }
export interface LogRow extends UsernameRow { action: string | null; details: string | null }
export function createLogsRepository(main: SqlExecutor, audit: SqlExecutor) {
  return {
    list: async (username: unknown, action: unknown, limit: number, offset: number) => {
      let from = 'FROM audit_logs WHERE 1=1'
      const params: SqlValue[] = []
      if (username) { from += ` AND ${likeExpression(audit, 'username', params.length + 1)}`; params.push(`%${String(username)}%`) }
      if (action) { from += ` AND ${likeExpression(audit, 'action', params.length + 1)}`; params.push(`%${String(action)}%`) }
      const count = await audit.get<{ count: number }>(`SELECT COUNT(*) AS count ${from}`, params)
      const rows = await audit.all<LogRow>(`SELECT id,username,action,details,created_at ${from} ORDER BY created_at DESC NULLS LAST LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, audit.dialect === 'postgres' && limit < 0 ? null : limit, Math.max(0, offset)])
      return { total: count?.count || 0, rows: rows.map<LogRow>(row => ({ ...row, created_at: clubTimestamp(row.created_at) })) }
    },
    stats: (limit: number) => audit.all<UsernameRow & { count: number }>(`SELECT username,COUNT(*) AS count FROM audit_logs WHERE action IN ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) GROUP BY username ORDER BY count DESC LIMIT $12`, [
      'CREATE_ACTIVITY', 'UPDATE_ACTIVITY', 'DELETE_ACTIVITY', 'CREATE_MEMBER', 'UPDATE_MEMBER', 'DELETE_MEMBER', 'CREATE_HISTORY', 'UPDATE_HISTORY', 'DELETE_HISTORY', 'UPDATE_CONFIG', 'UPDATE_PROFILE', limit
    ]),
    users: (names: string[]) => main.all<{ id: number; username: string; avatar: string | null }>(`SELECT id,username,avatar FROM users WHERE username IN (${placeholders(names.length)})`, names)
  }
}
export type LogsRepository = ReturnType<typeof createLogsRepository>

function clubTimestamp(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const timestamp = Date.parse(raw.replace(' ', 'T') + (/Z$|[+-]\d\d:\d\d$/.test(raw) ? '' : 'Z'))
  return Number.isFinite(timestamp) ? new Date(timestamp + 8 * 3600000).toISOString().slice(0, 19) + '+08:00' : null
}
