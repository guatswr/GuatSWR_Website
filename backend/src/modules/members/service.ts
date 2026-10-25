import type { BackendV1Member } from '@guatswr/shared/backend-v1'
import type { Actor } from '../actor.js'
import type { MemberImage, MembersRepository } from './repository.js'
import { normalizeTags, projectMember, type MemberStorageProjection } from './projection.js'
import { legacyJsonBinding } from '../../database/legacy-json-binding.js'
import { publishAssets, type AssetPublication } from '../../storage/publication.js'
import type { Enqueue } from '../../integrations/bot/platform.js'

export function createMembersService(dependencies: {
  repository: MembersRepository
  directory: string
  storage: MemberStorageProjection & { publication?: AssetPublication; moveStagedFile(value: MemberImage, directory: string): Promise<MemberImage> }
  audit(username: string, action: string, details: string): void
  reportAuditFailure(error: unknown): void
  notify(member: { id: number; name: string; role: string; school: string; avatar: string }, actor: Actor): Promise<unknown>
  enqueue?: Enqueue
}) {
  const audit = (actor: Actor, action: string, details: string) => {
    try { dependencies.audit(actor.username, action, details) }
    catch (error) { dependencies.reportAuditFailure(error) }
  }
  const moved = (input: BackendV1Member) => dependencies.storage.moveStagedFile(input.avatar, dependencies.directory)
  return {
    schools: dependencies.repository.schools,
    list: async (options: { includeDeleted: boolean; original: boolean; school?: unknown }, role?: string) => {
      const school = { enabled: Boolean(options.school), value: legacyJsonBinding(options.school) }
      const privileged=['admin','super_admin'].includes(role || '')
      const rows = await dependencies.repository.list(options.includeDeleted && role === 'super_admin', school,privileged)
      return rows.map(row => projectMember(row, options.original, dependencies.storage,privileged))
    },
    create: async (input: BackendV1Member, actor: Actor) => {
      const { avatar, id } = await publishAssets(dependencies.storage.publication, [input], () => moved(input),
        async (avatar, tx) => {
          const id = await dependencies.repository.create(input, avatar, JSON.stringify(normalizeTags(input.tags)), tx)
          if (dependencies.enqueue) await dependencies.enqueue('member.added',{ id,name:input.name,role:input.role,school:input.school || '',avatar:avatar || '' },actor,tx)
          return { avatar,id }
        })
      audit(actor, 'CREATE_MEMBER', `添加成员: ${input.name}`)
      if (!dependencies.enqueue) void dependencies.notify({ id, name: input.name, role: input.role, school: input.school || '', avatar: avatar || '' }, actor).catch(() => {})
      return id
    },
    update: async (id: string, input: BackendV1Member, actor: Actor) => {
      await publishAssets(dependencies.storage.publication, [input], () => moved(input),
        (avatar, tx) => dependencies.repository.update(id, input, avatar, JSON.stringify(normalizeTags(input.tags)), tx))
      audit(actor, 'UPDATE_MEMBER', `更新成员: ${input.name}`)
    },
    remove: async (id: string, actor: Actor) => {
      const name = await dependencies.repository.name(id, true).catch(() => 'Unknown')
      await dependencies.repository.remove(id, actor.id)
      audit(actor, 'DELETE_MEMBER', `软删除成员: ${name}`)
    },
    restore: async (id: string, actor: Actor) => {
      const name = await dependencies.repository.name(id, false).catch(() => 'Unknown')
      await dependencies.repository.restore(id)
      audit(actor, 'RESTORE_MEMBER', `恢复成员: ${name}`)
    }
  }
}
export type MembersService = ReturnType<typeof createMembersService>
