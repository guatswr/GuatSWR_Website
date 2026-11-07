import { idBinding } from '../../database/sql.js'
import { utcTimestamp } from '../../database/sql.js'
import type { BackendV1History } from '@guatswr/shared/backend-v1'
import type { Row, SqlExecutor } from '../../database/contracts.js'

export type HistoryRow = Row & {
  id: number; date: string | null; title: string | null; description: string | null
  image: string | null; sort_order: number | null; deleted_at: string | null; deleted_by: number | null
}
export type HistoryImage = string | null | undefined
export function createHistoryRepository(db: SqlExecutor) {
  return {
    list: (includeDeleted: boolean) => db.all<HistoryRow>(includeDeleted
      ? 'SELECT * FROM history ORDER BY date ASC NULLS FIRST, sort_order ASC NULLS FIRST'
      : 'SELECT * FROM history WHERE deleted_at IS NULL ORDER BY date ASC NULLS FIRST, sort_order ASC NULLS FIRST'),
    create: async (input: BackendV1History, image: HistoryImage, executor: SqlExecutor = db) => {
      const result = await executor.run("INSERT INTO history (date, title, description, image, sort_order) VALUES ($1, $2, $3, $4, $5) RETURNING id",
        [input.date, input.title, input.description ?? null, image ?? null, input.sort_order || 0])
      return result.lastID
    },
    update: async (id: string, input: BackendV1History, image: HistoryImage, executor: SqlExecutor = db) => {
      await executor.run("UPDATE history SET date=$1, title=$2, description=$3, image=$4, sort_order=$5 WHERE id=$6",
        [input.date, input.title, input.description ?? null, image ?? null, input.sort_order, idBinding(id)])
    },
    title: async (id: string, withImage: boolean) => {
      const row = await db.get<{ title: string | null }>(withImage ? "SELECT title, image FROM history WHERE id = $1" : "SELECT title FROM history WHERE id = $1", [idBinding(id)])
      return row ? row.title : 'Unknown'
    },
    remove: async (id: string, actorId: number) => { await db.run(`UPDATE history SET deleted_at = ${utcTimestamp(db)}, deleted_by = $1 WHERE id = $2`, [actorId, idBinding(id)]) },
    restore: async (id: string) => { await db.run("UPDATE history SET deleted_at = NULL, deleted_by = NULL WHERE id = $1", [idBinding(id)]) }
  }
}
export type HistoryRepository = ReturnType<typeof createHistoryRepository>
