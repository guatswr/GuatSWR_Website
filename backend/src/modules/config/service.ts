import type { BackendV1Config } from '@guatswr/shared/backend-v1'
import { AppError } from '../../errors.js'
import { PUBLIC_CONFIG_KEYS } from '../../utils/public-log.js'
import type { ConfigRepository } from './repository.js'
import { publishAssets, type AssetPublication } from '../../storage/publication.js'

export interface ConfigActor { username: string; role: string }
export interface ConfigStorage {
  publication?: AssetPublication
  isStagingUrl(value: string): boolean
  getConfigDir(key: string): string
  moveStagedFile(value: string, directory: string): Promise<string>
}
export function createConfigService(dependencies: {
  repository: ConfigRepository
  storage: ConfigStorage
  audit(username: string, key: string): void
  reportAuditFailure(error: unknown): void
}) {
  return {
    read: async (role?: string): Promise<Record<string, string | null>> => {
      const config = Object.fromEntries((await dependencies.repository.list()).map(row => [row.key, row.value]))
      if (role === 'super_admin') return config
      return Object.fromEntries([...PUBLIC_CONFIG_KEYS].filter(key => Object.hasOwn(config, key)).map(key => [key, config[key] ?? null]))
    },
    write: async (input: BackendV1Config, actor: ConfigActor): Promise<void> => {
      const { key, value } = input
      if (key === 'token_version' || key.startsWith('backup_') || (actor.role !== 'super_admin' && !PUBLIC_CONFIG_KEYS.has(key))) {
        throw new AppError('请使用专用管理接口修改内部配置', 'config_key_forbidden', 403)
      }
      await publishAssets(dependencies.storage.publication, [value], async () => dependencies.storage.isStagingUrl(value)
        ? dependencies.storage.moveStagedFile(value, dependencies.storage.getConfigDir(key)) : value,
      (finalValue, tx) => dependencies.repository.save(key, finalValue, tx))
      try { dependencies.audit(actor.username, key) }
      catch (error) { dependencies.reportAuditFailure(error) }
    }
  }
}
export type ConfigService = ReturnType<typeof createConfigService>
