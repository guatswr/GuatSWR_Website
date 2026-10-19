import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PUBLIC_DATA_POLICY, createPublicDataCache } from '../server/utils/public-cache'
import {
  invalidatePublicData,
  readCachedActivitiesPage,
  readCachedActivity,
  readCachedHistory,
  readCachedSiteConfig,
} from '../server/utils/public-data'
import { parseLogQuery, parsePageQuery, parseSchoolQuery, parseUmamiQuery } from '../server/utils/public-read'
import {
  handlePublicFixture,
  publicFixtureState,
  resetPublicFixtureState,
} from './fixtures/public-data.mjs'

const jsonHandler = (handler: (request: IncomingMessage, response: ServerResponse) => boolean) =>
  (request: IncomingMessage, response: ServerResponse): void => {
    if (handler(request, response)) return
    response.statusCode = 404
    response.setHeader('content-type', 'application/json')
    response.end('{"message":"Not Found"}')
  }

const startServer = async (
  handler: (request: IncomingMessage, response: ServerResponse) => boolean,
): Promise<{ apiBase: string, close: () => void }> => {
  const server = createServer(jsonHandler(handler))
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve)
  })
  const { port } = server.address() as AddressInfo
  return {
    apiBase: `http://127.0.0.1:${port}`,
    close: () => {
      server.closeAllConnections()
      server.close()
    },
  }
}

const statusOf = async (run: () => Promise<unknown>): Promise<number> => {
  try {
    await run()
    return 0
  }
  catch (error) {
    const status = (error as { statusCode?: number }).statusCode
    return typeof status === 'number' ? status : -1
  }
}

let fixtureServer: Awaited<ReturnType<typeof startServer>>

beforeAll(async () => {
  fixtureServer = await startServer(handlePublicFixture)
})

afterAll(() => {
  fixtureServer.close()
})

beforeEach(() => {
  resetPublicFixtureState()
})

