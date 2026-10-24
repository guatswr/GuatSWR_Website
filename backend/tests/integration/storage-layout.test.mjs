import path from 'node:path'
import { createRequire } from 'node:module'
import { expect, it } from 'vitest'
import { fixture } from '../helpers/fixture.mjs'
const require = createRequire(import.meta.url)
const { createApplication } = require('../../src/app.js')
const { parseEnvironment } = require('../../dist/src/config/environment.js')

it.each(['public-is-data', 'public-contains-data', 'public-backups', 'public-in-private', 'main-in-public', 'audit-in-public', 'same-database'])('rejects %s before provisioning any configured directory', async scenario => {
  const f = await fixture(), root = path.join(f.root, 'layout')
  const paths = { data: path.join(root, 'data'), public: path.join(root, 'public'), backups: path.join(root, 'backups') }
  const env = { ...f.context.env }
  if (scenario === 'public-is-data') paths.public = paths.data
  if (scenario === 'public-contains-data') paths.public = root
  if (scenario === 'public-backups') paths.backups = path.join(paths.public, 'private-backups')
  if (scenario === 'public-in-private') paths.public = path.join(paths.data, 'private-upload', 'nested-public')
  if (scenario === 'main-in-public') env.DB_PATH = path.join(paths.public, 'main.db')
  if (scenario === 'audit-in-public') env.LOG_DB_PATH = path.join(paths.public, 'audit.db')
  if (scenario === 'same-database') env.LOG_DB_PATH = 'guatswr_web_main.db'
  await expect(createApplication({ env, paths, backgroundTasks: false, externalServices: false })).rejects.toMatchObject({ code: 'invalid_configuration', message: 'Invalid configuration: STORAGE_LAYOUT' })
  await expect(f.fs.stat(root)).rejects.toHaveProperty('code', 'ENOENT')
})

it('accepts separate private paths and similarly prefixed public siblings', async () => {
  const f = await fixture()
  const data = path.join(f.root, 'separate-data'), publicRoot = data + '-public'
  const result = parseEnvironment({ ...f.context.env, DATA_DIR: data, PUBLIC_DIR: publicRoot, BACKUP_ROOT: path.join(f.root, 'separate-backups') }, f.context.BACKEND_ROOT)
  expect(result.paths.public).toBe(publicRoot)
  expect(result.paths.data).toBe(data)
})

it('rejects a public symlink/junction that exposes the private data root', async () => {
  const f = await fixture(), link = path.join(f.root, 'public-alias')
  await f.fs.symlink(f.context.DATA_DIR, link, process.platform === 'win32' ? 'junction' : 'dir')
  try {
    expect(() => parseEnvironment({ ...f.context.env, DATA_DIR: f.context.DATA_DIR, PUBLIC_DIR: link, BACKUP_ROOT: f.context.BACKUP_ROOT }, f.context.BACKEND_ROOT)).toThrow('STORAGE_LAYOUT')
  } finally {
    if (process.platform === 'win32') {
      const { promisify } = await import('node:util'), { execFile } = await import('node:child_process')
      if (path.dirname(path.resolve(link)) !== path.resolve(f.root)) throw new Error('Unsafe fixture link cleanup')
      await promisify(execFile)('pwsh.exe', ['-NoProfile', '-NonInteractive', '-Command', "$item = Get-Item -LiteralPath $env:GUATSWR_LAYOUT_LINK -Force; if ($item.LinkType -notin @('Junction','SymbolicLink')) { throw 'Expected fixture link' }; Remove-Item -LiteralPath $env:GUATSWR_LAYOUT_LINK -Force"], { env: { ...process.env, GUATSWR_LAYOUT_LINK: link } })
    } else {
      if (!(await f.fs.lstat(link)).isSymbolicLink()) throw new Error('Expected fixture symlink')
      await f.fs.unlink(link)
    }
  }
})

it('rejects two database paths that identify the same native file', async () => {
  const f = await fixture(), alias = path.join(f.root, 'audit-hardlink.db')
  await f.fs.link(f.context.dbPath, alias)
  expect(() => parseEnvironment({ ...f.context.env, DATA_DIR: f.context.DATA_DIR, PUBLIC_DIR: f.context.PUBLIC_DIR, BACKUP_ROOT: f.context.BACKUP_ROOT, LOG_DB_PATH: alias }, f.context.BACKEND_ROOT)).toThrow('STORAGE_LAYOUT')
})
