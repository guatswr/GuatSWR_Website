import { signupDeadlineClosed } from '@guatswr/shared'
import type { Actor } from '../../actor.js'
import type { EventRow, Identity, SignupRepository } from './repository.js'
import { guardAssetReferences, type AssetPublication } from '../../../storage/publication.js'
import type { Enqueue } from '../../../integrations/bot/platform.js'
import type { SqlExecutor } from '../../../database/sqlite.js'

export class SignupError extends Error {
  constructor(readonly status: number, message: string) { super(message) }
}
const checkEvent = (event: EventRow | undefined) => {
  if (!event) throw new SignupError(404, 'Event not found')
  if (!['STG', '则则'].includes(event.type)) throw new SignupError(400, '此活动不支持报名')
  return event
}
export function createSignupService(options: {
  repository: SignupRepository
  notify: (name: string, payload: unknown, actor: Actor | null) => Promise<unknown>
  now?: () => number
  publication?: AssetPublication
  enqueue?: Enqueue
  authorize?: (tx: SqlExecutor, identity: Identity, action: 'signup' | 'remove') => Promise<void>
}) {
  const { repository } = options
  return {
    signup: async (id: number, identity: Identity, body: Record<string, unknown> | undefined, actor: Actor | null) => {
      const payload = await guardAssetReferences(options.publication, [body?.avatar], executor => repository.transaction(async tx => {
        if (options.authorize) await options.authorize(tx.executor,identity,'signup')
        const event = checkEvent(await tx.event(id))
        if (!['published', 'ongoing'].includes(event.status)) throw new SignupError(403, '当前状态不允许报名')
        let content: unknown
        try { content = JSON.parse(event.content || '{}') } catch { content = {} }
        if (signupDeadlineClosed(content, (options.now ?? Date.now)())) throw new SignupError(403, '报名已截止')
        const input = {
          common_id: String(body?.common_id || '').trim(), machine_sign: String(body?.machine_sign || '').trim(),
          pilot_source: String(body?.pilot_source || '').trim(), qq: String(body?.qq || '').trim(), avatar: String(body?.avatar || '').trim()
        }
        if (!input.common_id || !input.qq) throw new SignupError(400, '请填写常用ID与QQ')
        if (!input.avatar) throw new SignupError(400, '请上传头像')
        await tx.save(id, identity, input)
        if (options.enqueue) await options.enqueue('event.signup', { eventId:id,type:event.type,common_id:input.common_id },actor,tx.executor)
        return { eventId: id, type: event.type, participant: { common_id: input.common_id, qq: input.qq, avatar: input.avatar, pilot_source: input.pilot_source } }
      }, executor))
      // Legacy callbacks run after commit; the durable Bot intent is recorded above.
      void options.notify('event.signup', payload, actor).catch(() => {})
    },
    find: async (id: number, identity: Identity) => {
      const row = await repository.find(id, identity)
      if (!row) return null
      const safe = { ...row }
      delete safe.visitor_ip
      delete safe.bot_identity_id
      return safe
    },
    remove: async (id: number, identity: Identity) => {
      await repository.transaction(async tx => {
        if (options.authorize) await options.authorize(tx.executor,identity,'remove')
        const result = await tx.remove(id, identity)
        if (!result.changes) throw new SignupError(404, '报名记录不存在')
        if (options.enqueue) await options.enqueue('event.signup_cancelled',{ eventId:id },null,tx.executor)
      })
    },
    list: async (id: number) => {
      const event = checkEvent(await repository.event(id))
      if (!['published', 'ongoing', 'ended', 'settled'].includes(event.status)) throw new SignupError(403, '当前状态不允许查看名单')
      return (await repository.list(id)).map(row => ({ id: row.id, common_id: row.common_id, qq: row.qq, avatar: row.avatar, pilot_source: row.pilot_source, machine_sign: row.machine_sign, created_at: row.created_at }))
    }
  }
}
export type SignupService = ReturnType<typeof createSignupService>
