import { expect, test } from '@playwright/test'

test('serves readable SSR HTML with staging and security headers', async ({ request }) => {
  const response = await request.get('/')
  expect(response.ok()).toBeTruthy()
  const html = await response.text()
  expect(html).toContain('<h1')
  expect(html).toContain('桂航绯想天')
  expect(response.headers()['x-robots-tag']).toContain('noindex')
  expect(response.headers()['content-security-policy']).toContain("'nonce-")
  expect(response.headers()['x-content-type-options']).toBe('nosniff')
  const nonce = response.headers()['content-security-policy']?.match(/'nonce-([^']+)'/)?.[1]
  expect(nonce).toBeTruthy()
  expect(html).toContain(`nonce="${nonce}"`)
  // Check the warmed SWR response too; cached HTML must match its CSP nonce.
  const cached = await request.get('/')
  const cachedNonce = cached.headers()['content-security-policy']?.match(/'nonce-([^']+)'/)?.[1]
  expect(await cached.text()).toContain(`nonce="${cachedNonce}"`)
})

test('hydrates without browser errors or CSP violations', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text())
  })
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('桂航绯想天')
  // Capture the actual homepage; its visual design was approved by the user.
  await page.screenshot({ path: info.outputPath('foundation.png'), animations: 'disabled', scale: 'css' })
  expect(errors).toEqual([])
})

test('projects public config without forwarding browser credentials to v1', async ({ request }) => {
  const response = await request.get('/api/config', {
    headers: { Authorization: 'Bearer fixture-only', Cookie: 'token=fixture-only' },
  })
  expect(response.status()).toBe(200)
  expect(response.headers()['cache-control']).toContain('no-store')
  const config = await response.json()
  expect(config.home_bg).toBe('/uploads/fixture.webp')
  expect(config.banner_text).toBe('契约测试')
  expect(config).not.toHaveProperty('token_version')
  expect(JSON.stringify(config)).not.toContain('private-value')
})

test('does not index the staging site or expose source maps', async ({ request }) => {
  const robots = await request.get('/robots.txt')
  expect(await robots.text()).toMatch(/Disallow:\s*\//)
  expect((await request.get('/_nuxt/missing.js.map')).status()).toBe(404)
  expect((await request.get('/api/health')).headers()['cache-control']).toContain('no-store')
  expect((await request.get('/__revamp/layout')).status()).toBe(404)
})

test('serves precompressed production JavaScript', async ({ request }) => {
  const html = await (await request.get('/')).text()
  const asset = html.match(/<script[^>]+src="(\/_nuxt\/[^"]+\.js)"/)?.[1]
  expect(asset).toBeTruthy()
  const response = await request.get(asset!, { headers: { 'Accept-Encoding': 'gzip' } })
  expect(response.status()).toBe(200)
  expect(response.headers()['content-encoding']).toBe('gzip')
})

test('negotiates HTML compression without mixing cached variants or CSP nonces', async ({ request }) => {
  for (const encoding of ['gzip', 'identity', 'br', 'gzip;q=0, identity', 'gzip']) {
    const response = await request.get('/', { headers: { 'Accept-Encoding': encoding } })
    expect(response.status()).toBe(200)
    expect(response.headers()['vary']?.toLowerCase()).toContain('accept-encoding')
    const expected = encoding.includes('identity') ? undefined : encoding
    expect(response.headers()['content-encoding']).toBe(expected)
    const nonce = response.headers()['content-security-policy']?.match(/'nonce-([^']+)'/)?.[1]
    expect(nonce).toBeTruthy()
    const html = await response.text()
    expect(html).toContain('桂航绯想天')
    expect(html).toContain(`nonce="${nonce}"`)
  }
  expect((await request.get('/api/health')).headers()['content-encoding']).toBeUndefined()
})
