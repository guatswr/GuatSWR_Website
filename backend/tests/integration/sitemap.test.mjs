import { expect, it } from 'vitest'
import { fixture, run } from '../helpers/fixture.mjs'

it('preserves sitemap visibility, text dates, XML escaping, ordering and no-cache headers', async () => {
  const f = await fixture({ env: { SITE_URL: 'https://example.test/root&branch/' } })
  await run(f.db, "INSERT INTO activities(id,title,date,status,created_at,deleted_at) VALUES(10,'prefix date','2026-02-03 trailing','published','2026-01-01',NULL),(11,'invalid date','not-a-date',NULL,'2026-01-01',NULL),(12,'soft deleted','2026-01-01','published','2026-01-01','2026-01-02')")
  const response = await f.http.get('/sitemap.xml')
  expect(response.status).toBe(200)
  expect(response.headers['content-type']).toContain('application/xml')
  expect(response.headers['cache-control']).toBe('no-store, no-cache, must-revalidate, proxy-revalidate')
  expect(response.headers.pragma).toBe('no-cache')
  expect(response.headers.expires).toBe('0')
  expect(response.text.match(/<url>/g)).toHaveLength(11)
  expect(response.text).toContain('<loc>https://example.test/root&amp;branch/activity/10</loc>\n    <lastmod>2026-02-03</lastmod>')
  expect(response.text).toContain('<loc>https://example.test/root&amp;branch/activity/11</loc>\n    <changefreq>weekly</changefreq>')
  expect(response.text).not.toMatch(/\/activity\/(2|12)</)
  expect(response.text.indexOf('/activity/11')).toBeLessThan(response.text.indexOf('/activity/10'))
})

it('retains the request protocol/host fallback when SITE_URL is absent', async () => {
  const f = await fixture()
  const response = await f.http.get('/sitemap.xml').set('Host', 'custom.example.test').set('X-Forwarded-Proto', 'https')
  expect(response.text).toContain('<loc>http://custom.example.test/</loc>')
})

it('keeps sitemap database failures as a plain safe 500 response', async () => {
  const f = await fixture()
  await run(f.db, 'DROP TABLE activities')
  const response = await f.http.get('/sitemap.xml')
  expect(response.status).toBe(500)
  expect(response.text).toBe('Server Error')
})
