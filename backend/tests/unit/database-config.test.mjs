import { createRequire } from 'node:module'
import { expect, it } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
const require = createRequire(import.meta.url)
const { parseDatabaseConfiguration } = require('../../dist/src/database/config.js')
const { classifyPostgresError } = require('../../dist/src/database/postgres.js')
const { databaseHttpFailure, DatabaseError } = require('../../dist/src/database/contracts.js')
const legacy = require('../../dist/src/database/sqlite.js')
const { createDatabase } = require('../../dist/src/models/db.js')

it('defaults to SQLite and requires an explicit private PostgreSQL URL', () => {
  expect(parseDatabaseConfiguration({})).toEqual({ driver: 'sqlite' })
  expect(parseDatabaseConfiguration({ DATABASE_DRIVER: 'postgres', POSTGRES_URL: 'postgres://app:private@127.0.0.1/site' }).driver).toBe('postgres')
  for (const env of [{ DATABASE_DRIVER: 'other' }, { DATABASE_DRIVER: 'postgres' },
    { DATABASE_DRIVER: 'postgres', POSTGRES_URL: 'https://app:private@host/site' },
    { DATABASE_DRIVER: 'postgres', POSTGRES_URL: 'postgres://app:private@host/site?options=unsafe' }]) {
    try { parseDatabaseConfiguration(env); throw Error('Expected rejection') }
    catch (error) { expect(error.code).toBe('invalid_configuration'); expect(error.message).not.toContain('private') }
  }
  expect(legacy.DatabaseError).toBe(DatabaseError)
})

it('rejects premature PostgreSQL application activation before touching SQLite paths', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'guatswr-pg-activation-'))
  try {
    const paths = { data: path.join(root, 'data'), public: path.join(root, 'public'), backups: path.join(root, 'backups') }
    await expect(createDatabase({ env: { DATABASE_DRIVER: 'postgres', POSTGRES_URL: 'postgres://app:private@127.0.0.1:1/site' }, paths })).rejects.toMatchObject({ kind: 'unavailable' })
    await expect(createDatabase({ env: { DATABASE_DRIVER: 'unknown' }, paths })).rejects.toMatchObject({ code: 'invalid_configuration' })
    expect(await fs.readdir(root)).toEqual([])
  } finally {
    if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('guatswr-pg-activation-')) throw Error('Unsafe cleanup')
    await fs.rm(root, { recursive: true, force: true })
  }
})

it.each([
  ['23505', 'constraint', 409, false], ['23503', 'constraint', 409, false],
  ['40001', 'serialization', 409, true], ['40P01', 'deadlock', 409, true],
  ['55P03', 'busy', 503, true], ['57014', 'interrupted', 503, false],
  ['08006', 'unavailable', 503, false], ['57P01', 'unavailable', 503, false],
  ['ECONNRESET', 'unavailable', 503, false], ['42601', 'query', 500, false], ['22003', 'data', 500, false],
  ['EPIPE', 'unavailable', 503, false],
])('maps %s into a safe %s HTTP failure', (code, kind, status, retryable) => {
  const error = classifyPostgresError({ code, message: 'private SQL and password', detail: 'secret' })
  expect(error).toMatchObject({ kind, retryable })
  expect(databaseHttpFailure(error).status).toBe(status)
  expect(JSON.stringify(error)).not.toMatch(/private|password|secret/)
  expect(JSON.stringify(databaseHttpFailure(error))).not.toMatch(/private|password|secret/)
})
