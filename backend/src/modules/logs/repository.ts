import type { Row, SqlExecutor, SqlValue } from '../../database/sqlite.js'
export interface UsernameRow extends Row { username: string | null }
export interface LogRow extends UsernameRow { action: string | null; details: string | null }
export function createLogsRepository(main: SqlExecutor, audit: SqlExecutor) {
  return {
    list: async (username: unknown, action: unknown, limit: number, offset: number) => {
      let from = 'FROM audit_logs WHERE 1=1'
      const params: SqlValue[] = []
      if (username) { from += ' AND username LIKE ?'; params.push(`%${String(username)}%`) }
      if (action) { from += ' AND action LIKE ?'; params.push(`%${String(action)}%`) }
      const count = await audit.get<{ count: number }>(`SELECT COUNT(*) AS count ${from}`, params)
      const rows = await audit.all<LogRow>(`SELECT id,username,action,details,strftime('%Y-%m-%dT%H:%M:%S+08:00',created_at,'+8 hours') AS created_at ${from} ORDER BY created_at DESC LIMIT ? OFFSET ?`, [...params, limit, offset])
      return { total: count?.count || 0, rows }
    },
    stats: (limit: number) => audit.all<UsernameRow & { count: number }>(`SELECT username,COUNT(*) AS count FROM audit_logs WHERE action IN (?,?,?,?,?,?,?,?,?,?,?) GROUP BY username ORDER BY count DESC LIMIT ?`, [
      'CREATE_ACTIVITY', 'UPDATE_ACTIVITY', 'DELETE_ACTIVITY', 'CREATE_MEMBER', 'UPDATE_MEMBER', 'DELETE_MEMBER', 'CREATE_HISTORY', 'UPDATE_HISTORY', 'DELETE_HISTORY', 'UPDATE_CONFIG', 'UPDATE_PROFILE', limit
    ]),
    users: (names: string[]) => main.all<{ id: number; username: string; avatar: string | null }>(`SELECT id,username,avatar FROM users WHERE username IN (${names.map(() => '?').join(',')})`, names)
  }
}
export type LogsRepository = ReturnType<typeof createLogsRepository>
