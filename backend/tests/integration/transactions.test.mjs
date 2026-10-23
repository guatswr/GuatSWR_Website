import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { spawn, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { once } from 'node:events'
import { expect, it, onTestFinished } from 'vitest'
import { fixture as application } from '../helpers/fixture.mjs'
const require = createRequire(import.meta.url)
const sqlite = require('sqlite3')
const { createSqliteStore, classifySqliteError } = require('../../dist/src/database/sqlite.js')
const exec = (db, sql) => new Promise((resolve, reject) => db.exec(sql, error => error ? reject(error) : resolve()))
const command = promisify(execFile)
const ready = () => Promise.withResolvers()
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'guatswr-transaction-'))
  const filename = path.join(root, 'main.db')
  const db = await new Promise((resolve, reject) => { const value = new sqlite.Database(filename, error => error ? reject(error) : resolve(value)) })
  await exec(db, 'PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=2000; CREATE TABLE items(id INTEGER PRIMARY KEY AUTOINCREMENT, label TEXT UNIQUE, parent_id INTEGER REFERENCES items(id), value BLOB);')
  const stores = []
  const store = (options = {}) => { const value = createSqliteStore(filename, options); stores.push(value); return value }
  onTestFinished(async () => {
    await Promise.all(stores.map(value => value.close()))
    await new Promise((resolve, reject) => db.close(error => error ? reject(error) : resolve()))
    if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('guatswr-transaction-')) throw new Error('Unsafe cleanup')
    await fs.rm(root, { recursive: true, force: true })
  })
  return { filename, db, store }
}
it('binds values, preserves NULL and binary data, and returns run metadata', async () => {
  const db = (await fixture()).store()
  const label = "'); DROP TABLE items; --"
  const value = Buffer.from([0, 255, 127])
  const inserted = await db.run('INSERT INTO items(label,value) VALUES (?,?)', [label, value])
  expect(inserted).toEqual({ lastID: 1, changes: 1 })
  expect(await db.get('SELECT label,parent_id,value FROM items WHERE id=?', [inserted.lastID])).toEqual({ label, parent_id: null, value })
  expect(await db.get('SELECT id FROM items WHERE id=?', [-1])).toBeUndefined()
  expect(await db.all('SELECT id FROM items ORDER BY id')).toEqual([{ id: 1 }])
})
it('commits an ordered transaction and rolls back every write on a domain error', async () => {
  const db = (await fixture()).store()
  const result = await db.transaction(async tx => {
    const parent = await tx.run('INSERT INTO items(label) VALUES (?)', ['parent'])
    await tx.run('INSERT INTO items(label,parent_id) VALUES (?,?)', ['child', parent.lastID])
    return tx.all('SELECT label FROM items ORDER BY id')
  })
  expect(result).toEqual([{ label: 'parent' }, { label: 'child' }])
  const failure = new Error('domain failure')
  await expect(db.transaction(async tx => {
    await tx.run('DELETE FROM items WHERE label=?', ['child'])
    throw failure
  })).rejects.toBe(failure)
  expect(await db.get('SELECT count(*) AS count FROM items')).toEqual({ count: 2 })
})
it('enforces FK and unique constraints on each dedicated connection', async () => {
  const db = (await fixture()).store()
  await db.run('INSERT INTO items(label) VALUES (?)', ['existing'])
  await expect(db.run('INSERT INTO items(label,parent_id) VALUES (?,?)', ['orphan', 999])).rejects.toMatchObject({ kind: 'constraint', retryable: false })
  await expect(db.transaction(async tx => {
    await tx.run('INSERT INTO items(label) VALUES (?)', ['transient'])
    await tx.run('INSERT INTO items(label) VALUES (?)', ['existing'])
  })).rejects.toMatchObject({ kind: 'constraint' })
  expect(await db.all('SELECT label FROM items')).toEqual([{ label: 'existing' }])
})
it('drains queued operations and rolls back even if a query error was caught', async () => {
  const db = (await fixture()).store()
  await expect(db.transaction(async tx => {
    void tx.run('INSERT INTO items(label) VALUES (?)', ['first'])
    await tx.run('INSERT INTO items(label) VALUES (?)', ['first']).catch(() => {})
    void tx.run('INSERT INTO items(label) VALUES (?)', ['last'])
  })).rejects.toMatchObject({ kind: 'constraint' })
  expect(await db.all('SELECT id FROM items')).toEqual([])
})
it('keeps an unrelated legacy request outside a transaction that rolls back', async () => {
  const f = await fixture(), db = f.store()
  const started = ready(), release = ready()
  const transaction = db.transaction(async tx => {
    await tx.run('INSERT INTO items(label) VALUES (?)', ['rolled-back'])
    started.resolve()
    await release.promise
    expect(await tx.all('SELECT label FROM items')).toEqual([{ label: 'rolled-back' }])
    throw new Error('rollback requested')
  })
  const rejected = expect(transaction).rejects.toThrow('rollback requested')
  await started.promise
  const outsider = exec(f.db, "INSERT INTO items(label) VALUES ('outside-request')")
  release.resolve()
  await rejected
  await outsider
  expect(await db.all('SELECT label FROM items')).toEqual([{ label: 'outside-request' }])
})
it('serializes two independent writers without replaying their callbacks', async () => {
  const f = await fixture(), first = f.store(), second = f.store()
  const started = ready(), release = ready()
  let calls = 0
  const a = first.transaction(async tx => {
    await tx.run('INSERT INTO items(label) VALUES (?)', ['first'])
    started.resolve()
    await release.promise
  })
  await started.promise
  const b = second.transaction(async tx => {
    calls++
    expect(await tx.get('SELECT count(*) AS count FROM items')).toEqual({ count: 1 })
    await tx.run('INSERT INTO items(label) VALUES (?)', ['second'])
  })
  release.resolve()
  await Promise.all([a, b])
  expect(calls).toBe(1)
  expect(await first.all('SELECT label FROM items ORDER BY id')).toEqual([{ label: 'first' }, { label: 'second' }])
})
it('bounds SQLite busy waiting and never invokes or retries a locked callback', async () => {
  const f = await fixture(), db = f.store({ busyTimeoutMs: 50 })
  await exec(f.db, 'BEGIN IMMEDIATE')
  let calls = 0
  const started = performance.now()
  try {
    await expect(db.transaction(async () => { calls++ })).rejects.toMatchObject({ kind: 'busy', sqliteCode: 'SQLITE_BUSY', retryable: true })
    expect(performance.now() - started).toBeLessThan(2500)
    expect(calls).toBe(0)
  } finally { await exec(f.db, 'ROLLBACK') }
  await db.run('INSERT INTO items(label) VALUES (?)', ['recovered'])
})
it('rejects nested/outer access, escaped executors and manual transaction control', async () => {
  const db = (await fixture()).store()
  let escaped
  await db.transaction(async tx => {
    escaped = tx
    await expect(db.transaction(async () => {})).rejects.toMatchObject({ kind: 'scope' })
    await expect(db.get('SELECT 1')).rejects.toMatchObject({ kind: 'scope' })
    await expect(db.close()).rejects.toMatchObject({ kind: 'scope' })
    await tx.run('INSERT INTO items(label) VALUES (?)', ['committed'])
  })
  await expect(escaped.run('INSERT INTO items(label) VALUES (?)', ['escaped'])).rejects.toMatchObject({ kind: 'scope' })
  await expect(db.transaction(async tx => tx.run('COMMIT'))).rejects.toMatchObject({ kind: 'scope' })
  expect(await db.all('SELECT label FROM items')).toEqual([{ label: 'committed' }])
})
it('aborts a stalled callback, rolls back and releases its writer connection', async () => {
  const f = await fixture(), db = f.store(), controller = new AbortController(), started = ready()
  const pending = db.transaction(async tx => {
    await tx.run('INSERT INTO items(label) VALUES (?)', ['cancelled'])
    started.resolve()
    await new Promise(() => {})
  }, { signal: controller.signal })
  const rejected = expect(pending).rejects.toMatchObject({ kind: 'interrupted' })
  await started.promise
  controller.abort()
  await rejected
  expect(await db.all('SELECT id FROM items')).toEqual([])
  await db.run('INSERT INTO items(label) VALUES (?)', ['after-abort'])
})
it('close aborts pending transactions and prevents new operations', async () => {
  const db = (await fixture()).store(), started = ready()
  const pending = db.transaction(async tx => {
    await tx.run('INSERT INTO items(label) VALUES (?)', ['cancelled'])
    started.resolve()
    await new Promise(() => {})
  })
  const rejected = expect(pending).rejects.toMatchObject({ kind: 'interrupted' })
  await started.promise
  const closing = db.close()
  expect(db.close()).toBe(closing)
  await expect(db.get('SELECT 1')).rejects.toMatchObject({ kind: 'scope' })
  await Promise.all([closing, rejected])
})
it('interrupts a running SQLite statement and rolls back its preceding write', async () => {
  const db = (await fixture()).store(), controller = new AbortController(), started = ready()
  const pending = db.transaction(async tx => {
    await tx.run('INSERT INTO items(label) VALUES (?)', ['cancelled-query'])
    started.resolve()
    await tx.get('WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n) SELECT sum(x) AS total FROM n')
  }, { signal: controller.signal })
  const rejected = expect(pending).rejects.toMatchObject({ kind: 'interrupted' })
  await started.promise
  const timer = setTimeout(() => controller.abort(), 20)
  try { await rejected } finally { clearTimeout(timer) }
  expect(await db.all('SELECT id FROM items')).toEqual([])
})
it('handles cancellation before opening and while waiting for BEGIN without callback replay', async () => {
  const f = await fixture(), db = f.store({ busyTimeoutMs: 100 }), controller = new AbortController()
  const preAborted = new AbortController()
  preAborted.abort()
  let calls = 0
  await expect(db.transaction(async () => { calls++ }, { signal: preAborted.signal })).rejects.toMatchObject({ kind: 'interrupted' })
  await exec(f.db, 'BEGIN IMMEDIATE')
  const pending = db.transaction(async () => { calls++ }, { signal: controller.signal })
  const rejected = expect(pending).rejects.toMatchObject({ kind: 'interrupted' })
  const timer = setTimeout(() => controller.abort(), 20)
  try { await rejected } finally { clearTimeout(timer); await exec(f.db, 'ROLLBACK') }
  expect(calls).toBe(0)
  await db.run('INSERT INTO items(label) VALUES (?)', ['after-lock-abort'])
})
it('rolls back after a real child process is killed before commit', async () => {
  const f = await fixture(), db = f.store()
  const modulePath = path.resolve('dist/src/database/sqlite.js')
  const script = `const {createSqliteStore}=require(process.argv[1]); const store=createSqliteStore(process.argv[2]); store.transaction(async tx=>{await tx.run('INSERT INTO items(label) VALUES (?)',['uncommitted']); process.send('written'); await new Promise(()=>{});}).catch(()=>process.exit(2));`
  const child = spawn(process.execPath, ['-e', script, modulePath, f.filename], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] })
  let timer
  try {
    const message = await Promise.race([once(child, 'message'), new Promise((_resolve, reject) => { timer = setTimeout(() => reject(new Error('Child startup timeout')), 5000) })])
    expect(message[0]).toBe('written')
    const exited = once(child, 'exit')
    child.kill('SIGKILL')
    await exited
    expect(await db.all('SELECT label FROM items')).toEqual([])
    await db.run('INSERT INTO items(label) VALUES (?)', ['after-crash'])
  } finally { clearTimeout(timer); if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL') }
})
it('keeps main success independent from audit failure and disposes application stores', async () => {
  const app = await application()
  await app.context.sql.main.transaction(async tx => tx.run("INSERT INTO history(date,title) VALUES (?,?)", ['2026-10-23', 'committed despite audit failure']))
  await expect(app.context.sql.audit.run('INSERT INTO missing_audit_table(value) VALUES (?)', ['synthetic'])).rejects.toMatchObject({ kind: 'query' })
  expect(await app.context.sql.main.get('SELECT count(*) AS count FROM history WHERE title=?', ['committed despite audit failure'])).toEqual({ count: 1 })
  await app.close()
  await expect(app.context.sql.main.get('SELECT 1')).rejects.toMatchObject({ kind: 'scope' })
})
it('classifies native failures without including SQL or private error messages', () => {
  const error = classifySqliteError({ code: 'SQLITE_IOERR_WRITE', message: 'private input SQL' })
  expect(error).toMatchObject({ kind: 'unavailable', sqliteCode: 'SQLITE_IOERR_WRITE', retryable: false })
  expect(JSON.stringify(error)).not.toContain('private input')
  expect(() => createSqliteStore('relative.db')).toThrow('Database scope')
  expect(() => createSqliteStore(path.resolve('missing.db'), { busyTimeoutMs: 5001 })).toThrow('Database scope')
})

