import { createRequire } from 'node:module'
import { expect, it } from 'vitest'
import { fixture, run, get } from '../helpers/fixture.mjs'
const require = createRequire(import.meta.url)
const { createSignupRepository } = require('../../dist/src/modules/events/signup/repository.js')
const { createSignupService } = require('../../dist/src/modules/events/signup/service.js')
const input = { common_id: 'transaction fixture', qq: '12345', avatar: '/uploads/avatar.png' }
const identity = { userId: null, visitorIp: '203.0.113.99' }
const make = (store, options = {}) => createSignupService({ repository: createSignupRepository(store), notify: async () => {}, ...options })

it('checks the deadline after acquiring the writer, with no hook or row on rejection', async () => {
  const f = await fixture()
  const store = f.context.sql.main
  await run(f.db, 'UPDATE events SET content=? WHERE id=1', [JSON.stringify({ deadline: '2100-01-01T00:00:00Z' })])
  const deadline = Date.parse('2100-01-01T00:00:00Z')
  let now = deadline - 1
  let calls = 0
  const service = make(store, { now: () => now, notify: async () => { calls++ } })
  const entered = Promise.withResolvers(), release = Promise.withResolvers()
  const holding = store.transaction(async () => { entered.resolve(); await release.promise })
  await entered.promise
  const pending = service.signup(1, identity, input, null)
  const rejected = expect(pending).rejects.toMatchObject({ status: 403, message: '报名已截止' })
  now = deadline
  release.resolve()
  await holding
  await rejected
  expect(calls).toBe(0)
  expect(await service.find(1, identity)).toBeNull()
})

it('sees a state change committed by the preceding writer before accepting signup', async () => {
  const f = await fixture(), store = f.context.sql.main
  const entered = Promise.withResolvers(), release = Promise.withResolvers()
  const holding = store.transaction(async tx => {
    await tx.run("UPDATE events SET status='ended' WHERE id=1")
    entered.resolve(); await release.promise
  })
  await entered.promise
  const pending = make(store).signup(1, identity, input, null)
  const rejected = expect(pending).rejects.toMatchObject({ status: 403, message: '当前状态不允许报名' })
  release.resolve(); await holding; await rejected
  expect(await get(f.db, 'SELECT count(*) AS n FROM event_participants')).toEqual({ n: 1 })
})

it('commits eligibility and signup before a later state writer and emits only after commit', async () => {
  const f = await fixture(), store = f.context.sql.main
  const read = Promise.withResolvers(), release = Promise.withResolvers(), notified = Promise.withResolvers()
  const wrapped = { ...store, transaction: work => store.transaction(tx => work({ ...tx, get: async (...args) => {
    const value = await tx.get(...args); read.resolve(); await release.promise; return value
  } })) }
  const service = make(wrapped, { notify: async () => { notified.resolve(await store.get('SELECT common_id FROM event_participants WHERE visitor_ip=?', [identity.visitorIp])) } })
  const pending = service.signup(1, identity, input, null)
  await read.promise
  const change = store.run("UPDATE events SET status='ended' WHERE id=1")
  release.resolve(); await pending; await change
  expect(await notified.promise).toEqual({ common_id: input.common_id })
  expect(await get(f.db, 'SELECT status FROM events WHERE id=1')).toEqual({ status: 'ended' })
})

it('orders cancellation after a queued signup without leaving a row', async () => {
  const f = await fixture(), store = f.context.sql.main, service = make(store)
  const entered = Promise.withResolvers(), release = Promise.withResolvers()
  const holding = store.transaction(async () => { entered.resolve(); await release.promise })
  await entered.promise
  const signup = service.signup(1, identity, input, null)
  const cancel = service.remove(1, identity)
  release.resolve(); await holding; await signup; await cancel
  expect(await service.find(1, identity)).toBeNull()
})
