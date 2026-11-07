import { createRequire } from 'node:module'
import { promisify } from 'node:util'
import { execFile } from 'node:child_process'
import { expect, it, vi, onTestFinished } from 'vitest'
import { fixture, appUrl } from './fixture.mjs'
const require = createRequire(import.meta.url)
const { createPostgresStore } = require('../../dist/src/database/postgres.js')
const { databaseHttpFailure } = require('../../dist/src/database/contracts.js')
const pg = require('pg')
const exec = promisify(execFile)

it('preserves question marks in literals, comments and JSON operators with native binds', async () => {
  const { store } = await fixture('postgres')
  expect(await store.get(`SELECT $1::text AS value, '?' AS literal, '{"?":1}'::jsonb ? '?' AS found /* ? */`, ['? $1 中文'])).toEqual({ value: '? $1 中文', literal: '?', found: true })
  await expect(store.get('SELECT 1; DELETE FROM items')).rejects.toMatchObject({ kind: 'query' })
  await expect(store.run('CREATE TABLE forbidden(id int)')).rejects.toMatchObject({ kind: 'scope' })
})

it('keeps bigint IDs safe, exact numeric values as text, timestamps as text, and parsers local', async () => {
  const { store } = await fixture('postgres')
  expect(await store.get("SELECT 9007199254740991::bigint AS id, 1234567890.123456789::numeric AS amount, TIMESTAMP '2026-11-06 01:02:03' AS time")).toEqual({ id: Number.MAX_SAFE_INTEGER, amount: '1234567890.123456789', time: '2026-11-06 01:02:03' })
  await expect(store.get('SELECT 9007199254740992::bigint AS id')).rejects.toMatchObject({ kind: 'data' })
  await expect(store.get('SELECT $1::bigint AS id', [Number.MAX_SAFE_INTEGER + 1])).rejects.toMatchObject({ kind: 'data' })
  expect(pg.types.getTypeParser(20)('123')).toBe('123')
  expect(await store.get('SELECT 1 AS value')).toEqual({ value: 1 })
})

it('bounds concurrent connections and FIFO waiting under a burst', async () => {
  const { store } = await fixture('postgres')
  const rows = await Promise.all(Array.from({ length: 20 }, () => store.get('SELECT pg_backend_pid() AS pid, pg_sleep(0.02)')))
  expect(new Set(rows.map(row => row.pid)).size).toBeLessThanOrEqual(4)
  expect(new Set(rows.map(row => row.pid)).size).toBe(4)
})

it('rejects overflow, times out queued work and never replays a callback', async () => {
  const { store } = await fixture('postgres', { maxConnections: 1, maxWaiting: 1, acquireTimeoutMs: 60 })
  const started = Promise.withResolvers(), release = Promise.withResolvers()
  const held = store.transaction(async () => { started.resolve(); await release.promise })
  await started.promise
  let calls = 0
  const queued = store.transaction(async () => { calls++ })
  const checked = expect(queued).rejects.toMatchObject({ kind: 'busy' })
  try {
    await expect(store.get('SELECT 1')).rejects.toMatchObject({ kind: 'busy' })
    await checked
    expect(calls).toBe(0)
  } finally { release.resolve(); await held }
  expect(await store.get('SELECT 1 AS value')).toEqual({ value: 1 })
})

