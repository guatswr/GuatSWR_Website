import type { SqlExecutor } from '../../database/sqlite.js'
import { publicEvent } from '../../utils/public-event.js'
import { AppError } from '../../errors.js'

export function createBotQueries(db: SqlExecutor,syncSchema=false) {
  const project = (row: Record<string, unknown>) => {
    let content: unknown
    try { content = JSON.parse(String(row.content || '{}')) } catch { content = {} }
    return publicEvent({ ...row, content })
  }
  return {
    events: async (page: number, limit: number, type?: string) => {
      const params = type ? [type] : []
      const where = `status IN ('published','ongoing','ended','settled')${type ? ' AND type=?' : ''}`
      const total = await db.get<{ count: number }>(`SELECT COUNT(*) AS count FROM events WHERE ${where}`, params)
      const rows = await db.all(`SELECT * FROM events WHERE ${where} ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?`, [...params,limit,(page-1)*limit])
      return { total: total?.count || 0, page, limit, items: rows.map(project) }
    },
    event: async (id: number) => {
      const row = await db.get("SELECT * FROM events WHERE id=? AND status IN ('published','ongoing','ended','settled')", [id])
      if (!row) throw new AppError('活动不存在或未公开', 'not_found', 404)
      return project(row)
    },
    articles: async (page: number, limit: number) => ({ page, limit, items: await db.all(`SELECT id,title,tag,date,description,cover_image FROM activities
      WHERE deleted_at IS NULL AND (status='published' OR status IS NULL) ORDER BY date DESC,id DESC LIMIT ? OFFSET ?`, [limit,(page-1)*limit]) }),
    members: async (page: number, limit: number) => ({ page, limit, items: await db.all(`SELECT id,name,role,school,avatar,tags FROM members WHERE deleted_at IS NULL${syncSchema?' AND sync_hidden=0':''} ORDER BY sort_order,id LIMIT ? OFFSET ?`, [limit,(page-1)*limit]) }),
    history: async (page: number, limit: number) => ({ page, limit, items: await db.all('SELECT id,date,title,description,image,sort_order FROM history WHERE deleted_at IS NULL ORDER BY date DESC,sort_order,id LIMIT ? OFFSET ?', [limit,(page-1)*limit]) }),
  }
}
