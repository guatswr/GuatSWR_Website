import type { Actor } from '../actor.js'
import type { SqlValue } from '../../database/sqlite.js'
import { AppError } from '../../errors.js'
import { assertVisitorContent } from '../../utils/eventContentStorage.js'
import { publicEvent } from '../../utils/public-event.js'
import { eventStatuses } from './state/service.js'
import { eventBinding, type EventRow, type EventsRepository } from './repository.js'
import { publishAssets, type AssetPublication } from '../../storage/publication.js'

const publicStatuses = ['published', 'ongoing', 'ended', 'settled']
const parseContent = (row: EventRow) => {
  let content: unknown
  try { content = JSON.parse(row.content || '{}') } catch { content = {} }
  return { ...row, content }
}
export function createEventsService(options: {
  repository: EventsRepository; persist(content: unknown, id: number): Promise<unknown>
  publication?: AssetPublication
  audit(username: string, action: string, details: string): void; report(error: unknown): void
  notify(name: string, payload: unknown, actor: Actor): Promise<unknown>
}) {
  const audit = (username: string, action: string, details: string) => { try { options.audit(username, action, details) } catch (error) { options.report(error) } }
  return {
    draft: async (actor: Actor | undefined, ip: string) => (await options.repository.draft(actor?.id ?? null, ip)).lastID,
    save: async (id: string, body: Record<string, unknown>, actor?: Actor) => {
      const row = await options.repository.row(id)
      if (!row) throw new AppError('Event not found', 'not_found', 404)
      if (row.status === 'published' && !actor) throw new AppError('事件已发布，无法修改', 'event_published', 403)
      if (body.content && !['admin', 'super_admin'].includes(actor?.role || '')) assertVisitorContent(body.content)
      if (!body.type && !body.title && !body.content && body.submit !== true) throw new AppError('No fields to update', 'empty_update', 400)
      await publishAssets(options.publication, [body.content], async () => {
        try { return body.content ? await options.persist(body.content, row.id) : undefined }
        catch (cause) { throw new AppError('活动图片保存失败，请重试', 'event_asset_failed', 500, { cause }) }
      }, async (content, transaction) => {
      const sets: string[] = [], params: SqlValue[] = []
      if (body.type) { sets.push('type=?'); params.push(eventBinding(body.type)) }
      if (body.title) { sets.push('title=?'); params.push(eventBinding(body.title)) }
      if (body.content) { sets.push('content=?'); params.push(JSON.stringify(content) ?? null) }
      if (body.submit === true) { sets.push('status=?'); params.push('pending') }
      if (!sets.length) throw new AppError('No fields to update', 'empty_update', 400)
      sets.push('updated_at=CURRENT_TIMESTAMP')
      const save = async (tx: import('../../database/sqlite.js').SqlExecutor) => {
        const current = await tx.get('SELECT id,status FROM events WHERE id=?', [id])
        if (!current) throw new AppError('Event not found', 'not_found', 404)
        if (current.status === 'published' && !actor) throw new AppError('事件已发布，无法修改', 'event_published', 403)
        await tx.run(`UPDATE events SET ${sets.join(',')} WHERE id=?`, [...params, id])
      }
      if (transaction) await save(transaction); else await options.repository.store.transaction(save)
      })
      if (body.submit) audit(actor ? actor.username : 'Visitor', 'SUBMIT_EVENT', `提交事件审核 EID: ${id}`)
    },
    list: async (query: Record<string, unknown>, admin: boolean) => {
      const page = Math.max(1, parseInt(String(query.page), 10) || 1), limit = Math.min(100, Math.max(1, parseInt(String(query.limit), 10) || 20))
      const selected = query.status ? String(query.status).split(',').map(value => value.trim()).filter(value => eventStatuses.includes(value)) : []
      const statuses = admin ? selected.length ? selected : eventStatuses : publicStatuses
      const type = admin ? String(query.type || '').trim() : query.type
      const { total, rows } = await options.repository.list(statuses, type, limit, (page - 1) * limit)
      return { total, page, limit, items: rows.map(parseContent).map(row => admin ? row : publicEvent(row)) }
    },
    detail: async (id: string, actor?: Actor) => {
      const row = await options.repository.detail(id)
      if (!row) throw new AppError('Not Found', 'not_found', 404)
      const privileged = Boolean(actor && (['admin', 'super_admin'].includes(actor.role) || actor.id === row.created_by))
      if (!publicStatuses.includes(row.status || '') && !privileged) throw new AppError('事件审核中或未公开', 'event_private', 403)
      return { row: privileged ? parseContent(row) : publicEvent(parseContent(row)), privileged }
    },
    create: async (body: Record<string, unknown>, actor: Actor, ip: string) => {
      if (!body.type) throw new AppError('缺少活动类型', 'event_type_required', 400)
      const status = typeof body.status === 'string' && eventStatuses.includes(body.status) ? body.status : 'published'
      const result = await options.repository.reserve(body.type, body.title, body.content, actor.id, ip)
      let content: unknown
      try {
        content = await publishAssets(options.publication, [body.content], () => options.persist(body.content || {}, result.lastID), async (content, tx) => {
          await options.repository.publish(result.lastID, content, status, body, actor.id, tx); return content
        })
      } catch (error) { await options.repository.discard(result.lastID, body, actor.id).catch(options.report); throw error }
      audit(actor.username, 'CREATE_EVENT', `管理员发布活动 EID: ${result.lastID}`)
      if (status === 'published') void options.notify('event.published', { eventId: result.lastID, type: body.type, title: body.title, content }, { id: actor.id, username: actor.username, role: actor.role }).catch(options.report)
      return result.lastID
    },
    participants: (id: string) => {
      const value = Number(id || 0)
      if (!Number.isInteger(value) || value <= 0) throw new AppError('Invalid event id', 'invalid_id', 400)
      return options.repository.participants(value)
    }
  }
}
export type EventsService = ReturnType<typeof createEventsService>
