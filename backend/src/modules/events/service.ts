import { idBinding } from '../../database/sql.js'
import { lockRow } from '../../database/sql.js'
import { utcTimestamp } from '../../database/sql.js'
import { createHash } from 'node:crypto'
import type { Actor } from '../actor.js'
import type { SqlExecutor, SqlValue } from '../../database/contracts.js'
import { AppError } from '../../errors.js'
import { assertVisitorContent } from '../../utils/eventContentStorage.js'
import { publicEvent } from '../../utils/public-event.js'
import { eventStatuses } from './state/service.js'
import { eventBinding, type EventRow, type EventsRepository } from './repository.js'
import { publishAssets, type AssetPublication } from '../../storage/publication.js'
import type { Enqueue } from '../../integrations/bot/platform.js'

function canonicalizeValue(val: unknown): unknown {
  if (val === null || typeof val !== 'object') return val
  if (Array.isArray(val)) return val.map(canonicalizeValue)
  const sorted: Record<string, unknown> = {}
  for (const k of Object.keys(val as Record<string, unknown>).sort()) {
    sorted[k] = canonicalizeValue((val as Record<string, unknown>)[k])
  }
  return sorted
}

export function computeCanonicalPayloadDigest(body: Record<string, unknown>): string {
  const canonical = {
    type: body.type ? String(body.type) : '',
    title: body.title ? String(body.title) : '',
    content: canonicalizeValue(body.content ?? null),
  }
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex')
}

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
  enqueue?: Enqueue
}) {
  const audit = (username: string, action: string, details: string) => { try { options.audit(username, action, details) } catch (error) { options.report(error) } }
  return {
    draft: async (actor: Actor | undefined, ip: string) => (await options.repository.draft(actor?.id ?? null, ip)).lastID,
    save: async (id: string, body: Record<string, unknown>, actor?: Actor, saveOptions?: { capabilityKey?: string | undefined }) => {
      const row = await options.repository.row(id)
      if (!row) throw new AppError('Event not found', 'not_found', 404)
      if (body.content && !['admin', 'super_admin'].includes(actor?.role || '')) assertVisitorContent(body.content)
      if (!body.type && !body.title && !body.content && body.submit !== true) throw new AppError('No fields to update', 'empty_update', 400)
      const numericId = Number(id)
      // The receipt binds the actual request, never a caller-supplied digest.
      const canonicalDigest = computeCanonicalPayloadDigest(body)
      const isReplay = async (tx: SqlExecutor) => {
        if (body.submit !== true || !Number.isInteger(numericId)) return false
        const existing = await options.repository.getSubmission(numericId, tx)
        if (!existing) return false
        if (existing.capability_key !== (saveOptions?.capabilityKey || '') && !['admin', 'super_admin'].includes(actor?.role || '')) {
          throw new AppError('草稿凭据不匹配', 'forbidden', 403)
        }
        if (existing.digest !== canonicalDigest) throw new AppError('该活动已提交，请勿修改后重复提交', 'conflict', 409)
        return true
      }
      // Staged sources may have been cleaned and moderation may have advanced
      // the event status. A durable replay must not prepare files or mutate it.
      if (await isReplay(options.repository.store)) return { id: numericId, message: '保存成功', replayed: true }
      if (row.status === 'published' && !actor) throw new AppError('事件已发布，无法修改', 'event_published', 403)
      let replayed = false
      await publishAssets(options.publication, [body.content], async () => {
        try { return body.content ? await options.persist(body.content, row.id) : undefined }
        catch (cause) { throw new AppError('活动图片保存失败，请重试', 'event_asset_failed', 500, { cause }) }
      }, async (content, transaction) => {
      const sets: string[] = [], params: SqlValue[] = []
      if (body.type) { sets.push(`type=$${params.length + 1}`); params.push(eventBinding(body.type)) }
      if (body.title) { sets.push(`title=$${params.length + 1}`); params.push(eventBinding(body.title)) }
      if (body.content) { sets.push(`content=$${params.length + 1}`); params.push(JSON.stringify(content) ?? null) }
      if (body.submit === true) { sets.push(`status=$${params.length + 1}`); params.push('pending') }
      if (!sets.length) throw new AppError('No fields to update', 'empty_update', 400)
      sets.push(`updated_at=${utcTimestamp(options.repository.store)}`)
      const save = async (tx: SqlExecutor) => {
        const current = await tx.get<{ id: number; status: string | null }>(lockRow(tx, "SELECT id,status FROM events WHERE id=$1"), [idBinding(id)])
        if (!current) throw new AppError('Event not found', 'not_found', 404)
        if (current.status === 'published' && !actor) throw new AppError('事件已发布，无法修改', 'event_published', 403)
        if (await isReplay(tx)) { replayed = true; return }
        await tx.run(`UPDATE events SET ${sets.join(',')} WHERE id=$${params.length + 1}`, [...params, idBinding(id)])
        if (body.submit === true && Number.isInteger(numericId)) {
          const receiptPayload = JSON.stringify({ message: '保存成功', id: numericId })
          await options.repository.createSubmission(
            numericId,
            saveOptions?.capabilityKey || '',
            canonicalDigest,
            receiptPayload,
            Date.now(),
            tx
          )
        }
        if (options.enqueue && (body.submit === true || ['published','ongoing'].includes(String(current.status)))) {
          await options.enqueue(body.submit === true ? 'event.pending' : 'event.updated',{ eventId:row.id },actor,tx)
        }
      }
      if (transaction) await save(transaction); else await options.repository.store.transaction(save)
      })
      if (body.submit && !replayed) audit(actor ? actor.username : 'Visitor', 'SUBMIT_EVENT', `提交事件审核 EID: ${id}`)
      return { id: Number(id), message: '保存成功', replayed }
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
          await options.repository.publish(result.lastID, content, status, body, actor.id, tx)
          if (options.enqueue && status === 'published') await options.enqueue('event.published',{ eventId:result.lastID,type:body.type,title:body.title },actor,tx)
          return content
        })
      } catch (error) { await options.repository.discard(result.lastID, body, actor.id).catch(options.report); throw error }
      audit(actor.username, 'CREATE_EVENT', `管理员发布活动 EID: ${result.lastID}`)
      if (status === 'published' && !options.enqueue) void options.notify('event.published', { eventId: result.lastID, type: body.type, title: body.title, content }, { id: actor.id, username: actor.username, role: actor.role }).catch(options.report)
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
