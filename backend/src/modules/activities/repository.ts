import { idBinding } from '../../database/sql.js'
import { utcTimestamp } from '../../database/sql.js'
import type { BackendV1Activity } from '@guatswr/shared/backend-v1'
import type { Row, SqlExecutor } from '../../database/contracts.js'
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
      const rows = await db.all<ActivityRow>(`SELECT * FROM activities WHERE ${where} ORDER BY date DESC NULLS LAST LIMIT $1 OFFSET $2`, [limit, offset])
      return { total: count?.count || 0, rows }
    },
    detail: (id: string) => db.get<ActivityDetail>(`SELECT a.*, u1.username as created_by_name, u1.avatar as created_by_avatar,
      u2.username as updated_by_name, u2.avatar as updated_by_avatar FROM activities a
      LEFT JOIN users u1 ON a.created_by = u1.id LEFT JOIN users u2 ON a.updated_by = u2.id WHERE a.id = $1`, [idBinding(id)]),
    draft: async (date: string, actorId: number, executor:SqlExecutor=db) => {
      const result = await executor.run("INSERT INTO activities (title, tag, date, description, content, cover_image, images, created_by, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id",
        ['(草稿)', '', date, '', '', '', '[]', actorId, 'draft'])
      return result.lastID
    },
    create: async (input: BackendV1Activity, actorId: number) => {
      const result = await db.run("INSERT INTO activities (title, tag, date, description, content, cover_image, images, created_by,status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8,'draft') RETURNING id",
        [input.title, input.tag, input.date, input.description ?? null, input.content ?? null, input.cover_image ?? null, JSON.stringify(input.images || []), actorId])
      return result.lastID
    },
    saveAssets: async (id: number, assets: ActivityAssets, executor: SqlExecutor = db) => {
      const result = await executor.run("UPDATE activities SET cover_image=$1, images=$2, content=$3,status='published' WHERE id=$4 AND status='draft' AND deleted_at IS NULL", [assets.cover ?? null, JSON.stringify(assets.images), assets.content ?? null, idBinding(id)])
      if (!result.changes) throw new AppError('活动已变化，请重新提交', 'activity_changed', 409)
    },
    discardDraft: (id: number) => db.run("DELETE FROM activities WHERE id=$1 AND status='draft'", [idBinding(id)]),
    update: async (id: string, input: BackendV1Activity, assets: ActivityAssets, actorId: number, executor: SqlExecutor = db) => {
      await executor.run("UPDATE activities SET title=$1, tag=$2, date=$3, description=$4, content=$5, cover_image=$6, images=$7, updated_by=$8, status=$9 WHERE id=$10",
        [input.title, input.tag, input.date, input.description ?? null, assets.content ?? null, assets.cover ?? null, JSON.stringify(assets.images), actorId, 'published', idBinding(id)])
    },
    title: async (id: string, withAssets: boolean) => {
      const row = await db.get<{ title: string | null }>(withAssets ? "SELECT title, cover_image, images FROM activities WHERE id = $1" : "SELECT title FROM activities WHERE id = $1", [idBinding(id)])
      return row ? row.title : 'Unknown'
    },
    remove: async (id: string, actorId: number) => { await db.run(`UPDATE activities SET deleted_at = ${utcTimestamp(db)}, deleted_by = $1 WHERE id = $2`, [actorId, idBinding(id)]) },
    restore: async (id: string) => { await db.run("UPDATE activities SET deleted_at = NULL, deleted_by = NULL WHERE id = $1", [idBinding(id)]) }
  }
}
export type ActivitiesRepository = ReturnType<typeof createActivitiesRepository>