it('handles a burst of twelve same-process write transactions with four native worker threads', async () => {
  const f = await fixture()
  const result = await command(process.execPath, [path.resolve('tests/helpers/write-burst.cjs'), path.resolve('dist/src/database/sqlite.js'), f.filename], { env: { ...process.env, UV_THREADPOOL_SIZE: '4' }, timeout: 10000 })
  expect(JSON.parse(result.stdout)).toEqual({ callbacks: 12, fulfilled: 12, rejected: [] })
  expect(result.stderr).not.toContain('MaxListenersExceededWarning')
  expect(await f.store().get('SELECT count(*) AS count FROM items')).toEqual({ count: 12 })
})

it('keeps WAL reads concurrent while queued writes stay ordered and cancellation releases a slot', async () => {
  const db = (await fixture()).store(), started = ready(), release = ready(), controller = new AbortController(), order = []
  const first = db.transaction(async tx => {
    await tx.run('INSERT INTO items(label) VALUES (?)', ['first'])
    order.push('first'); started.resolve(); await release.promise
  })
  await started.promise
  const cancelled = db.transaction(async () => { order.push('must-not-run') }, { signal: controller.signal })
  const cancelledCheck = expect(cancelled).rejects.toMatchObject({ kind: 'interrupted' })
  const second = db.get('INSERT INTO items(label) VALUES (?) RETURNING id', ['second']).then(() => order.push('second'))
  const third = db.transaction(async tx => { await tx.run('INSERT INTO items(label) VALUES (?)', ['third']); order.push('third') })
  expect(await db.get('SELECT count(*) AS count FROM items')).toEqual({ count: 0 })
  controller.abort()
  await cancelledCheck
  release.resolve()
  await Promise.all([first, second, third])
  expect(order).toEqual(['first', 'second', 'third'])
  expect(await db.get('SELECT count(*) AS count FROM items')).toEqual({ count: 3 })
})

