import { idBinding } from '../../database/sql.js'
import { placeholders } from '../../database/sql.js'
import type { Row, SqlExecutor, DatabaseStore, SqlValue } from '../../database/contracts.js'
import { AppError } from '../../errors.js'
import { legacyJsonBinding } from '../../database/legacy-json-binding.js'
export interface EventRow extends Row { id: number; status: string | null; created_by: number | null; content: string | null }
export interface EventSubmissionRow extends Row {
  event_id: number
  capability_key: string
  digest: string
  response: string
  created_at: number
}
// Verified against both native runtimes: sqlite3 maps JSON objects/arrays to
// this fixed text and booleans to integers. Do not use JavaScript String(array).
export const eventBinding = legacyJsonBinding
export function createEventsRepository(store: DatabaseStore) {
  return {
    store,
    draft: (user: number | null, ip: string) => store.run("INSERT INTO events(status,created_by,visitor_ip) VALUES('draft',$1,$2) RETURNING id", [user, ip]),
    row: (id: string) => store.get<Row & { id: number; status: string | null }>("SELECT id,status FROM events WHERE id=$1", [idBinding(id)]),
    detail: (id: string) => store.get<EventRow>(`SELECT e.*,u.username AS created_by_name,u.avatar AS created_by_avatar
      FROM events e LEFT JOIN users u ON e.created_by=u.id WHERE e.id=$1`, [idBinding(id)]),
    list: async (statuses: readonly string[], type: unknown, limit: number, offset: number) => {
      let where = `status IN (${placeholders(statuses.length)})`
      const params: SqlValue[] = [...statuses]
      if (type) { where += ` AND type=$${params.length + 1}`; params.push(eventBinding(type)) }
      const total = await store.get<{ count: number }>(`SELECT COUNT(*) AS count FROM events WHERE ${where}`, params)
      const rows = await store.all<EventRow>(`SELECT e.*,u.username AS created_by_name,u.avatar AS created_by_avatar
        FROM events e LEFT JOIN users u ON e.created_by=u.id WHERE ${where} ORDER BY e.created_at DESC NULLS LAST LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, limit, offset])
      return { total: total?.count || 0, rows }
    },
    reserve: (type: unknown, title: unknown, content: unknown, user: number, ip: string) => store.run(
      "INSERT INTO events(type,title,content,status,created_by,visitor_ip) VALUES($1,$2,$3,$4,$5,$6) RETURNING id", [eventBinding(type), eventBinding(title || ''), JSON.stringify(content || {}), 'draft', user, ip]),
    publish: async (id: number, content: unknown, status: string, initial: Record<string, unknown>, user: number, executor: SqlExecutor = store) => {
      const result = await executor.run("UPDATE events SET content=$1,status=$2 WHERE id=$3 AND status='draft' AND type IS NOT DISTINCT FROM $4 AND title IS NOT DISTINCT FROM $5 AND content IS NOT DISTINCT FROM $6 AND created_by IS NOT DISTINCT FROM $7", [JSON.stringify(content) ?? null, status, idBinding(id), eventBinding(initial.type), eventBinding(initial.title || ''), JSON.stringify(initial.content || {}), user])
      if (!result.changes) throw new AppError('事件已变化，请重新提交', 'event_changed', 409)
      return result
    },
    discard: (id: number, initial: Record<string, unknown>, user: number) => store.run("DELETE FROM events WHERE id=$1 AND status='draft' AND type IS NOT DISTINCT FROM $2 AND title IS NOT DISTINCT FROM $3 AND content IS NOT DISTINCT FROM $4 AND created_by IS NOT DISTINCT FROM $5", [idBinding(id), eventBinding(initial.type), eventBinding(initial.title || ''), JSON.stringify(initial.content || {}), user]),
    participants: (id: number) => store.all("SELECT * FROM event_participants WHERE event_id=$1 ORDER BY created_at ASC NULLS FIRST", [idBinding(id)]),
    getSubmission: (eventId: number, executor: SqlExecutor = store) =>
      executor.get<EventSubmissionRow>("SELECT * FROM event_submissions WHERE event_id=$1", [eventId]),
    createSubmission: (eventId: number, capabilityKey: string, digest: string, response: string, createdAt: number, executor: SqlExecutor = store) =>
      executor.run("INSERT INTO event_submissions(event_id, capability_key, digest, response, created_at) VALUES ($1, $2, $3, $4, $5)",
        [eventId, capabilityKey, digest, response, createdAt])
  }
}
export type EventsRepository = ReturnType<typeof createEventsRepository>