describe('cached public data composition', () => {
  it('serves canonical defaults and supported pages from the cache without a second upstream read', async () => {
    const cache = createPublicDataCache()
    const first = await readCachedActivitiesPage(
      { apiBase: fixtureServer.apiBase },
      parsePageQuery({}),
      cache,
    )
    expect(publicFixtureState.requests).toHaveLength(1)
    expect(publicFixtureState.requests[0]?.path).toBe('/api/activities')
    expect(publicFixtureState.requests[0]?.search).toBe('?page=1&limit=20')
    expect(publicFixtureState.credentialHeaders).toEqual([])

    resetPublicFixtureState()
    const second = await readCachedActivitiesPage(
      { apiBase: fixtureServer.apiBase },
      parsePageQuery({ page: '1', limit: '20' }),
      cache,
    )
    expect(second).toEqual(first)
    expect(publicFixtureState.requests).toHaveLength(0)

    const secondPage = await readCachedActivitiesPage(
      { apiBase: fixtureServer.apiBase },
      parsePageQuery({ page: '2' }),
      cache,
    )
    expect(secondPage.page).toBe(2)
    expect(publicFixtureState.requests).toHaveLength(1)
    expect(publicFixtureState.requests[0]?.search).toBe('?page=2&limit=20')
  })

  it('rejects over-long or repeated key parameters in the parsers before any cache or upstream work', async () => {
    const cache = createPublicDataCache()
    const overLong = 'x'.repeat(51)
    const cases = [
      () => parseLogQuery({ username: overLong }),
      () => parseLogQuery({ action: overLong }),
      () => parseSchoolQuery({ school: overLong }),
      () => parseUmamiQuery({ startAt: '1'.repeat(16) }),
      () => parsePageQuery({ page: ['1', '2'] }),
    ]
    for (const run of cases) {
      expect(await statusOf(async () => run())).toBe(400)
    }
    expect(cache.size).toBe(0)
    expect(publicFixtureState.requests).toHaveLength(0)
  })

  it('separates backend origins in the cache key', async () => {
    const otherServer = await startServer(handlePublicFixture)
    try {
      const cache = createPublicDataCache()
      await readCachedHistory({ apiBase: fixtureServer.apiBase }, cache)
      await readCachedHistory({ apiBase: otherServer.apiBase }, cache)
      expect(publicFixtureState.requests).toHaveLength(2)
      await readCachedHistory({ apiBase: fixtureServer.apiBase }, cache)
      await readCachedHistory({ apiBase: otherServer.apiBase }, cache)
      expect(publicFixtureState.requests).toHaveLength(2)
    }
    finally {
      otherServer.close()
    }
  })

  it('fails the configured-origin check before a warm cache entry can be served', async () => {
    const cache = createPublicDataCache()
    const ctx = { apiBase: fixtureServer.apiBase }
    const first = await readCachedHistory(ctx, cache)
    resetPublicFixtureState()

    const invalidOrigins = [
      fixtureServer.apiBase.replace('http://', 'http://user:pass@'),
      `${fixtureServer.apiBase}/api`,
      `${fixtureServer.apiBase}/?query=1`,
      `${fixtureServer.apiBase}/#fragment`,
      fixtureServer.apiBase.replace('http://', 'ftp://'),
      'not a url',
    ]
    for (const apiBase of invalidOrigins) {
      const error = await readCachedHistory({ apiBase }, cache).catch((failure: unknown) => failure) as {
        statusCode?: number
        message?: string
      }
      expect(error.statusCode, apiBase).toBe(502)
      expect(String(error.message ?? ''), apiBase).not.toContain('user:pass')
      expect(String(error.message ?? ''), apiBase).not.toContain(apiBase)
    }
    expect(publicFixtureState.requests).toHaveLength(0)

    // The valid origin still serves the warm entry; nothing was poisoned.
    expect(await readCachedHistory(ctx, cache)).toEqual(first)
    expect(publicFixtureState.requests).toHaveLength(0)

    // Configuration keeps its own 502 shape and never leaks the raw origin.
    const configError = await readCachedSiteConfig(
      { apiBase: invalidOrigins[0]! },
      cache,
    ).catch((failure: unknown) => failure) as { statusCode?: number, statusMessage?: string }
    expect(configError.statusCode).toBe(502)
    expect(configError.statusMessage).toBe('Site configuration unavailable')
  })

  it('caches only projected site configuration', async () => {
    const cache = createPublicDataCache()
    const config = await readCachedSiteConfig({ apiBase: fixtureServer.apiBase }, cache)
    expect(config.home_bg).toBe('/uploads/fixture.webp')
    expect(config.banner_text).toBe('契约测试')
    expect(config).not.toHaveProperty('token_version')
    expect(JSON.stringify(config)).not.toContain('private-value')
    expect(publicFixtureState.credentialHeaders).toEqual([])

    resetPublicFixtureState()
    expect(await readCachedSiteConfig({ apiBase: fixtureServer.apiBase }, cache)).toEqual(config)
    expect(publicFixtureState.requests).toHaveLength(0)
  })

  it('refetches only the invalidated kind', async () => {
    const cache = createPublicDataCache()
    await readCachedActivitiesPage(
      { apiBase: fixtureServer.apiBase },
      parsePageQuery({}),
      cache,
    )
    await readCachedHistory({ apiBase: fixtureServer.apiBase }, cache)
    resetPublicFixtureState()

    cache.invalidate(['activities'])
    await readCachedActivitiesPage(
      { apiBase: fixtureServer.apiBase },
      parsePageQuery({}),
      cache,
    )
    expect(publicFixtureState.requests).toHaveLength(1)
    expect(publicFixtureState.requests[0]?.path).toBe('/api/activities')

    resetPublicFixtureState()
    await readCachedHistory({ apiBase: fixtureServer.apiBase }, cache)
    expect(publicFixtureState.requests).toHaveLength(0)
  })

  it('never caches a 404 for a non-public entity', async () => {
    const cache = createPublicDataCache()
    expect(await statusOf(() => readCachedActivity({ apiBase: fixtureServer.apiBase }, 999, cache))).toBe(404)
    expect(await statusOf(() => readCachedActivity({ apiBase: fixtureServer.apiBase }, 999, cache))).toBe(404)
    expect(publicFixtureState.requests).toHaveLength(2)
  })

  it('never caches an invalid configuration response', async () => {
    let calls = 0
    const malformed = await startServer((request, response) => {
      if (request.url !== '/api/config') return false
      calls += 1
      response.statusCode = 200
      response.setHeader('content-type', 'application/json')
      // `banner_text` must be a string; private keys must never masquerade as a
      // valid projection either.
      response.end(JSON.stringify({ banner_text: 42, token_version: 'private-value' }))
      return true
    })
    try {
      const cache = createPublicDataCache()
      expect(await statusOf(() => readCachedSiteConfig({ apiBase: malformed.apiBase }, cache))).toBe(502)
      expect(await statusOf(() => readCachedSiteConfig({ apiBase: malformed.apiBase }, cache))).toBe(502)
      expect(calls).toBe(2)
    }
    finally {
      malformed.close()
    }
  })

  it('exposes the typed invalidation contract on the process-wide cache', async () => {
    const ctx = { apiBase: fixtureServer.apiBase }
    const first = await readCachedHistory(ctx)
    resetPublicFixtureState()
    invalidatePublicData(['history'])
    expect(await readCachedHistory(ctx)).toEqual(first)
    expect(publicFixtureState.requests).toHaveLength(1)
    expect(publicFixtureState.requests[0]?.path).toBe('/api/history')
  })

  it('refreshes stale data in the background while serving the previous DTO', async () => {
    const clock = { time: 0 }
    const cache = createPublicDataCache({ now: () => clock.time })
    const first = await readCachedActivitiesPage(
      { apiBase: fixtureServer.apiBase },
      parsePageQuery({}),
      cache,
    )
    expect(publicFixtureState.requests).toHaveLength(1)

    clock.time = PUBLIC_DATA_POLICY.activities.freshMs + 1
    expect(await readCachedActivitiesPage(
      { apiBase: fixtureServer.apiBase },
      parsePageQuery({}),
      cache,
    )).toEqual(first)
    await cache.settled()
    expect(publicFixtureState.requests).toHaveLength(2)
  })
})
