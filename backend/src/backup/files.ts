import path from 'node:path'
import fs from 'node:fs/promises'
import type { BigIntStats } from 'node:fs'
import { BackupError } from './runner.js'
export const backupFileIdentity = (stat: BigIntStats) => [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].map(String).join(':')
const inside = (root: string, target: string) => { const relative = path.relative(root, target); return !relative || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)) }
const stat = async (filename: string) => { try { return await fs.lstat(filename, { bigint: true }) } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error } }
export function createBackupFiles(root: string, publicDir: string, report: (error: unknown) => void) {
  if (!path.isAbsolute(root) || !path.isAbsolute(publicDir) || inside(publicDir, root)) throw new BackupError('BACKUP_CONFIGURATION')
  const directories = { full: path.join(root, 'full'), db: path.join(root, 'db'), uploads: path.join(root, 'uploads') }
  const ensureBackupDirs = async () => {
    await fs.mkdir(root, { recursive: true, mode: 0o700 })
    const realRoot = await fs.realpath(root)
    if (inside(await fs.realpath(publicDir), realRoot)) throw new BackupError('BACKUP_CONFIGURATION')
    for (const directory of Object.values(directories)) {
      await fs.mkdir(directory, { recursive: true, mode: 0o700 })
      if ((await fs.lstat(directory)).isSymbolicLink() || !inside(realRoot, await fs.realpath(directory))) throw new BackupError('BACKUP_CONFIGURATION')
    }
  }
  const typeOf = (raw: unknown): keyof typeof directories => {
    const type = String(raw || '').trim()
    return !type || type === 'all' || type === 'full' ? 'full' : type === 'uploads' ? 'uploads' : 'db'
  }
  const resolveBackupPath = async (rawType: unknown, rawName: unknown) => {
    if (rawName && typeof rawName !== 'string') throw new BackupError('BACKUP_FILENAME')
    const name = String(rawName || '')
    if (!name || path.basename(name) !== name || /[\0\r\n\\]/.test(name)) return null
    await ensureBackupDirs()
    const type = typeOf(rawType), filename = path.join(directories[type], name)
    if (!inside(directories[type], filename)) return null
    const value = await stat(filename)
    return value?.isFile() && !value.isSymbolicLink() ? { filePath: filename, fileName: name, type } : null
  }
  const verified = async (filename: string) => {
    const markerFile = filename + '.verified.json', metadata = await stat(markerFile)
    if (!metadata) return false
    if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > 16384n) throw new BackupError('BACKUP_VERIFICATION_INVALID')
    try {
      const marker: unknown = JSON.parse(await fs.readFile(markerFile, 'utf8'))
      if (!marker || typeof marker !== 'object') throw new Error('marker')
      const value = marker as Record<string, unknown>, current = await stat(filename)
      if (value.format !== 'guatswr-verified-backup' || value.version !== 1 || value.artifact !== path.basename(filename)
        || typeof value.source_sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.source_sha256)
        || !current?.isFile() || current.isSymbolicLink() || value.source_identity !== backupFileIdentity(current) || value.source_size !== Number(current.size)) throw new Error('marker')
      return true
    } catch (cause) { throw new BackupError('BACKUP_VERIFICATION_INVALID', undefined, { cause }) }
  }
  return {
    ensureBackupDirs, resolveBackupPath,
    async listBackups(rawType: unknown) {
      await ensureBackupDirs()
      const type = typeOf(rawType), result: { name: string; type: string; size: number; mtime: number }[] = []
      for (const name of await fs.readdir(directories[type])) {
        const value = await fs.lstat(path.join(directories[type], name)).catch(error => { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error })
        if (value?.isFile() && !value.isSymbolicLink()) result.push({ name, type, size: value.size, mtime: value.mtimeMs })
      }
      return result.sort((a, b) => b.mtime - a.mtime)
    },
    async remove(rawType: unknown, rawName: unknown) {
      const target = await resolveBackupPath(rawType, rawName)
      if (!target) return null
      const lock = path.join(directories[target.type], '.backup-retention.lock')
      try { await fs.mkdir(lock, { mode: 0o700 }) } catch (cause) {
        if ((cause as NodeJS.ErrnoException).code === 'EEXIST') throw new BackupError('BACKUP_BUSY')
        throw cause
      }
      try {
        if (target.fileName.endsWith('.verified.json')) throw new BackupError('BACKUP_VERIFICATION_PROTECTED')
        if (target.fileName.endsWith('.sha256') && await stat(target.filePath.slice(0, -7) + '.tar.gz.verified.json')) throw new BackupError('BACKUP_VERIFICATION_PROTECTED')
        if (await verified(target.filePath)) {
          let alternative = false
          for (const name of await fs.readdir(directories[target.type])) {
            if (!name.endsWith('.tar.gz') || name === target.fileName) continue
            if (await verified(path.join(directories[target.type], name)).catch(() => false)) { alternative = true; break }
          }
          if (!alternative) throw new BackupError('BACKUP_LAST_VERIFIED')
        }
        await fs.unlink(target.filePath)
        if (target.fileName.endsWith('.tar.gz')) {
          for (const name of [target.filePath + '.verified.json', target.filePath.slice(0, -7) + '.sha256']) {
            await fs.unlink(name).catch(error => { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') report(error) })
          }
        }
        return target
      } finally { await fs.rmdir(lock).catch(report) }
    }
  }
}
export type BackupFiles = ReturnType<typeof createBackupFiles>
