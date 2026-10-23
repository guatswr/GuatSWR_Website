import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { expect, it } from 'vitest'
const require = createRequire(import.meta.url)
const source = require('../../src/models/db.js')
const compiled = require('../../dist/src/models/db.js')
const { createApplication } = require('../../dist/src/app.js')

it('source and compiled runtime share package paths and compiled assets start in isolation', async () => {
  const expected = source.resolvePaths({})
  expect(compiled.resolvePaths({})).toEqual(expected)
  expect(expected.DATA_DIR).toBe(path.join(expected.BACKEND_ROOT, 'data'))
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'guatswr-compiled-'))
  let instance
  try {
    instance = await createApplication({
      env: { NODE_ENV: 'test', JWT_SECRET: 'compiled-isolated-fixture' },
      paths: { data: path.join(root, 'data'), public: path.join(root, 'public'), backups: path.join(root, 'backups') },
      backgroundTasks: false, externalServices: false,
    })
    const server = await instance.listen(0, '127.0.0.1')
    const origin = `http://127.0.0.1:${server.address().port}`
    expect((await fetch(`${origin}/api/version`)).status).toBe(200)
    expect((await fetch(`${origin}/api/docs/`)).status).toBe(200)
    expect(instance.context.BACKEND_ROOT).toBe(expected.BACKEND_ROOT)
    expect(instance.context.dbPath).toBe(path.join(root, 'data/guatswr_web_main.db'))
  } finally {
    await instance?.close()
    if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('guatswr-compiled-')) throw new Error('Unsafe cleanup')
    await fs.rm(root, { recursive: true, force: true })
  }
})
