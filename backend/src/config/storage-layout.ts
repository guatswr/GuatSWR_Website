import fs from 'node:fs'
import path from 'node:path'
import { AppError } from '../errors.js'

const invalid = (): never => { throw new AppError('Invalid configuration: STORAGE_LAYOUT', 'invalid_configuration') }
const inside = (root: string, value: string) => {
  const relative = path.relative(root, value)
  return !relative || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
}
// Resolve existing ancestors without creating directories or opening a database.
const canonical = (filename: string): string => {
  try { return fs.realpathSync.native(filename) }
  catch (error) {
    if (!['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code || '')) throw error
    const parent = path.dirname(filename)
    if (parent === filename) throw error
    return path.join(canonical(parent), path.basename(filename))
  }
}
export function validateStorageLayout(paths: { data: string; public: string; backups: string }, input: Readonly<Record<string, string | undefined>>): void {
  const main = path.resolve(paths.data, input.DB_PATH || 'guatswr_web_main.db')
  const audit = path.resolve(paths.data, input.LOG_DB_PATH || 'guatswr_web_logs.db')
  const privateDirectories = [paths.backups, ...['private-upload', 'asset-quarantine', 'asset-publications'].map(name => path.join(paths.data, name))]
  if ([main, audit].some(filename => /[\0\r\n]/.test(filename))) invalid()
  for (const resolve of [(value: string) => value, canonical]) {
    const publicRoot = resolve(paths.public)
    if ([main, audit].some(filename => inside(publicRoot, resolve(filename)))) invalid()
    for (const directory of privateDirectories) {
      const privateRoot = resolve(directory)
      if (inside(publicRoot, privateRoot) || inside(privateRoot, publicRoot)) invalid()
    }
    if (resolve(main) === resolve(audit)) invalid()
  }
  const existing = (filename: string) => { try { return fs.statSync(filename, { bigint: true }) } catch (error) { if (['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code || '')) return undefined; throw error } }
  const mainStat = existing(main), auditStat = existing(audit)
  if (mainStat && auditStat && mainStat.ino === auditStat.ino && mainStat.dev === auditStat.dev) invalid()
}
