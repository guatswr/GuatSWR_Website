import { expect, it } from 'vitest'
import { withAdminUserLock } from '../server/utils/bff-admin-user-lock'

it('serializes fresh target checks and writes and releases a failed operation', async () => {
  const identity = {}
  let release!: () => void
  const hold = new Promise<void>(resolve => { release = resolve })
  const events: string[] = []
  const first = withAdminUserLock(identity, async () => { events.push('first'); await hold; throw new Error('upstream failed') })
  const caught = first.catch(error => error.message)
  const second = withAdminUserLock(identity, async () => { events.push('second'); return 2 })
  await Promise.resolve()
  expect(events).toEqual(['first'])
  release()
  expect(await caught).toBe('upstream failed')
  expect(await second).toBe(2)
  expect(events).toEqual(['first', 'second'])
  expect(await withAdminUserLock(identity, async () => 3)).toBe(3)
})

it('bounds pending work without blocking a different session store', async () => {
  const identity = {}
  let release!: () => void
  const hold = new Promise<void>(resolve => { release = resolve })
  const pending = Array.from({ length: 32 }, () => withAdminUserLock(identity, async () => { await hold; return 1 }))
  await expect(withAdminUserLock(identity, async () => 2)).rejects.toMatchObject({ statusCode: 503 })
  expect(await withAdminUserLock({}, async () => 3)).toBe(3)
  release()
  expect(await Promise.all(pending)).toHaveLength(32)
})
