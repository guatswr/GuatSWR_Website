import { expect, test } from '@playwright/test'
import { PUBLIC_INDEX_PAGES } from '../../shared/seo'
import { EVENT_CATEGORIES } from './support/events-parity'

const origin = 'https://next.guatswr.top'
const graphs = (html: string) => [...html.matchAll(/<script\b([^>]*)type="application\/ld\+json"([^>]*)>([\s\S]*?)<\/script>/g)]
  .map(match => ({ attributes: match[1]! + match[2]!, data: JSON.parse(match[3]!) as { '@graph': Record<string, unknown>[] } }))

test('every actual public route has distinct SSR metadata, readable content and a nonce-bearing graph', async ({ request }) => {
  const titles = new Set<string>()
  for (const target of [...PUBLIC_INDEX_PAGES, { path: '/activity/1', title: '秋季例会' }]) {
    const response = await request.get(target.path)
    expect(response.status(), target.path).toBe(200)
    const html = await response.text()
    const title = html.match(/<title[^>]*>([^<]+)<\/title>/)?.[1] ?? ''
    expect(title).toContain(EVENT_CATEGORIES.find(category => category.path === target.path)?.title ?? target.title)
    expect(title.match(/桂航绯想天/g)).toHaveLength(1)
    expect(titles.has(title), `${target.path}: duplicate title`).toBe(false)
    titles.add(title)
    expect(html).toContain(`rel="canonical" href="${origin}${target.path}"`)
    expect(html).toMatch(/<main\b[\s\S]*<h1\b/)
    expect(response.headers()['x-robots-tag']).toContain('noindex')
    const nonce = response.headers()['content-security-policy']?.match(/'nonce-([^']+)'/)?.[1]
    expect(nonce).toBeTruthy()
    const output = graphs(html)
    expect(output).toHaveLength(1)
    expect(output[0]!.attributes).toContain(`nonce="${nonce}"`)
    const nodes = output[0]!.data['@graph']
    expect(nodes.some(node => node['@type'] === 'WebSite')).toBe(true)
    expect(nodes.some(node => node['@type'] === 'Organization')).toBe(true)
    expect(nodes.some(node => node['@type'] === 'BreadcrumbList')).toBe(true)
    expect(JSON.stringify(nodes)).not.toMatch(/"qq"|"visitor_ip"|"machine_sign"|"pilot_source"/)
  }
})

test('Article and Event nodes use known timestamps without inventing private fields or deadlines', async ({ request }) => {
  const article = graphs(await (await request.get('/activity/1')).text())[0]!.data['@graph']
    .find(node => node['@type'] === 'Article')
  expect(article).toMatchObject({ headline: '秋季例会 · 冰之妖精的茶会', datePublished: '2026-09-20T12:00:00Z' })
  const events = graphs(await (await request.get('/events/stg')).text())[0]!.data['@graph']
    .filter(node => node['@type'] === 'Event')
  expect(events.length).toBeGreaterThan(0)
  expect(events[0]).toMatchObject({ name: '秋季 STG 大会', startDate: '2026-11-11T20:00:00+08:00' })
  expect(events[0]).not.toHaveProperty('endDate')
})

test('preview robots and sitemap policy stays closed while the sole source contains only public URLs', async ({ request }) => {
  expect(await (await request.get('/robots.txt')).text()).toMatch(/Disallow:\s*\//)
  expect((await request.get('/sitemap.xml')).status()).toBe(404)
  const response = await request.get('/api/__sitemap__/urls?all=1&status=draft', {
    headers: { authorization: 'Bearer fixture-only', cookie: 'token=fixture-only' },
  })
  expect(response.status()).toBe(200)
  expect(response.headers()['cache-control']).toContain('no-store')
  const entries = await response.json() as { loc: string }[]
  const urls = entries.map(entry => entry.loc)
  for (const id of [1, 2, 3]) expect(urls).toContain(`${origin}/activity/${id}`)
  for (const id of [4, 5]) expect(urls).not.toContain(`${origin}/activity/${id}`)
  expect(urls.every(url => url.startsWith(`${origin}/`))).toBe(true)
  expect(urls.some(url => /login|admin|__revamp|api\//.test(url))).toBe(false)
  expect(new Set(urls).size).toBe(urls.length)
})

test('serves a discoverable recent RSS feed with stable links and no browser credentials', async ({ request }) => {
  const response = await request.get('/rss.xml?status=draft&all=1', {
    headers: { authorization: 'Bearer fixture-only', cookie: 'token=fixture-only' },
  })
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toContain('application/rss+xml')
  expect(response.headers()['cache-control']).toContain('no-store')
  const xml = await response.text()
  expect(xml).toContain('最近 20 条公开活动记录，按活动日期排序')
  expect(xml.match(/<item>/g)).toHaveLength(3)
  expect(xml).toContain(`${origin}/activity/1`)
  expect(xml).not.toContain(`${origin}/activity/4`)
  expect(xml).not.toMatch(/<script|credential-leak|token_version|visitor_ip/)
  expect(await (await request.get('/activities')).text()).toContain(`href="${origin}/rss.xml"`)
})

test('uses the trusted origin even when request host headers are hostile', async ({ request }) => {
  const response = await request.get('/activity/1?utm_source=evil', {
    headers: { host: 'evil.test', 'x-forwarded-host': 'evil.test' },
  })
  // Rejecting a foreign host is also safe; accepting it must never reflect it.
  expect([200, 400, 421]).toContain(response.status())
  if (response.status() === 200) {
    const html = await response.text()
    expect(html).toContain(`rel="canonical" href="${origin}/activity/1"`)
    expect(JSON.stringify(graphs(html))).not.toContain('evil.test')
  }
})

test('keeps canonical, social metadata and titles current after client filtering', async ({ page }) => {
  await page.goto('/members')
  await page.locator('main').getByRole('link', { name: '桂航', exact: false }).first().click()
  await expect(page).toHaveURL(/school=/)
  const canonical = `${origin}/members?school=${encodeURIComponent('桂航')}`
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', canonical)
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', canonical)
  expect((await page.title()).match(/桂航绯想天/g)).toHaveLength(1)
  const image = await page.locator('meta[property="og:image"]').getAttribute('content')
  expect(image).toBe(`${origin}/og-image.png`)
  const response = await page.request.get('/og-image.png')
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toContain('image/png')
})
