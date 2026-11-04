import { expect, test } from '@playwright/test'

test('readiness reflects dependency faults behind warm public cache while liveness stays up', async ({ request }) => {
  const authPort = Number(process.env.E2E_PORT_BASE ?? 3100) + 82
  const control = `http://127.0.0.1:${authPort}/__fixture/control`
  try {
    expect((await request.get('/api/health/ready')).status()).toBe(200)
    expect((await request.get('/api/config')).status()).toBe(200)
    await request.post(control, { data: { healthReady: false } })
    await expect.poll(async () => (await request.get('/api/health/ready')).status(), { timeout: 5000 }).toBe(503)
    const live = await request.get('/api/health/live')
    expect(live.status()).toBe(200)
    expect(await live.json()).toEqual({ status: 'ok', service: 'guatswr-web' })
    expect(live.headers()['cache-control']).toContain('no-store')
    await request.post(control, { data: { healthReady: true, publicConfigStatus: 403 } })
    await expect.poll(async () => (await (await request.get('/api/health')).json()).checks.publicConfig, { timeout: 5000 }).toBe('failed')
    expect((await request.get('/api/health')).status()).toBe(503)
    // The public cache still serves its valid DTO, but cannot make health green.
    expect((await request.get('/api/config')).status()).toBe(200)
    const failed = await request.get('/api/health/ready')
    expect(failed.headers()['cache-control']).toContain('no-store')
    expect(JSON.stringify(await failed.json())).not.toContain('synthetic')
  } finally {
    await request.post(control, { data: { healthReady: true, publicConfigStatus: null } })
    await expect.poll(async () => (await request.get('/api/health/ready')).status(), { timeout: 5000 }).toBe(200)
  }
})
