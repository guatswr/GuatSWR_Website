import type { BackendV1History } from '@guatswr/shared/backend-v1'
import type { HistoryRepository, HistoryImage } from './repository.js'

export interface HistoryActor { id: number; username: string; role: string }
export interface HistoryNotification { id: number; date: string; title: string; description: string; image: string; sort_order: number }
export function createHistoryService(dependencies: {
  repository: HistoryRepository
  storage: { getHistoryDir(date: string): string; moveStagedFile(value: HistoryImage, directory: string): Promise<HistoryImage> }
  audit(username: string, action: string, details: string): void
  reportAuditFailure(error: unknown): void
  notify(history: HistoryNotification, actor: HistoryActor, action: 'create' | 'update'): Promise<unknown>
}) {
  const audit = (actor: HistoryActor, action: string, details: string) => {
    try { dependencies.audit(actor.username, action, details) }
    catch (error) { dependencies.reportAuditFailure(error) }
  }
  const moved = (input: BackendV1History) => dependencies.storage.moveStagedFile(input.image, dependencies.storage.getHistoryDir(input.date))
  const notify = (id: number, input: BackendV1History, image: HistoryImage, actor: HistoryActor, action: 'create' | 'update') => {
    void dependencies.notify({ id, date: input.date, title: input.title, description: input.description || '', image: image || '', sort_order: input.sort_order || 0 }, actor, action).catch(() => {})
  }
  // Preserve the legacy deletion/restoration audit-title fallback; write failures still fail.
  const title = (id: string, withImage: boolean) => dependencies.repository.title(id, withImage).catch(() => 'Unknown')
  return {
    list: (includeDeleted: boolean, role?: string) => dependencies.repository.list(includeDeleted && role === 'super_admin'),
    create: async (input: BackendV1History, actor: HistoryActor) => {
      const image = await moved(input)
      const id = await dependencies.repository.create(input, image)
      audit(actor, 'CREATE_HISTORY', `添加群史: ${input.title}`)
      notify(id, input, image, actor, 'create')
      return id
    },
    update: async (id: string, input: BackendV1History, actor: HistoryActor) => {
      const image = await moved(input)
      await dependencies.repository.update(id, input, image)
      audit(actor, 'UPDATE_HISTORY', `更新群史: ${input.title}`)
      notify(Number(id), input, image, actor, 'update')
    },
    remove: async (id: string, actor: HistoryActor) => {
      const name = await title(id, true)
      await dependencies.repository.remove(id, actor.id)
      audit(actor, 'DELETE_HISTORY', `软删除群史: ${name}`)
    },
    restore: async (id: string, actor: HistoryActor) => {
      const name = await title(id, false)
      await dependencies.repository.restore(id)
      audit(actor, 'RESTORE_HISTORY', `恢复群史: ${name}`)
    }
  }
}
export type HistoryService = ReturnType<typeof createHistoryService>
