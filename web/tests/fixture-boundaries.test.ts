import { afterEach, describe, expect, it } from 'vitest'
import { createAuthUpstreamFixture } from './fixtures/auth-upstream.mjs'
import type { AuthUpstreamFixture } from './fixtures/auth-upstream.mjs'
import { readActivitiesPage, readActivity, readHistory, readMembers, readPublicConfig } from '../server/utils/public-read'

const fixtures: AuthUpstreamFixture[] = []
afterEach(async () => { await Promise.all(fixtures.splice(0).map(fixture => fixture.close())) })
async function start() {
  const fixture = createAuthUpstreamFixture()
  fixtures.push(fixture)
  const apiBase = `http://127.0.0.1:${await fixture.listen(0)}`
  return { apiBase }
}
async function enable(apiBase: string) {
  expect((await fetch(`${apiBase}/__fixture/admin`, { method: 'POST', body: JSON.stringify({ enable: true }) })).ok).toBe(true)
}

describe('fixture ownership and public contracts', () => {
  it('enabling admin preserves public lists, config and legacy-null activity details', async () => {
    const ctx = await start()
    const snapshot = () => Promise.all([
      readActivitiesPage(ctx, { page: 1, limit: 3 }), readActivity(ctx, 2),
      readMembers(ctx), readHistory(ctx), readPublicConfig(ctx),
    ])
    const before = await snapshot()
    expect(before[0].items.map(item => item.id)).toEqual([3, 2, 1])
    await enable(ctx.apiBase)
    expect(await snapshot()).toEqual(before)
    for (const id of [4, 5]) await expect(readActivity(ctx, id)).rejects.toMatchObject({ statusCode: 404 })
  })

  it('private mutations cannot modify another fixture instance or the immutable public seed', async () => {
    const first = await start(), second = await start()
    const baseline = await readActivity(second, 1)
    await enable(first.apiBase)
    const login = await fetch(`${first.apiBase}/api/auth/login`, { method: 'POST', body: JSON.stringify({ username: 'admin', password: 'adminpass' }) })
    expect(login.ok).toBe(true)
    const { token } = await login.json() as { token: string }
    const updated = await fetch(`${first.apiBase}/api/activities/1`, { method: 'PUT', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ title: 'Isolated fixture edit' }) })
    expect(updated.ok).toBe(true)
    expect((await readActivity(first, 1)).title).toBe('Isolated fixture edit')
    expect(await readActivity(second, 1)).toEqual(baseline)
    await enable(second.apiBase)
    expect(await readActivity(second, 1)).toEqual(baseline)
    const third = await start()
    expect(await readActivity(third, 1)).toEqual(baseline)
  })
})
