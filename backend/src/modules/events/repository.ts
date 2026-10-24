import type { Row, SqlExecutor, SqliteStore, SqlValue } from '../../database/sqlite.js'
import { AppError } from '../../errors.js'
import { legacyJsonBinding } from '../../database/legacy-json-binding.js'
export interface EventRow extends Row { id: number; status: string | null; created_by: number | null; content: string | null }
// Verified against both native runtimes: sqlite3 maps JSON objects/arrays to
// this fixed text and booleans to integers. Do not use JavaScript String(array).
export const eventBinding = legacyJsonBinding
export function createEventsRepository(store: SqliteStore) {
  return {
    store,
    draft: (user: number | null, ip: string) => store.run("INSERT INTO events(status,created_by,visitor_ip) VALUES('draft',?,?)", [user, ip]),
    row: (id: string) => store.get<Row & { id: number; status: string | null }>('SELECT id,status FROM events WHERE id=?', [id]),
    detail: (id: string) => store.get<EventRow>(`SELECT e.*,u.username AS created_by_name,u.avatar AS created_by_avatar
      FROM events e LEFT JOIN users u ON e.created_by=u.id WHERE e.id=?`, [id]),
    list: async (statuses: readonly string[], type: unknown, limit: number, offset: number) => {
      let where = `status IN (${statuses.map(() => '?').join(',')})`
      const params: SqlValue[] = [...statuses]
      if (type) { where += ' AND type=?'; params.push(eventBinding(type)) }
      const total = await store.get<{ count: number }>(`SELECT COUNT(*) AS count FROM events WHERE ${where}`, params)
      const rows = await store.all<EventRow>(`SELECT e.*,u.username AS created_by_name,u.avatar AS created_by_avatar
        FROM events e LEFT JOIN users u ON e.created_by=u.id WHERE ${where} ORDER BY e.created_at DESC LIMIT ? OFFSET ?`, [...params, limit, offset])
      return { total: total?.count || 0, rows }
    },
    reserve: (type: unknown, title: unknown, content: unknown, user: number, ip: string) => store.run(
      'INSERT INTO events(type,title,content,status,created_by,visitor_ip) VALUES(?,?,?,?,?,?)', [eventBinding(type), eventBinding(title || ''), JSON.stringify(content || {}), 'draft', user, ip]),
    publish: async (id: number, content: unknown, status: string, initial: Record<string, unknown>, user: number, executor: SqlExecutor = store) => {
      const result = await executor.run("UPDATE events SET content=?,status=? WHERE id=? AND status='draft' AND type IS ? AND title IS ? AND content IS ? AND created_by IS ?", [JSON.stringify(content) ?? null, status, id, eventBinding(initial.type), eventBinding(initial.title || ''), JSON.stringify(initial.content || {}), user])
      if (!result.changes) throw new AppError('事件已变化，请重新提交', 'event_changed', 409)
      return result
    },
    discard: (id: number, initial: Record<string, unknown>, user: number) => store.run("DELETE FROM events WHERE id=? AND status='draft' AND type IS ? AND title IS ? AND content IS ? AND created_by IS ?", [id, eventBinding(initial.type), eventBinding(initial.title || ''), JSON.stringify(initial.content || {}), user]),
    participants: (id: number) => store.all('SELECT * FROM event_participants WHERE event_id=? ORDER BY created_at ASC', [id])
  }
}
export type EventsRepository = ReturnType<typeof createEventsRepository>
