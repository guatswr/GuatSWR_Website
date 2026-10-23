import type { BackendV1Member } from '@guatswr/shared/backend-v1'
import type { Actor } from '../actor.js'
import type { MemberImage, MembersRepository } from './repository.js'
import { normalizeTags, projectMember, type MemberStorageProjection } from './projection.js'

export function createMembersService(dependencies: {
  repository: MembersRepository
  directory: string
  storage: MemberStorageProjection & { moveStagedFile(value: MemberImage, directory: string): Promise<MemberImage> }
  audit(username: string, action: string, details: string): void
  reportAuditFailure(error: unknown): void
  notify(member: { id: number; name: string; role: string; school: string; avatar: string }, actor: Actor): Promise<unknown>
}) {
  const audit = (actor: Actor, action: string, details: string) => {
    try { dependencies.audit(actor.username, action, details) }
    catch (error) { dependencies.reportAuditFailure(error) }
  }
  const moved = (input: BackendV1Member) => dependencies.storage.moveStagedFile(input.avatar, dependencies.directory)
  return {
    schools: dependencies.repository.schools,
    list: async (options: { includeDeleted: boolean; original: boolean; school?: unknown }, role?: string) => {
      // Express structured school parameters were bound as NULL by sqlite3, never interpolated.
      const school = { enabled: Boolean(options.school), value: typeof options.school === 'string' ? options.school : null }
      const rows = await dependencies.repository.list(options.includeDeleted && role === 'super_admin', school)
      return rows.map(row => projectMember(row, options.original, dependencies.storage))
    },
    create: async (input: BackendV1Member, actor: Actor) => {
      const avatar = await moved(input)
      const id = await dependencies.repository.create(input, avatar, JSON.stringify(normalizeTags(input.tags)))
      audit(actor, 'CREATE_MEMBER', `添加成员: ${input.name}`)
      void dependencies.notify({ id, name: input.name, role: input.role, school: input.school || '', avatar: avatar || '' }, actor).catch(() => {})
      return id
    },
    update: async (id: string, input: BackendV1Member, actor: Actor) => {
      const avatar = await moved(input)
      await dependencies.repository.update(id, input, avatar, JSON.stringify(normalizeTags(input.tags)))
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
