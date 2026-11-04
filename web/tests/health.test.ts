import { describe, expect, it, vi } from 'vitest'
import { createWebHealthProbe } from '../server/utils/health'

const backend = { status: 'ready', service: 'guatswr-backend' }
describe('web business readiness', () => {
  it('reads both backend readiness and uncached public config without visitor headers', async () => {
    const paths: string[] = []
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const path = new URL(String(input)).pathname
      paths.push(path)
      expect(init?.headers).toEqual({ accept: 'application/json' })
      expect(init?.redirect).toBe('error')
      return Response.json(path.endsWith('/ready') ? backend : { banner_text: null })
    })
    const result = await createWebHealthProbe('http://backend:3000', fetcher)()
    expect(result).toEqual({ status: 'ready', service: 'guatswr-web', checks: { backend: 'ok', publicConfig: 'ok' } })
    expect(paths.sort()).toEqual(['/api/config', '/api/health/ready'])
  })
  it.each([403, 429, 500])('does not hide a %s public read behind healthy backend or a cached DTO', async status => {
    const fetcher = vi.fn(async (input: string | URL | Request) => new URL(String(input)).pathname.endsWith('/ready')
      ? Response.json(backend) : new Response('private details', { status }))
    const result = await createWebHealthProbe('http://backend:3000', fetcher)()
    expect(result.status).toBe('not_ready')
    expect(result.checks).toEqual({ backend: 'ok', publicConfig: 'failed' })
    expect(JSON.stringify(result)).not.toContain('private')
  })
  it('rejects a fake successful response, HTML, oversized JSON and invalid upstream configuration', async () => {
    for (const response of [Response.json({ status: 'online' }), new Response('<html>error</html>'), new Response('x', { headers: { 'content-length': String(2 * 1024 * 1024) } })]) {
      const fetcher = vi.fn(async () => response.clone())
      expect((await createWebHealthProbe('http://backend:3000', fetcher)()).status).toBe('not_ready')
    }
    expect(() => createWebHealthProbe('http://user:secret@backend:3000')).toThrow()
  })
})
