import type { Row, SqlExecutor, SqliteStore } from '../../../database/sqlite.js'
interface EventRow extends Row { id: number; type: string; content: string | null }
const queries = (db: SqlExecutor) => ({
  executor: db,
  event: (id: number) => db.get<EventRow>('SELECT id, type, content FROM events WHERE id = ?', [id]),
  status: (id: number | string, status: string) => db.run('UPDATE events SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [status, id]),
  content: (id: number, content: string, status: string) => db.run('UPDATE events SET content = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [content, status, id])
})
export function createEventStateRepository(db: SqliteStore) {
  return { ...queries(db), transaction: <T>(work: (repository: ReturnType<typeof queries>) => Promise<T>, executor?: SqlExecutor) => executor ? work(queries(executor)) : db.transaction(tx => work(queries(tx))) }
}
export type EventStateRepository = ReturnType<typeof createEventStateRepository>
