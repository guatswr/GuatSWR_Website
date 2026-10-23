import type { BackendV1History } from '@guatswr/shared/backend-v1'
import type { Row, SqlExecutor } from '../../database/sqlite.js'

export type HistoryRow = Row & {
  id: number; date: string | null; title: string | null; description: string | null
  image: string | null; sort_order: number | null; deleted_at: string | null; deleted_by: number | null
}
export type HistoryImage = string | null | undefined
export function createHistoryRepository(db: SqlExecutor) {
  return {
    list: (includeDeleted: boolean) => db.all<HistoryRow>(includeDeleted
      ? 'SELECT * FROM history ORDER BY date ASC, sort_order ASC'
      : 'SELECT * FROM history WHERE deleted_at IS NULL ORDER BY date ASC, sort_order ASC'),
    create: async (input: BackendV1History, image: HistoryImage) => {
      const result = await db.run('INSERT INTO history (date, title, description, image, sort_order) VALUES (?, ?, ?, ?, ?)',
        [input.date, input.title, input.description ?? null, image ?? null, input.sort_order || 0])
      return result.lastID
    },
    update: async (id: string, input: BackendV1History, image: HistoryImage) => {
      await db.run('UPDATE history SET date=?, title=?, description=?, image=?, sort_order=? WHERE id=?',
        [input.date, input.title, input.description ?? null, image ?? null, input.sort_order, id])
    },
    title: async (id: string, withImage: boolean) => {
      const row = await db.get<{ title: string | null }>(withImage ? 'SELECT title, image FROM history WHERE id = ?' : 'SELECT title FROM history WHERE id = ?', [id])
      return row ? row.title : 'Unknown'
    },
    remove: async (id: string, actorId: number) => { await db.run('UPDATE history SET deleted_at = CURRENT_TIMESTAMP, deleted_by = ? WHERE id = ?', [actorId, id]) },
    restore: async (id: string) => { await db.run('UPDATE history SET deleted_at = NULL, deleted_by = NULL WHERE id = ?', [id]) }
  }
}
export type HistoryRepository = ReturnType<typeof createHistoryRepository>