it('cancels only the leased connection during a running statement', async () => {
  const { store, admin } = await fixture('postgres')
  const started = Promise.withResolvers(), controller = new AbortController()
  const pending = store.transaction(async tx => {
    await tx.run("INSERT INTO items(label) VALUES('cancelled')")
    started.resolve((await tx.get('SELECT pg_backend_pid() AS pid')).pid)
    await tx.get('SELECT pg_sleep(10)')
  }, { signal: controller.signal })
  const checked = expect(pending).rejects.toMatchObject({ kind: 'interrupted' })
  const pid = await started.promise
  let sleeping = false
  for (let attempt = 0; attempt < 100; attempt++) {
    const row = (await admin.query('SELECT query,state FROM pg_stat_activity WHERE pid=$1', [pid])).rows[0]
    if (row?.state === 'active' && row.query.includes('pg_sleep')) { sleeping = true; break }
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  expect(sleeping).toBe(true)
  const other = store.get('SELECT 42 AS answer')
  const began = performance.now()
  controller.abort()
  await checked
  expect(await other).toEqual({ answer: 42 })
  expect(await store.all('SELECT id FROM items')).toEqual([])
  // Cancellation must release the server-side unique lock, not just reject JS.
  await store.run("INSERT INTO items(label) VALUES('cancelled')")
  expect(performance.now() - began).toBeLessThan(1500)
})

it('drains shutdown for a finite grace, then cancels stalled and queued work', async () => {
  const { store } = await fixture('postgres', { maxConnections: 1, shutdownGraceMs: 20 })
  const started = Promise.withResolvers()
  const held = store.transaction(async tx => { await tx.get('SELECT 1'); started.resolve(); await new Promise(() => {}) })
  const heldCheck = expect(held).rejects.toMatchObject({ kind: 'interrupted' })
  await started.promise
  const queued = store.get('SELECT 1')
  const queueCheck = expect(queued).rejects.toMatchObject({ kind: 'interrupted' })
  const began = performance.now()
  await store.close()
  await Promise.all([heldCheck, queueCheck])
  expect(performance.now() - began).toBeLessThan(1000)
})

it('checks actual schema tables and runtime privileges rather than SELECT 1', async () => {
  const { store, admin } = await fixture('postgres')
  await store.ready()
  await admin.query('REVOKE SELECT ON main.site_config FROM guatswr_app')
  try { await expect(store.ready()).rejects.toMatchObject({ kind: 'query', postgresCode: '42501' }) }
  finally { await admin.query('GRANT SELECT ON main.site_config TO guatswr_app') }
  const native = new pg.Pool({ connectionString: appUrl, max: 1 })
  try { await expect(native.query('CREATE TABLE main.forbidden(id int)')).rejects.toMatchObject({ code: '42501' }) }
  finally { await native.end() }
})

it('reconnects after a backend connection is terminated and exposes only safe errors', async () => {
  const { store, admin } = await fixture('postgres')
  const started = Promise.withResolvers()
  const pending = store.transaction(async tx => {
    const row = await tx.get('SELECT pg_backend_pid() AS pid')
    started.resolve(row.pid)
    await tx.get('SELECT pg_sleep(10)')
  })
  const checked = expect(pending).rejects.toMatchObject({ kind: 'unavailable' })
  const pid = await started.promise
  await admin.query('SELECT pg_terminate_backend($1)', [pid])
  await checked
  expect(await store.get('SELECT 1 AS value')).toEqual({ value: 1 })
})

it('maps a real deadlock to retryable conflict without replaying either callback', async () => {
  const { store } = await fixture('postgres', { acquireTimeoutMs: 5000 })
  await store.run("INSERT INTO items(label) VALUES('a'),('b')")
  const aReady = Promise.withResolvers(), bReady = Promise.withResolvers()
  let calls = 0
  const a = store.transaction(async tx => {
    calls++; await tx.run('UPDATE items SET parent_id=1 WHERE id=1'); aReady.resolve(); await bReady.promise
    await tx.run('UPDATE items SET parent_id=1 WHERE id=2')
  })
  const b = store.transaction(async tx => {
    calls++; await tx.run('UPDATE items SET parent_id=2 WHERE id=2'); bReady.resolve(); await aReady.promise
    await tx.run('UPDATE items SET parent_id=2 WHERE id=1')
  })
  const results = await Promise.allSettled([a, b])
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
  const failure = results.find(result => result.status === 'rejected').reason
  expect(failure).toMatchObject({ kind: 'deadlock', postgresCode: '40P01', retryable: true })
  expect(databaseHttpFailure(failure).status).toBe(409)
  expect(calls).toBe(2)
})

it('maps a real serialization failure without automatically repeating business work', async () => {
  const { store, admin } = await fixture('postgres')
  await admin.query("INSERT INTO main.items(label) VALUES('original')")
  await admin.query("ALTER ROLE guatswr_app SET default_transaction_isolation='serializable'")
  const aReady = Promise.withResolvers(), bReady = Promise.withResolvers()
  let calls = 0
  try {
    const a = store.transaction(async tx => {
      calls++; await tx.get('SELECT label FROM items WHERE id=1'); aReady.resolve(); await bReady.promise
      await tx.run("UPDATE items SET label='a' WHERE id=1")
    })
    const b = store.transaction(async tx => {
      calls++; await tx.get('SELECT label FROM items WHERE id=1'); bReady.resolve(); await aReady.promise
      await tx.run("UPDATE items SET label='b' WHERE id=1")
    })
    const results = await Promise.allSettled([a, b])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.find(result => result.status === 'rejected').reason).toMatchObject({ kind: 'serialization', postgresCode: '40001', retryable: true })
    expect(calls).toBe(2)
  } finally { await admin.query('ALTER ROLE guatswr_app RESET default_transaction_isolation') }
})

it('reports unknown COMMIT outcomes without blindly retrying a committed mutation', async () => {
  const { store } = await fixture('postgres')
  const nativeQuery = pg.Client.prototype.query
  let injected = false, calls = 0
  const spy = vi.spyOn(pg.Client.prototype, 'query').mockImplementation(function (sql, ...args) {
    const result = nativeQuery.call(this, sql, ...args)
    if (sql === 'COMMIT' && !injected) {
      injected = true
      return result.then(() => { throw Object.assign(Error('private connection details'), { code: 'ECONNRESET' }) })
    }
    return result
  })
  try {
    await expect(store.transaction(async tx => { calls++; await tx.run("INSERT INTO items(label) VALUES('committed')") })).rejects.toMatchObject({ kind: 'outcome_unknown', retryable: false })
  } finally { spy.mockRestore() }
  expect(calls).toBe(1)
  expect(await store.get('SELECT count(*) AS count FROM items')).toEqual({ count: 1 })
})

it('recovers an existing store after its isolated PostgreSQL service restarts', async () => {
  const { store } = await fixture('postgres')
  await store.run("INSERT INTO items(label) VALUES('restart')")
  const container = process.env.PG_ADAPTER_CONTAINER
  if (!/^[a-f0-9]{64}$/.test(container || '')) throw Error('Managed test container required')
  const label = (await exec('docker', ['inspect', '--format', '{{index .Config.Labels "io.guatswr.test"}}', container])).stdout.trim()
  expect(label).toBe('postgres-adapters')
  await exec('docker', ['restart', container])
  let result
  for (let attempt = 0; attempt < 40; attempt++) {
    try { result = await store.get('SELECT label FROM items'); break }
    catch { await new Promise(resolve => setTimeout(resolve, 100)) }
  }
  expect(result).toEqual({ label: 'restart' })
})

it('fails unavailable instead of opening a fallback SQLite store', async () => {
  const store = createPostgresStore({ connectionString: 'postgres://nobody:test@127.0.0.1:1/guatswr_pg_contract_test', schema: 'main', acquireTimeoutMs: 50 })
  onTestFinished(() => store.close())
  await expect(store.ready()).rejects.toMatchObject({ kind: 'unavailable' })
})
