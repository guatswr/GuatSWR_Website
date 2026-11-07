import { idBinding, lockRow } from '../../../database/sql.js'
import { utcTimestamp } from '../../../database/sql.js'
import type { Row, SqlExecutor, DatabaseStore } from '../../../database/contracts.js'
interface EventRow extends Row { id: number; type: string; content: string | null }
const queries = (db: SqlExecutor) => ({
  executor: db,
  event: (id: number) => db.get<EventRow>(lockRow(db, "SELECT id, type, content FROM events WHERE id = $1"), [idBinding(id)]),
  status: (id: number | string, status: string) => db.run(`UPDATE events SET status = $1, updated_at = ${utcTimestamp(db)} WHERE id = $2`, [status, idBinding(id)]),
  content: (id: number, content: string, status: string) => db.run(`UPDATE events SET content = $1, status = $2, updated_at = ${utcTimestamp(db)} WHERE id = $3`, [content, status, idBinding(id)])
})
export function createEventStateRepository(db: DatabaseStore) {
  return { ...queries(db), transaction: <T>(work: (repository: ReturnType<typeof queries>) => Promise<T>, executor?: SqlExecutor) => executor ? work(queries(executor)) : db.transaction(tx => work(queries(tx))) }
}
export type EventStateRepository = ReturnType<typeof createEventStateRepository>
