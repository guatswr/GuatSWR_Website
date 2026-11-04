import { expect, it } from 'vitest'
import { fixture, get, run } from '../helpers/fixture.mjs'

it('performs main and audit reads without writing data or charging visitor quotas', async () => {
  const f = await fixture({ env: { GLOBAL_RATE_LIMIT: '1' } })
  for (let index = 0; index < 5; index++) {
    const response = await f.http.get('/api/health/ready')
    expect(response.status).toBe(200)
    expect(response.headers['cache-control']).toBe('no-store')
    expect(response.body).toEqual({ status: 'ready', service: 'guatswr-backend', checks: { mainDatabase: 'ok', auditDatabase: 'ok' } })
    expect((await f.http.get('/api/health/live')).status).toBe(200)
  }
  expect((await get(f.db, 'SELECT count(*) AS n FROM banned_ips')).n).toBe(0)
  expect((await f.http.get('/api/config')).status).toBe(200)
  expect((await f.http.get('/api/config')).status).toBe(429)
  await expect.poll(async () => (await get(f.db, 'SELECT count(*) AS n FROM banned_ips')).n).toBe(1)
  expect((await f.http.get('/api/health/ready')).status).toBe(200)
})

for (const [name, field, table] of [['mainDatabase', 'db', 'site_config'], ['auditDatabase', 'logDb', 'audit_logs']]) {
  it(`marks ${name} unavailable while the process remains live, then recovers`, async () => {
    const f = await fixture()
    await run(f[field], `ALTER TABLE ${table} RENAME TO unavailable_health_table`)
    const failed = await f.http.get('/api/health/ready')
    expect(failed.status).toBe(503)
    expect(failed.body.status).toBe('not_ready')
    expect(failed.body.checks[name]).toBe('failed')
    expect(JSON.stringify(failed.body)).not.toMatch(/SQLITE|unavailable_health_table|password/)
    expect((await f.http.get('/api/health/live')).body.status).toBe('ok')
    await run(f[field], `ALTER TABLE unavailable_health_table RENAME TO ${table}`)
    await expect.poll(async () => (await f.http.get('/api/health/ready')).status, { timeout: 4000 }).toBe(200)
  })
}
