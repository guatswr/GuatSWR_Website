import type { SqliteStore } from '../database/sqlite.js'
import { BackupError } from './runner.js'
export function clubClock(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date)
  const value = (type: string) => parts.find(part => part.type === type)!.value
  return { day: `${value('year')}-${value('month')}-${value('day')}`, minutes: Number(value('hour')) * 60 + Number(value('minute')) }
}
export function createBackupScheduler(options: {
  store: SqliteStore; run(): Promise<void>; enabled(): boolean
  audit(username: string, action: string, details: string): void; report(error: unknown): void
}) {
  const settings = async () => Object.fromEntries((await options.store.all<{ key: string; value: string | null }>("SELECT key,value FROM site_config WHERE key IN ('backup_enabled','backup_time','backup_last_run','backup_last_error')")).map(row => [row.key, row.value]))
  let running = false
  const runAutoBackup = async (trigger = 'schedule') => {
    if (!options.enabled()) throw new BackupError('BACKUP_DISABLED', 'External services disabled')
    if (running) throw new BackupError('BACKUP_BUSY')
    running = true
    try {
      await options.run()
      await options.store.transaction(async tx => {
        await tx.run("INSERT OR REPLACE INTO site_config(key,value) VALUES('backup_last_run',?)", [clubClock().day])
        await tx.run("INSERT OR REPLACE INTO site_config(key,value) VALUES('backup_last_error','')")
      })
      try { options.audit('System', 'AUTO_BACKUP', `自动备份执行: ${trigger}`) } catch (error) { options.report(error) }
    } catch (error) {
      const failure = error instanceof BackupError ? error : new BackupError('BACKUP_FAILED', undefined, { cause: error })
      options.report(failure)
      await options.store.run("INSERT OR REPLACE INTO site_config(key,value) VALUES('backup_last_error',?)", [failure.code]).catch(options.report)
      try { options.audit('System', 'AUTO_BACKUP_FAILED', failure.code) } catch (auditError) { options.report(auditError) }
      throw failure
    } finally { running = false }
  }
  return {
    runAutoBackup,
    settings: async () => {
      const map = await settings()
      return { enabled: String(map.backup_enabled || '0') === '1', time: map.backup_time || '02:30', lastRun: map.backup_last_run || '', lastError: map.backup_last_error || '' }
    },
    updateSettings: (enabled: boolean, time: string) => options.store.transaction(async tx => {
      await tx.run("INSERT OR REPLACE INTO site_config(key,value) VALUES('backup_enabled',?)", [enabled ? '1' : '0'])
      await tx.run("INSERT OR REPLACE INTO site_config(key,value) VALUES('backup_time',?)", [time])
    }),
    checkAndRun: async () => {
      if (running || !options.enabled()) return
      try {
        const map = await settings()
        if (String(map.backup_enabled || '0') !== '1') return
        const time = String(map.backup_time || '02:30')
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return
        const [hour, minute] = time.split(':').map(Number), now = clubClock()
        if (running || now.minutes < hour! * 60 + minute! || map.backup_last_run === now.day) return
        await runAutoBackup()
      } catch (error) {
        if (error instanceof BackupError) return // execution failure was already persisted
        const failure = new BackupError('BACKUP_SETTINGS_FAILED', undefined, { cause: error })
        options.report(failure)
        await options.store.run("INSERT OR REPLACE INTO site_config(key,value) VALUES('backup_last_error',?)", [failure.code]).catch(options.report)
      }
    }
  }
}
