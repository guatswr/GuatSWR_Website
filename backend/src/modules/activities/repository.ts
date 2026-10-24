import type { BackendV1Activity } from '@guatswr/shared/backend-v1'
import type { Row, SqlExecutor } from '../../database/sqlite.js'
import { AppError } from '../../errors.js'

export type ActivityText = string | null | undefined
export interface ActivityAssets { cover: ActivityText; images: string[]; content: ActivityText }
export type ActivityRow = Row & {
  id: number; title: string | null; tag: string | null; date: string | null; description: string | null
  content: string | null; cover_image: string | null; images: string | null; created_by: number | null
  updated_by: number | null; status: string | null; deleted_at: string | null; deleted_by: number | null
}
export type ActivityDetail = ActivityRow & { created_by_name: string | null; updated_by_name: string | null; created_by_avatar: string | null; updated_by_avatar: string | null }
export function createActivitiesRepository(db: SqlExecutor) {
  return {
    list: async (visibility: 'public' | 'active' | 'all', limit: number, offset: number) => {
      const where = visibility === 'all' ? '1=1' : visibility === 'active' ? 'deleted_at IS NULL' : "(status = 'published' OR status IS NULL) AND deleted_at IS NULL"
      const count = await db.get<{ count: number }>(`SELECT COUNT(*) as count FROM activities WHERE ${where}`)
      const rows = await db.all<ActivityRow>(`SELECT * FROM activities WHERE ${where} ORDER BY date DESC LIMIT ? OFFSET ?`, [limit, offset])
      return { total: count?.count || 0, rows }
    },
    detail: (id: string) => db.get<ActivityDetail>(`SELECT a.*, u1.username as created_by_name, u1.avatar as created_by_avatar,
      u2.username as updated_by_name, u2.avatar as updated_by_avatar FROM activities a
      LEFT JOIN users u1 ON a.created_by = u1.id LEFT JOIN users u2 ON a.updated_by = u2.id WHERE a.id = ?`, [id]),
    draft: async (date: string, actorId: number) => {
      const result = await db.run('INSERT INTO activities (title, tag, date, description, content, cover_image, images, created_by, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        ['(草稿)', '', date, '', '', '', '[]', actorId, 'draft'])
      return result.lastID
    },
    create: async (input: BackendV1Activity, actorId: number) => {
      const result = await db.run("INSERT INTO activities (title, tag, date, description, content, cover_image, images, created_by,status) VALUES (?, ?, ?, ?, ?, ?, ?, ?,'draft')",
        [input.title, input.tag, input.date, input.description ?? null, input.content ?? null, input.cover_image ?? null, JSON.stringify(input.images || []), actorId])
      return result.lastID
    },
    saveAssets: async (id: number, assets: ActivityAssets, executor: SqlExecutor = db) => {
      const result = await executor.run("UPDATE activities SET cover_image=?, images=?, content=?,status='published' WHERE id=? AND status='draft' AND deleted_at IS NULL", [assets.cover ?? null, JSON.stringify(assets.images), assets.content ?? null, id])
      if (!result.changes) throw new AppError('活动已变化，请重新提交', 'activity_changed', 409)
    },
    discardDraft: (id: number) => db.run("DELETE FROM activities WHERE id=? AND status='draft'", [id]),
    update: async (id: string, input: BackendV1Activity, assets: ActivityAssets, actorId: number, executor: SqlExecutor = db) => {
      await executor.run('UPDATE activities SET title=?, tag=?, date=?, description=?, content=?, cover_image=?, images=?, updated_by=?, status=? WHERE id=?',
        [input.title, input.tag, input.date, input.description ?? null, assets.content ?? null, assets.cover ?? null, JSON.stringify(assets.images), actorId, 'published', id])
    },
    title: async (id: string, withAssets: boolean) => {
      const row = await db.get<{ title: string | null }>(withAssets ? 'SELECT title, cover_image, images FROM activities WHERE id = ?' : 'SELECT title FROM activities WHERE id = ?', [id])
      return row ? row.title : 'Unknown'
    },
    remove: async (id: string, actorId: number) => { await db.run('UPDATE activities SET deleted_at = CURRENT_TIMESTAMP, deleted_by = ? WHERE id = ?', [actorId, id]) },
    restore: async (id: string) => { await db.run('UPDATE activities SET deleted_at = NULL, deleted_by = NULL WHERE id = ?', [id]) }
  }
}
export type ActivitiesRepository = ReturnType<typeof createActivitiesRepository>
