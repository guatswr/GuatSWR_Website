import { expect, test } from '@playwright/test'

/**
 * Public HTML is never cached as a rendered document: every GET/HEAD must get a
 * fresh CSP nonce matching every nonce attribute, private revalidation headers,
 * and no ETag/Last-Modified that could produce a 304 replay. Only the
 * server-side projected-data reads use SWR.
 */

const nonceOf = (csp: string | undefined): string => {
  const nonce = csp?.match(/'nonce-([^']+)'/)?.[1]
  expect(nonce, 'CSP must carry a nonce').toBeTruthy()
  return nonce!
}

const attrNonces = (html: string): string[] =>
  [...html.matchAll(/\snonce="([^"]+)"/g)].map(match => match[1]!)

test('renders a fresh nonce on repeated GET and HEAD responses with private, validator-free caching', async ({ request }) => {
  const seen = new Set<string>()
  for (let index = 0; index < 3; index += 1) {
    const response = await request.get('/')
    expect(response.status()).toBe(200)
    const headers = response.headers()
    expect(headers['cache-control']).toContain('private')
    expect(headers['cache-control']).toContain('no-cache')
    expect(headers['cache-control']).toContain('max-age=0')
    expect(headers['cache-control']).toContain('must-revalidate')
    expect(headers['cache-control']).not.toContain('no-store')
    expect(headers.etag).toBeUndefined()
    expect(headers['last-modified']).toBeUndefined()

    const nonce = nonceOf(headers['content-security-policy'])
    const attributes = attrNonces(await response.text())
    expect(attributes.length).toBeGreaterThan(0)
    expect([...new Set(attributes)]).toEqual([nonce])
    seen.add(nonce)
  }
  expect(seen.size).toBe(3)

  const head = await request.head('/')
  expect(head.status()).toBe(200)
  expect(head.headers()['cache-control']).toContain('private')
  expect(head.headers()['cache-control']).toContain('no-cache')
  expect(head.headers().etag).toBeUndefined()
  expect(head.headers()['last-modified']).toBeUndefined()
  expect(nonceOf(head.headers()['content-security-policy'])).toBeTruthy()

  // A request carrying user cookies must stay the same public document: the
  // nonce still matches and no user payload enters the response.
  const withCookies = await request.get('/', {
    headers: { Authorization: 'Bearer fixture-only', Cookie: 'token=fixture-only' },
  })
  expect(withCookies.status()).toBe(200)
  const cookieNonce = nonceOf(withCookies.headers()['content-security-policy'])
  const cookieHtml = await withCookies.text()
  expect(attrNonces(cookieHtml)).toEqual(expect.arrayContaining([cookieNonce]))
  expect(cookieHtml).not.toContain('credential-leak')
  expect(cookieHtml).toContain('桂航绯想天')
})

test('ignores conditional validators instead of returning 304 for nonce-bearing HTML', async ({ request }) => {
  const response = await request.get('/', {
    headers: {
      'If-None-Match': '"stale-html"',
      'If-Modified-Since': 'Wed, 21 Oct 2015 07:28:00 GMT',
    },
  })
  expect(response.status()).toBe(200)
  expect(response.headers().etag).toBeUndefined()
  const nonce = nonceOf(response.headers()['content-security-policy'])
  expect(attrNonces(await response.text())).toEqual(expect.arrayContaining([nonce]))
})

test('keeps public HTML compression while preserving the fresh nonce for each negotiation', async ({ request }) => {
  for (const encoding of ['gzip', 'identity', 'br', 'gzip;q=0, identity']) {
    const response = await request.get('/', { headers: { 'Accept-Encoding': encoding } })
    expect(response.status()).toBe(200)
    expect(response.headers()['vary']?.toLowerCase()).toContain('accept-encoding')
    const expected = encoding.includes('identity') ? undefined : encoding
    expect(response.headers()['content-encoding']).toBe(expected)
    const nonce = nonceOf(response.headers()['content-security-policy'])
    const attributes = attrNonces(await response.text())
    expect([...new Set(attributes)]).toEqual([nonce])
  }

  // The maintained compression middleware deliberately skips HEAD bodies but
  // still answers HEAD successfully with the private policy and a nonce.
  const head = await request.head('/', { headers: { 'Accept-Encoding': 'gzip' } })
  expect(head.status()).toBe(200)
  expect(head.headers()['content-encoding']).toBeUndefined()
  expect(head.headers()['cache-control']).toContain('private')
  expect(nonceOf(head.headers()['content-security-policy'])).toBeTruthy()
})

test('keeps browser JSON APIs no-store and credential-independent while server reads cache', async ({ request }) => {
  for (const path of ['/api/config', '/api/activities', '/api/history']) {
    const response = await request.get(path, {
      headers: { Authorization: 'Bearer fixture-only', Cookie: 'token=fixture-only' },
    })
    expect(response.status(), path).toBe(200)
    expect(response.headers()['cache-control'], path).toContain('no-store')
    expect(response.headers().etag).toBeUndefined()
  }

  // The fixture answers with a `credential-leak` marker if the public BFF
  // forwards browser credentials to the upstream read.
  const config = await (await request.get('/api/config', {
    headers: { Authorization: 'Bearer fixture-only', Cookie: 'token=fixture-only' },
  })).json()
  expect(config.home_bg).not.toBe('credential-leak')
  expect(config).not.toHaveProperty('token_version')
  expect(JSON.stringify(config)).not.toContain('private-value')

  // There is deliberately no anonymous invalidation endpoint.
  expect((await request.get('/api/revalidate')).status()).toBe(404)
  expect((await request.post('/api/revalidate')).status()).toBe(404)

  // Repeated reads use the server-side projected cache; the browser response
  // still must not become cacheable and must not gain user payload.
  const repeated = await request.get('/api/config', {
    headers: { Authorization: 'Bearer another-user', Cookie: 'token=another-user' },
  })
  expect(repeated.headers()['cache-control']).toContain('no-store')
  expect((await repeated.json()).home_bg).toBe(config.home_bg)
})

test('keeps staged noindex while serving fresh public HTML', async ({ request }) => {
  const response = await request.get('/')
  expect(response.headers()['x-robots-tag']).toContain('noindex')
  expect(await (await request.get('/robots.txt')).text()).toMatch(/Disallow:\s*\//)
})