it('bounds same-store writer queue waiting without replaying callbacks', async () => {
  const db = (await fixture()).store({ busyTimeoutMs: 50 }), started = ready(), release = ready()
  const first = db.transaction(async tx => { await tx.run('INSERT INTO items(label) VALUES (?)', ['first']); started.resolve(); await release.promise })
  await started.promise
  let calls = 0
  try {
    await expect(db.transaction(async () => { calls++ })).rejects.toMatchObject({ kind: 'busy', retryable: true })
    expect(calls).toBe(0)
  } finally { release.resolve(); await first }
  expect(await db.get('SELECT count(*) AS count FROM items')).toEqual({ count: 1 })
})

it('caps pending writers and drains queued cancellations promptly on close', async () => {
  const db = (await fixture()).store(), started = ready()
  const first = db.transaction(async tx => { await tx.run('INSERT INTO items(label) VALUES (?)', ['rolled-back']); started.resolve(); await new Promise(() => {}) })
  await started.promise
  let calls = 0
  const queued = Array.from({ length: 129 }, () => db.transaction(async () => { calls++ }))
  const settled = Promise.allSettled([first, ...queued])
  await expect(queued.at(-1)).rejects.toMatchObject({ kind: 'busy' })
  const before = performance.now()
  await db.close()
  expect(performance.now() - before).toBeLessThan(1000)
  const results = await settled
  expect(results.every(result => result.status === 'rejected')).toBe(true)
  expect(calls).toBe(0)
})
