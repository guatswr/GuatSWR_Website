import { expect, it } from 'vitest'
import { createAuthUpstreamFixture } from './fixtures/auth-upstream.mjs'

it('keeps Markdown detail records independent without changing ordinary public or admin datasets', async () => {
  const fixture = createAuthUpstreamFixture()
  const port = await fixture.listen()
  const get = async (path: string) => {
    const response = await fetch(`http://127.0.0.1:${port}${path}`)
    expect(response.status).toBe(200)
    return response.json()
  }
  try {
    const original = await get('/api/activities/1')
    const listing = await get('/api/activities')
    const advanced = await get('/api/activities/991')
    const math = await get('/api/activities/992')
    expect(advanced.id).toBe(991)
    expect(advanced.content).toContain('```mermaid')
    expect(math.id).toBe(992)
    expect(math.content).toContain('## 公式对照')
    expect(math.content).not.toContain('```mermaid')
    expect(await get('/api/activities/991')).toEqual(advanced)
    expect(await get('/api/activities/1')).toEqual(original)
    expect(await get('/api/activities')).toEqual(listing)
    expect((await get('/__fixture/admin')).enabled).toBe(false)
    expect((await fetch(`http://127.0.0.1:${port}/api/activities/993`)).status).toBe(404)
  }
  finally { await fixture.close() }
})
