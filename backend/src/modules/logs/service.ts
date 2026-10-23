import { projectLog, projectLogStat } from '../../utils/publicLog.js'
import type { UsernameRow, LogsRepository } from './repository.js'
export function createLogsService(repository: LogsRepository) {
  const hydrate = async <T extends UsernameRow>(rows: T[]) => {
    const names = [...new Set(rows.map(row => row.username).filter((name): name is string => Boolean(name)))]
    if (!names.length) return rows
    const users = await repository.users(names).catch(() => undefined)
    if (!users) return rows
    const map = new Map(users.map(user => [user.username, user]))
    return rows.map(row => ({ ...row, user_id: map.get(row.username || '')?.id || null, user_avatar: map.get(row.username || '')?.avatar || null }))
  }
  return {
    list: async (username: unknown, action: unknown, limit: number, offset: number) => {
      const { total, rows } = await repository.list(username, action, limit, offset)
      return { total, logs: (await hydrate(rows)).map(row => projectLog({ ...row, action: row.action || '', details: row.details || '', user_avatar: row.user_avatar ?? null })) }
    },
    stats: async (limit: number) => {
      const rows = await repository.stats(limit)
      // Preserve the old empty result when every grouped username is null/empty.
      if (!rows.some(row => row.username)) return { stats: [] }
      return { stats: (await hydrate(rows)).map(projectLogStat) }
    }
  }
}
export type LogsService = ReturnType<typeof createLogsService>
