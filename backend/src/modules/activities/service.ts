import path from 'node:path'
import type { BackendV1Activity } from '@guatswr/shared/backend-v1'
import type { Row } from '../../database/sqlite.js'
import { AppError } from '../../errors.js'
import { positiveId } from '../../utils/storage-boundary.js'
import type { Actor } from '../actor.js'
import type { ActivitiesRepository, ActivityText, ActivityAssets } from './repository.js'
import { normalizeActivityImages } from './projection.js'
import { publishAssets, type AssetPublication } from '../../storage/publication.js'

export function createActivitiesService(dependencies: {
  repository: ActivitiesRepository
  directory: string
  storage: {
    publication?: AssetPublication
    moveStagedFile(value: ActivityText, directory: string, cache: Map<string, string>): Promise<ActivityText>
    moveStagedFiles(value: string[], directory: string, cache: Map<string, string>): Promise<string[]>
    moveStagedUrlsInText(value: ActivityText, directory: string, cache: Map<string, string>): Promise<ActivityText>
  }
  audit(username: string, action: string, details: string): void
  reportAuditFailure(error: unknown): void
  notify(activity: { id: number; title: string; tag: string; date: string; description: string; cover_image: string }, actor: Actor): Promise<unknown>
}) {
  const audit = (actor: Actor, action: string, details: string) => {
    try { dependencies.audit(actor.username, action, details) }
    catch (error) { dependencies.reportAuditFailure(error) }
  }
  const move = async (id: string, input: BackendV1Activity): Promise<ActivityAssets> => {
    const directory = path.join(dependencies.directory, id), cache = new Map<string, string>()
    const cover = await dependencies.storage.moveStagedFile(input.cover_image, directory, cache)
    const images = await dependencies.storage.moveStagedFiles(input.images || [], directory, cache)
    const content = await dependencies.storage.moveStagedUrlsInText(input.content, directory, cache)
    return { cover, images, content }
  }
  return {
    list: async (options: { all: boolean; includeDeleted: boolean; page: number; limit: number; offset: number }, actor?: Actor) => {
      if (options.all && !actor) throw new AppError('未登录', 'unauthenticated', 401)
      const visibility = options.all ? options.includeDeleted && actor?.role === 'super_admin' ? 'all' : 'active' : 'public'
      const { total, rows } = await dependencies.repository.list(visibility, options.limit, options.offset)
      return { total, page: options.page, limit: options.limit, items: rows.map(row => ({ ...row, images: normalizeActivityImages(row.images) })) }
    },
    detail: async (id: string, actor?: Actor): Promise<Row> => {
      // Preserve the legacy 404 fallback for failed detail lookup, separate from list failures.
      const row = await dependencies.repository.detail(id).catch(() => undefined)
      if (!row || (row.deleted_at && actor?.role !== 'super_admin') || (row.status === 'draft' && !actor)) throw new AppError('Not Found', 'not_found', 404)
      return { ...row, images: normalizeActivityImages(row.images), created_by: row.created_by_name, updated_by: row.updated_by_name }
    },
    draft: (actor: Actor) => dependencies.repository.draft(new Date().toISOString().slice(0, 10), actor.id),
    create: async (input: BackendV1Activity, actor: Actor) => {
      const id = await dependencies.repository.create(input, actor.id)
      let assets: ActivityAssets
      try {
        assets = await publishAssets(dependencies.storage.publication, [input], () => move(String(id), input),
          async (assets, tx) => { await dependencies.repository.saveAssets(id, assets, tx); return assets })
      } catch (error) { await dependencies.repository.discardDraft(id).catch(dependencies.reportAuditFailure); throw error }
      audit(actor, 'CREATE_ACTIVITY', `发布活动: ${input.title}`)
      void dependencies.notify({ id, title: input.title, tag: input.tag, date: input.date, description: input.description || '', cover_image: assets.cover || '' }, actor).catch(() => {})
      return id
    },
    update: async (id: string, input: BackendV1Activity, actor: Actor) => {
      if (!positiveId(id)) throw new AppError('Invalid activity id', 'invalid_activity_id', 400)
      await publishAssets(dependencies.storage.publication, [input], () => move(id, input),
        (assets, tx) => dependencies.repository.update(id, input, assets, actor.id, tx))
      audit(actor, 'UPDATE_ACTIVITY', `更新活动: ${input.title}`)
    },
    remove: async (id: string, actor: Actor) => {
      const title = await dependencies.repository.title(id, true).catch(() => 'Unknown')
      await dependencies.repository.remove(id, actor.id)
      audit(actor, 'DELETE_ACTIVITY', `软删除活动: ${title}`)
    },
    restore: async (id: string, actor: Actor) => {
      const title = await dependencies.repository.title(id, false).catch(() => 'Unknown')
      await dependencies.repository.restore(id)
      audit(actor, 'RESTORE_ACTIVITY', `恢复活动: ${title}`)
    }
  }
}
export type ActivitiesService = ReturnType<typeof createActivitiesService>
