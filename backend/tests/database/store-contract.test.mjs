import { describe, expect, it } from 'vitest'
import { fixture } from './fixture.mjs'

describe.each(['postgres'])('%s shared database contract', driver => {
  it('binds numbered parameters by ordinal and preserves literal/comment dollar names', async () => {
    const { store } = await fixture(driver)
    expect(await store.get("SELECT CAST($2 AS BIGINT) AS second,CAST($1 AS BIGINT) AS first,CAST($2 AS BIGINT) AS repeated,'$3' AS literal /* $4 */", [11, 22]))
      .toEqual({ second: 22, first: 11, repeated: 22, literal: '$3' })
  })
  it('binds text/NULL/binary values and reports RETURNING metadata', async () => {
    const { store, bind } = await fixture(driver)
    const label = "'); DROP TABLE items; -- ? $1 中文"
    const bytes = Buffer.from([0, 255, 127])
    const saved = await store.run(`INSERT INTO items(label,value) VALUES(${bind(1)},${bind(2)})${driver === 'postgres' ? ' RETURNING id' : ''}`, [label, bytes])
    expect(saved).toEqual({ changes: 1, lastID: 1 })
    expect(await store.get(`SELECT label,parent_id,value FROM items WHERE id=${bind(1)}`, [1])).toEqual({ label, parent_id: null, value: bytes })
    expect(await store.get(`SELECT id FROM items WHERE id=${bind(1)}`, [-1])).toBeUndefined()
  })
  it('commits ordered operations and rolls back on domain errors', async () => {
    const { store, bind } = await fixture(driver)
    await store.transaction(async tx => {
      const saved = await tx.run(`INSERT INTO items(label) VALUES(${bind(1)}) RETURNING id`, ['parent'])
      await tx.run(`INSERT INTO items(label,parent_id) VALUES(${bind(1)},${bind(2)})`, ['child', saved.lastID])
    })
    const error = new Error('domain failure')
    await expect(store.transaction(async tx => { await tx.run('DELETE FROM items'); throw error })).rejects.toBe(error)
    expect(await store.all('SELECT label FROM items ORDER BY id')).toEqual([{ label: 'parent' }, { label: 'child' }])
  })
  it('rolls back even when a constraint error is caught by the callback', async () => {
    const { store, bind } = await fixture(driver)
    await expect(store.transaction(async tx => {
      await tx.run(`INSERT INTO items(label) VALUES(${bind(1)})`, ['same'])
      await tx.run(`INSERT INTO items(label) VALUES(${bind(1)})`, ['same']).catch(() => {})
    })).rejects.toMatchObject({ kind: 'constraint', retryable: false })
    expect(await store.all('SELECT id FROM items')).toEqual([])
    await expect(store.run(`INSERT INTO items(parent_id) VALUES(${bind(1)})`, [999])).rejects.toMatchObject({ kind: 'constraint' })
  })
  it('rejects nested/outer access, escaped executors and transaction control', async () => {
    const { store } = await fixture(driver)
    let escaped
    await store.transaction(async tx => {
      escaped = tx
      await expect(store.get('SELECT 1')).rejects.toMatchObject({ kind: 'scope' })
      await expect(store.transaction(async () => {})).rejects.toMatchObject({ kind: 'scope' })
      await expect(store.close()).rejects.toMatchObject({ kind: 'scope' })
    })
    await expect(escaped.get('SELECT 1')).rejects.toMatchObject({ kind: 'scope' })
    await expect(store.run('COMMIT')).rejects.toMatchObject({ kind: 'scope' })
  })
  it('isolates unrelated reads from a transaction that is rolled back', async () => {
    const { store, bind } = await fixture(driver)
    const started = Promise.withResolvers(), release = Promise.withResolvers()
    const pending = store.transaction(async tx => {
      await tx.run(`INSERT INTO items(label) VALUES(${bind(1)})`, ['uncommitted'])
      started.resolve(); await release.promise; throw Error('rollback')
    })
    const failed = expect(pending).rejects.toThrow('rollback')
    await started.promise
    try { expect(await store.all('SELECT id FROM items')).toEqual([]) }
    finally { release.resolve(); await failed }
  })
  it('cancels a stalled transaction without affecting an unrelated read', async () => {
    const { store, bind } = await fixture(driver)
    const controller = new AbortController(), started = Promise.withResolvers()
    const pending = store.transaction(async tx => {
      await tx.run(`INSERT INTO items(label) VALUES(${bind(1)})`, ['cancelled'])
      started.resolve(); await new Promise(() => {})
    }, { signal: controller.signal })
    const failed = expect(pending).rejects.toMatchObject({ kind: 'interrupted' })
    await started.promise
    controller.abort(); await failed
    expect(await store.all('SELECT id FROM items')).toEqual([])
  })
  it('rejects pre-aborted work without invoking the callback', async () => {
    const { store } = await fixture(driver)
    const controller = new AbortController(); controller.abort()
    let calls = 0
    await expect(store.transaction(async () => { calls++ }, { signal: controller.signal })).rejects.toMatchObject({ kind: 'interrupted' })
    expect(calls).toBe(0)
  })
  it('shares the outer-access prohibition across independent PostgreSQL pools', async () => {
    const { store } = await fixture(driver)
    const other = (await fixture('postgres')).store
    await store.transaction(async () => {
      await expect(other.get('SELECT 1')).rejects.toMatchObject({ kind: 'scope' })
      await expect(other.transaction(async () => {})).rejects.toMatchObject({ kind: 'scope' })
    })
  })
  it('closes idempotently and rejects new work', async () => {
    const { store } = await fixture(driver)
    const closing = store.close()
    expect(store.close()).toBe(closing)
    await closing
    await expect(store.get('SELECT 1')).rejects.toMatchObject({ kind: 'scope' })
  })
})
