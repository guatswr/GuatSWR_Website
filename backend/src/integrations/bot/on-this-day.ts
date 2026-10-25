import type { Row, SqlExecutor, SqlValue } from '../../database/sqlite.js'
import { AppError } from '../../errors.js'
import { BOT_IMAGE_SOURCE_LIMIT, createBotImageProjection, type BotImageOptions } from './images.js'

type Source = 'all' | 'articles' | 'history'
interface Match extends Row {
  total: number; id: number | null; source: 'articles' | 'history'; title: string | null
  date: string; description: string | null; image: string | null; tag: string | null
  image_description: string | null; source_truncated: number
}
const invalid = (): never => { throw new AppError('历史上的今天查询参数无效', 'invalid_parameter', 400) }
const positive = (input: unknown, fallback: number, max: number) => {
  if (input === undefined) return fallback
  if (typeof input !== 'string' || !/^[1-9]\d*$/.test(input)) return invalid()
  const value = Number(input)
  return Number.isSafeInteger(value) && value <= max ? value : invalid()
}
const calendarDate = (input: unknown): string => {
  if (typeof input !== 'string' || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(input) || input.startsWith('0000')) return invalid()
  const parsed = new Date(`${input}T00:00:00Z`)
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== input) return invalid()
  return input
}

export function createOnThisDayQuery(db: SqlExecutor, now: () => number = Date.now, imageOptions?: BotImageOptions) {
  return async (query: Record<string, unknown>) => {
    // Offset the instant before taking its calendar date, independent of host TZ.
    const date = calendarDate(query.date === undefined ? new Date(now() + 8 * 3600000).toISOString().slice(0, 10) : query.date)
    const year = date.slice(0, 4), monthDay = date.slice(5), page = positive(query.page, 1, 1000000), limit = positive(query.limit, 20, 100)
    const source: Source = query.source === undefined ? 'all'
      : query.source === 'all' || query.source === 'articles' || query.source === 'history' ? query.source : invalid()
    // Only exact authored calendar dates count. SQLite's +0 days normalizes bad
    // dates, so equality excludes corrupt leap days without silently moving them.
    const dated = (alias: string) => `${alias}.date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
      AND substr(${alias}.date,1,4)>='0001' AND substr(${alias}.date,6,5)=? AND substr(${alias}.date,1,4)<?
      AND date(${alias}.date,'+0 days')=${alias}.date`
    const selections: string[] = [], params: SqlValue[] = []
    if (source !== 'history') {
      selections.push(`SELECT 'articles' AS source,a.id,substr(a.title,1,200) AS title,a.date,
        substr(a.description,1,500) AS description,a.cover_image AS image,a.tag
        FROM activities a WHERE a.deleted_at IS NULL AND (a.status='published' OR a.status IS NULL) AND ${dated('a')}`)
      params.push(monthDay, year)
    }
    if (source !== 'articles') {
      selections.push(`SELECT 'history' AS source,h.id,substr(h.title,1,200) AS title,h.date,
        substr(h.description,1,500) AS description,h.image,NULL AS tag
        FROM history h WHERE h.deleted_at IS NULL AND ${dated('h')}`)
      params.push(monthDay, year)
    }
    // One statement gives count and page the same SQLite read snapshot. The
    // LEFT JOIN retains the total even when a requested page has no items.
    const rows = await db.all<Match>(`WITH matches AS (${selections.join(' UNION ALL ')}),
      paged AS (SELECT * FROM matches ORDER BY date DESC,source ASC,id ASC LIMIT ? OFFSET ?),
      totals AS (SELECT COUNT(*) AS total FROM matches)
      SELECT totals.total,paged.*,substr(h.description,1,${BOT_IMAGE_SOURCE_LIMIT}) AS image_description,
        CASE WHEN length(h.description)>${BOT_IMAGE_SOURCE_LIMIT} THEN 1 ELSE 0 END AS source_truncated
      FROM totals LEFT JOIN paged ON 1=1
      LEFT JOIN history h ON paged.source='history' AND h.id=paged.id
      ORDER BY paged.date DESC,paged.source ASC,paged.id ASC`,
    [...params, limit, (page - 1) * limit])
    const total = rows[0]?.total || 0
    const projectImages = imageOptions ? createBotImageProjection(imageOptions) : undefined
    const items = []
    for (const row of rows.filter(row => row.id !== null)) {
      // Article digests use the cover only, even when it is missing. Only
      // history descriptions contribute embedded pictures.
      const pictures = projectImages ? await projectImages(row.image,row.source === 'history' ? [row.image_description || ''] : [],row.source === 'history' && Boolean(row.source_truncated))
        : { images:[] as string[],image_url:'',images_truncated:false }
      items.push({
        source: row.source, id: row.id!, title: row.title || '', date: row.date,
        years_ago: Number(year) - Number(row.date.slice(0, 4)), description: row.description || '',
        image: row.image || '', tag: row.tag || '', url: row.source === 'articles' ? `/activity/${row.id}` : '/history',
        ...pictures,
      })
    }
    const label = `${Number(monthDay.slice(0, 2))}月${Number(monthDay.slice(3))}日`
    const lines = items.map(item => `${item.date.slice(0, 4)}年（${item.years_ago}年前） · ${item.source === 'articles' ? '活动文章' : '群史'}：${item.title.replace(/\s+/g, ' ').trim()}`)
    const broadcastText = total === 0 ? `历史上的今天（${label}）：暂无往年记录。`
      : [`历史上的今天（${label}），共${total}条往年记录（第${page}页）：`, ...lines,
        ...(items.length ? [] : ['本页暂无记录。'])].join('\n')
    return { date, month_day: monthDay, timezone: 'Asia/Shanghai' as const, source, page, limit, total,
      has_more: page * limit < total, items, broadcast_text: broadcastText,
      broadcast_images:[...new Set(items.flatMap(item => item.images))] }
  }
}
