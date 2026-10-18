import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  parseLogQuery,
  parsePageQuery,
  parsePublicId,
  parseSchoolQuery,
  parseStatsLimit,
  parseUmamiQuery,
  readActivitiesPage,
  readActivity,
  readEvent,
  readEventParticipants,
  readEventsPage,
  readHistory,
  readLogStats,
  readLogsPage,
  readMembers,
  readSchoolStats,
  readUmamiStats,
  resolveUpstreamTimeout,
} from '../server/utils/public-read'
import type { PublicReadContext } from '../server/utils/public-read'
import {
  PUBLIC_IMAGE_MAX_BYTES,
  capImageStream,
  fetchPublicImage,
  imageContentType,
  matchesImageContentType,
  publicImageHeaders,
} from '../server/utils/public-image'
import { uploadAssetUrl } from '../server/utils/upstream'
import {
  UMAMI_DEFAULT_END_AT,
  UMAMI_DEFAULT_START_AT,
  handlePublicFixture,
  publicActivitiesFixture,
  publicEventParticipantsFixture,
  publicEventsFixture,
  publicFixtureState,
  publicImageFixture,
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
      // Tests that cancel mid-body leave half-written responses behind.
      server.closeAllConnections()
      server.close()
    },
  }
}

/** HTTP status of a rejected read, or 0 when it unexpectedly succeeded. */
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

const delay = (ms: number): Promise<void> => new Promise((resolve) => {
  setTimeout(resolve, ms)
})

const chunksOf = (...sizes: number[]): ReadableStream<Uint8Array> => new ReadableStream<Uint8Array>({
  start(controller) {
    for (const size of sizes) controller.enqueue(new Uint8Array(size))
    controller.close()
  },
})

const drain = async (stream: ReadableStream<Uint8Array>): Promise<{ bytes: number, failed: boolean }> => {
  const reader = stream.getReader()
  let bytes = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) return { bytes, failed: false }
      bytes += value.byteLength
    }
  }
  catch {
    return { bytes, failed: true }
  }
}

let fixtureServer: Awaited<ReturnType<typeof startServer>>
let ctx: PublicReadContext

beforeAll(async () => {
  fixtureServer = await startServer(handlePublicFixture)
  ctx = { apiBase: fixtureServer.apiBase }
})

afterAll(() => {
  fixtureServer.close()
})

describe('public read adapters', () => {
  it('pages activities with the frozen envelope and projected rows', async () => {
    const page = await readActivitiesPage(ctx, { page: 1, limit: 3 })
    expect(page.total).toBe(3)
    expect(page.page).toBe(1)
    expect(page.limit).toBe(3)
    expect(page.items.map(item => item.id)).toEqual([3, 2, 1])
    const first = page.items[0]!
    expect(first.title).toBe('夏日冰祭 · 琪露诺主题日')
    expect(first.images).toEqual(['/uploads/img/activity/3/photo.png'])
    expect(first.created_by).toBeNull()
    expect(first.created_by_avatar).toBeNull()
    // Metadata lists never carry raw Markdown; the detail reader does.
    expect(first.content).toBe('')
    expect(Object.hasOwn(first, 'status')).toBe(false)
    expect(Object.hasOwn(first, 'deleted_at')).toBe(false)
    const empty = await readActivitiesPage(ctx, { page: 2, limit: 3 })
    expect(empty.items).toEqual([])
  })

  it('joins public author display columns on an activity detail', async () => {
    const activity = await readActivity(ctx, 1)
    expect(activity.created_by).toBe('Taropoi')
    expect(activity.created_by_avatar).toBe('/uploads/img/user/1-thumb.webp')
    expect(activity.updated_by).toBeNull()
    expect(activity.images).toHaveLength(2)
    expect(activity.content.includes('例会记录')).toBe(true)
    expect((await readActivity(ctx, 3)).updated_by).toBe('Cirno')
  })

  it('answers 404 for draft, deleted and missing activities', async () => {
    expect(await statusOf(() => readActivity(ctx, 4))).toBe(404)
    expect(await statusOf(() => readActivity(ctx, 5))).toBe(404)
    expect(await statusOf(() => readActivity(ctx, 999))).toBe(404)
  })

  it('keeps public member thumbnails and drops deletion metadata', async () => {
    const members = await readMembers(ctx)
    expect(members).toHaveLength(3)
    expect(members[0]!.avatar).toBe('/uploads/img/user/1-thumb.webp')
    expect(members[0]!.avatar_original).toBe('/uploads/img/user/1.png')
    expect(members[0]!.tags).toEqual(['STG', '东方'])
    expect(Object.hasOwn(members[0]!, 'deleted_at')).toBe(false)
    expect(Object.hasOwn(members[0]!, 'deleted_by')).toBe(false)
    expect((await readMembers(ctx, '桂电')).map(member => member.name)).toEqual(['Taropoi'])
  })

  it('returns the school distribution as school/count pairs', async () => {
    const stats = await readSchoolStats(ctx)
    const counts = new Map(stats.map(entry => [entry.school, entry.count]))
    expect(counts.get('桂航')).toBe(1)
    expect(counts.get('桂电')).toBe(1)
    expect(counts.get('')).toBe(1)
  })

  it('orders history and excludes deleted entries', async () => {
    const entries = await readHistory(ctx)
    expect(entries.map(entry => entry.id)).toEqual([1, 2])
    expect(entries[0]!.date).toBe('2025-09-01')
    expect(Object.hasOwn(entries[0]!, 'deleted_at')).toBe(false)
  })

  it('projects nested event content without visitor metadata or person qq', async () => {
    const page = await readEventsPage(ctx, { page: 1, limit: 20 })
    expect(page.total).toBe(4)
    const stg = page.items.find(item => item.id === 101)!
    expect(stg.status).toBe('published')
    expect(stg.created_by).toBe('Taropoi')
    expect(Object.hasOwn(stg, 'visitor_ip')).toBe(false)
    expect(Object.hasOwn(stg.content, 'visitor_ip')).toBe(false)
    expect(stg.content.results).toEqual([
      { rank: 1, id: 'Cirno', player_id: '', avatar: '/uploads/img/user/1-thumb.webp' },
      { rank: 2, id: 'Taropoi', player_id: '', avatar: '/uploads/img/user/2-thumb.webp' },
    ])
    expect(stg.content.results_updated_at).toBe('2026-11-12T00:30:00+08:00')
    expect(stg.content.initiator).toBeNull()
    const bet = page.items.find(item => item.id === 102)!
    expect(bet.content.a).toEqual({ id: 'Cirno', avatar: '/uploads/img/user/1-thumb.webp', goal: '十局七胜' })
    expect(bet.content.b).toEqual({ id: 'Reimu', avatar: '/uploads/img/user/3-thumb.webp', goal: '全胜' })
    const bounty = page.items.find(item => item.id === 105)!
    expect(bounty.content.initiator).toEqual({ id: 'Taropoi', avatar: '/uploads/img/user/2-thumb.webp', goal: '' })
    expect(page.items.find(item => item.id === 103)!.content.gather_type).toBe('饭聚')
  })

  it('filters events by type and hides non-public details', async () => {
    const stg = await readEventsPage(ctx, { page: 1, limit: 20 }, 'STG')
    expect(stg.items.map(item => item.id)).toEqual([101])
    expect((await readEvent(ctx, 101)).title).toBe('秋季 STG 大会')
    expect(await statusOf(() => readEvent(ctx, 104))).toBe(404)
    expect(await statusOf(() => readEvent(ctx, 999))).toBe(404)
  })

  it('keeps public signup fields and drops visitor identity', async () => {
    const participants = await readEventParticipants(ctx, 101)
    expect(participants).toHaveLength(3)
    expect(participants[0]!.qq).toBe('10001')
    expect(participants[0]!.machine_sign).toBe('⑨')
    expect(Object.hasOwn(participants[0]!, 'visitor_ip')).toBe(false)
    expect(Object.hasOwn(participants[0]!, 'user_id')).toBe(false)
    expect(Object.hasOwn(participants[0]!, 'event_id')).toBe(false)
    expect(await statusOf(() => readEventParticipants(ctx, 103))).toBe(400)
    expect(await statusOf(() => readEventParticipants(ctx, 104))).toBe(404)
    expect(await statusOf(() => readEventParticipants(ctx, 999))).toBe(404)
  })
})

describe('public log and statistics adapters', () => {
  it('uses the { total, logs } envelope and drops joined user ids', async () => {
    const page = await readLogsPage(ctx, parseLogQuery({}))
    expect(page.total).toBe(13)
    expect(page.logs).toHaveLength(13)
    expect(Object.hasOwn(page.logs[0]!, 'user_id')).toBe(false)
    expect(page.logs[0]!.user_avatar).toBe('/uploads/img/user/1-thumb.webp')
    expect((await readLogsPage(ctx, parseLogQuery({ action: 'CREATE' }))).total).toBe(3)
    const anonymous = page.logs.find(log => log.id === 4)!
    expect(anonymous.username).toBe('')
    expect(anonymous.user_avatar).toBeNull()
  })

  it('projects the contribution ranking without user ids', async () => {
    const stats = await readLogStats(ctx, parseStatsLimit({}))
    expect(stats).toHaveLength(2)
    expect(stats[0]!.username).toBe('Taropoi')
    expect(stats[0]!.count).toBe(12)
    expect(Object.hasOwn(stats[0]!, 'user_id')).toBe(false)
  })

  it('normalizes the umami envelope and drops unknown analytics keys', async () => {
    const stats = await readUmamiStats(ctx, parseUmamiQuery({}))
    expect(stats.summary).toEqual({ pageviews: 1280, visitors: 412, visits: 530, bounces: 96, totaltime: 41200 })
    expect(Object.hasOwn(stats.summary, 'comparison')).toBe(false)
    expect(stats.series.pageviews).toEqual([{ x: '2026-10-01', y: 180 }, { x: '2026-10-02', y: 220 }])
    expect(Object.hasOwn(stats.series.pageviews[1]!, 'extra')).toBe(false)
    expect(stats.meta.limit).toBe(10)
    expect(stats.meta.startAt).toBe(UMAMI_DEFAULT_START_AT)
    expect(stats.meta.endAt).toBe(UMAMI_DEFAULT_END_AT)
    expect(stats.top.environments[0]!.x).toBe('Chrome')
  })
})

describe('query and path validation', () => {
  it('clamps pagination exactly like the frozen v1 routes', () => {
    expect(parsePageQuery({})).toEqual({ page: 1, limit: 20 })
    expect(parsePageQuery({ page: '2', limit: '500' })).toEqual({ page: 2, limit: 100 })
    expect(parsePageQuery({ page: '0', limit: '0' })).toEqual({ page: 1, limit: 1 })
    expect(parseStatsLimit({})).toBe(10)
    expect(parseStatsLimit({ limit: '3' })).toBe(3)
  })

  it('rejects malformed query values with 400 instead of forwarding them', async () => {
    expect(await statusOf(() => parsePageQuery({ page: 'abc' }))).toBe(400)
    expect(await statusOf(() => parsePageQuery({ page: ['1', '2'] }))).toBe(400)
    expect(await statusOf(() => parsePageQuery({ limit: { nested: true } }))).toBe(400)
    expect(await statusOf(() => parseSchoolQuery({ school: '界'.repeat(51) }))).toBe(400)
  })

  it('normalizes filters and unknown analytics options', () => {
    expect(parseSchoolQuery({ school: '  桂航  ' })).toBe('桂航')
    expect(parseSchoolQuery({ school: '   ' })).toBeUndefined()
    const umami = parseUmamiQuery({ unit: 'week', envType: 'robot', limit: '99' })
    expect(umami.unit).toBe('day')
    expect(umami.envType).toBe('browser')
    expect(umami.limit).toBe(50)
    expect(parseUmamiQuery({ startAt: '1759248000000' }).startAt).toBe(1759248000000)
  })

  it('validates resource identifiers before any upstream request', async () => {
    expect(parsePublicId('7')).toBe(7)
    expect(await statusOf(() => parsePublicId('0'))).toBe(400)
    expect(await statusOf(() => parsePublicId('7.5'))).toBe(400)
    expect(await statusOf(() => parsePublicId(undefined))).toBe(400)
  })
})

describe('private upstream boundary', () => {
  it('never forwards browser credentials and never forwards admin filters', async () => {
    resetPublicFixtureState()
    await readActivitiesPage(ctx, parsePageQuery({ all: '1', includeDeleted: '1', status: 'draft' }))
    await readMembers(ctx, parseSchoolQuery({ includeDeleted: '1', original: '1' }))
    await readLogsPage(ctx, parseLogQuery({}))
    expect(publicFixtureState.credentialHeaders).toEqual([])
    const urls = publicFixtureState.requests.map(entry => `${entry.path}${entry.search}`)
    expect(urls.some(url => url.startsWith('/api/activities'))).toBe(true)
    expect(urls.some(url => url.startsWith('/api/logs'))).toBe(true)
    expect(urls.every(url => !url.includes('all=1') && !url.includes('includeDeleted') && !url.includes('original=1'))).toBe(true)
  })

  it('filters private rows and redacts unknown nested keys from a leaky upstream', async () => {
    const leaked = publicEventsFixture[0]!
    const leaky = await startServer((request, response) => {
      response.setHeader('content-type', 'application/json')
      const path = request.url ?? '/'
      if (path === '/api/event/101') {
        response.end(JSON.stringify({
          ...leaked,
          content: { ...leaked.content, visitor_ip: '203.0.113.9', debug: 'internal' },
        }))
        return true
      }
      if (path.startsWith('/api/event/')) {
        response.end(JSON.stringify({ items: publicEventParticipantsFixture }))
        return true
      }
      if (path.startsWith('/api/activities')) {
        response.end(JSON.stringify({
          total: publicActivitiesFixture.length,
          page: 1,
          limit: 20,
          items: publicActivitiesFixture,
        }))
        return true
      }
      return false
    })
    try {
      const page = await readActivitiesPage({ apiBase: leaky.apiBase }, { page: 1, limit: 20 })
      expect(page.items.map(item => item.id)).toEqual([3, 2, 1])
      const detail = await readEvent({ apiBase: leaky.apiBase }, 101)
      expect(Object.hasOwn(detail.content, 'visitor_ip')).toBe(false)
      expect(Object.hasOwn(detail.content, 'debug')).toBe(false)
      const participants = await readEventParticipants({ apiBase: leaky.apiBase }, 101)
      expect(Object.hasOwn(participants[0]!, 'visitor_ip')).toBe(false)
      expect(Object.hasOwn(participants[0]!, 'user_id')).toBe(false)
    }
    finally {
      leaky.close()
    }
  })

  it('maps upstream failures to 502 without serializing upstream bodies', async () => {
    const broken = await startServer((request, response) => {
      response.setHeader('content-type', 'application/json')
      const path = request.url ?? '/'
      if (path.startsWith('/api/history')) {
        response.end('{"items":"not an array"}')
        return true
      }
      if (path.startsWith('/api/members')) {
        response.end('not json at all')
        return true
      }
      if (path.startsWith('/api/activities/')) {
        response.statusCode = 500
        response.end('{"error":"SQLITE_ERROR: no such table: activities"}')
        return true
      }
      if (path.startsWith('/api/logs')) {
        response.statusCode = 302
        response.setHeader('location', 'http://127.0.0.1:1/elsewhere')
        response.end()
        return true
      }
      return false
    })
    try {
      expect(await statusOf(() => readHistory({ apiBase: broken.apiBase }))).toBe(502)
      expect(await statusOf(() => readMembers({ apiBase: broken.apiBase }))).toBe(502)
      expect(await statusOf(() => readSchoolStats({ apiBase: broken.apiBase }))).toBe(502)
      expect(await statusOf(() => readLogsPage({ apiBase: broken.apiBase }, parseLogQuery({})))).toBe(502)
      expect(await statusOf(() => readActivity({ apiBase: broken.apiBase }, 1))).toBe(502)
      expect(await statusOf(() => readHistory({ apiBase: 'not a url' }))).toBe(502)
      expect(await statusOf(() => readHistory({ apiBase: 'https://user:pass@example.com' }))).toBe(502)
      const failure = await readActivity({ apiBase: broken.apiBase }, 1).catch((error: unknown) => error) as {
        statusCode?: number
        message?: string
        data?: unknown
      }
      expect(failure.statusCode).toBe(502)
      expect(failure.message?.includes('SQLITE_ERROR')).toBe(false)
      expect(failure.data).toBeUndefined()
    }
    finally {
      broken.close()
    }
  })
})

describe('uploads proxy boundary', () => {
  const origin = 'http://127.0.0.1:8080'

  it('resolves approved image paths on the configured origin only', () => {
    expect(uploadAssetUrl(origin, '/uploads/fixture.webp')).toBe(`${origin}/uploads/fixture.webp`)
    expect(uploadAssetUrl(origin, '/uploads/img/activity/1/cover-thumb.webp'))
      .toBe(`${origin}/uploads/img/activity/1/cover-thumb.webp`)
    expect(uploadAssetUrl(origin, '/uploads/img/History/2025/9/1/%E7%A4%BE%E5%9B%A2%E6%88%90%E7%AB%8B.png'))
      .toBe(`${origin}/uploads/img/History/2025/9/1/%E7%A4%BE%E5%9B%A2%E6%88%90%E7%AB%8B.png`)
  })

  it('rejects traversal, encoded separators, unknown types and over-long paths', () => {
    const rejected = [
      '/etc/passwd',
      '/uploads/',
      '/uploads/../secret.png',
      '/uploads/a/%2e%2e/b.png',
      '/uploads/a%2fb.png',
      '/uploads/a%5cb.png',
      '/uploads/a\b.png',
      '/uploads/x.txt',
      '/uploads/x.png?y=1',
      '/uploads/x.png#frag',
      `/uploads/${'a'.repeat(500)}.png`,
      '/uploads/a/b/c/d/e/f/g/h/i/j/k.png',
    ]
    for (const path of rejected) {
      expect(() => uploadAssetUrl(origin, path)).toThrow()
    }
    expect(() => uploadAssetUrl('https://user:pass@example.com', '/uploads/x.png')).toThrow()
    expect(() => uploadAssetUrl('file:///etc/passwd', '/uploads/x.png')).toThrow()
    expect(() => uploadAssetUrl(origin, '/api/config')).toThrow()
  })

  it('maps approved extensions to their content type', () => {
    expect(imageContentType('/uploads/fixture.webp')).toBe('image/webp')
    expect(imageContentType('/uploads/img/user/1.JPEG')).toBe('image/jpeg')
    expect(imageContentType('/uploads/icon.svg')).toBe('image/svg+xml')
    expect(imageContentType('/uploads/x.txt')).toBeNull()
    expect(imageContentType('/uploads/noextension')).toBeNull()
    expect(matchesImageContentType('image/webp; charset=binary', 'image/webp')).toBe(true)
    expect(matchesImageContentType('image/png', 'image/webp')).toBe(false)
    expect(matchesImageContentType('', 'image/webp')).toBe(false)
  })

  it('caps the streamed byte count instead of buffering', async () => {
    expect(await drain(capImageStream(chunksOf(1024, 512), 2048))).toEqual({ bytes: 1536, failed: false })
    const capped = await drain(capImageStream(chunksOf(1024, 1024), 1500))
    expect(capped.failed).toBe(true)
    expect(capped.bytes).toBe(1024)
  })

  it('sets nosniff, cache and sandbox headers per content type', () => {
    const png = publicImageHeaders('image/png')
    expect(png['x-content-type-options']).toBe('nosniff')
    expect(png['content-type']).toBe('image/png')
    expect(png['cache-control']?.includes('public')).toBe(true)
    expect(Object.hasOwn(png, 'content-security-policy')).toBe(false)
    const svg = publicImageHeaders('image/svg+xml')
    expect(svg['x-content-type-options']).toBe('nosniff')
    expect(svg['content-security-policy']?.includes('sandbox')).toBe(true)
  })

  it('denies redirects, spoofed types and oversized images', async () => {
    const redirecting = await startServer((request, response) => {
      response.statusCode = 302
      response.setHeader('location', 'http://127.0.0.1:1/elsewhere')
      response.end()
      return true
    })
    const spoofing = await startServer((request, response) => {
      response.setHeader('content-type', 'image/svg+xml')
      response.end('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')
      return true
    })
    const oversized = await startServer((request, response) => {
      response.on('error', () => {})
      response.writeHead(200, {
        'content-type': 'image/png',
        'content-length': String(PUBLIC_IMAGE_MAX_BYTES + 1),
      })
      response.write(Buffer.alloc(16))
      return true
    })
    const missing = await startServer(() => false)
    try {
      expect(await statusOf(() => fetchPublicImage(`${redirecting.apiBase}/uploads/x.png`, 'image/png'))).toBe(502)
      expect(await statusOf(() => fetchPublicImage(`${spoofing.apiBase}/uploads/x.png`, 'image/png'))).toBe(502)
      expect(await statusOf(() => fetchPublicImage(`${oversized.apiBase}/uploads/x.png`, 'image/png'))).toBe(502)
      expect(await statusOf(() => fetchPublicImage(`${missing.apiBase}/uploads/x.png`, 'image/png'))).toBe(404)
      const image = await fetchPublicImage(`${fixtureServer.apiBase}/uploads/fixture.webp`, 'image/webp')
      expect(image.contentType).toBe('image/webp')
      const body = await drain(image.bytes)
      expect(body.failed).toBe(false)
      expect(body.bytes > 1000).toBe(true)
    }
    finally {
      redirecting.close()
      spoofing.close()
      oversized.close()
      missing.close()
    }
  })

  it('matches the frozen upload middleware limit', () => {
    expect(PUBLIC_IMAGE_MAX_BYTES).toBe(50 * 1024 * 1024)
  })

  it('serves genuine JPEG bytes for jpg fixture images', () => {
    const jpeg = publicImageFixture('.jpg')
    expect(jpeg?.contentType).toBe('image/jpeg')
    const bytes = jpeg!.body()
    expect(bytes[0]).toBe(0xFF)
    expect(bytes[1]).toBe(0xD8)
    expect(bytes[bytes.length - 2]).toBe(0xFF)
    expect(bytes[bytes.length - 1]).toBe(0xD9)
    expect(publicImageFixture('.JPG')?.contentType).toBe('image/jpeg')
    expect(publicImageFixture('.png')?.contentType).toBe('image/png')
    expect(publicImageFixture('.txt')).toBeNull()
  })

  it('cancels the upstream image stream when the byte cap is exceeded', async () => {
    let cancelled = false
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(1024))
        controller.enqueue(new Uint8Array(1024))
      },
      cancel() {
        cancelled = true
      },
    })
    const result = await drain(capImageStream(source, 1500))
    expect(result.failed).toBe(true)
    expect(result.bytes).toBe(1024)
    expect(cancelled).toBe(true)
  })
})

describe('bounded reads and umami timestamps', () => {
  it('keeps omitted umami timestamps omitted and forwards an explicit zero', async () => {
    resetPublicFixtureState()
    const omitted = await readUmamiStats(ctx, parseUmamiQuery({}))
    expect(omitted.meta.startAt).toBe(UMAMI_DEFAULT_START_AT)
    expect(omitted.meta.endAt).toBe(UMAMI_DEFAULT_END_AT)
    const omittedRequest = publicFixtureState.requests.find(entry => entry.path === '/api/logs/umami')!
    expect(omittedRequest.search.includes('startAt')).toBe(false)
    expect(omittedRequest.search.includes('endAt')).toBe(false)

    resetPublicFixtureState()
    await readUmamiStats(ctx, parseUmamiQuery({ startAt: '0', endAt: '0' }))
    const explicitRequest = publicFixtureState.requests[0]!
    expect(explicitRequest.path).toBe('/api/logs/umami')
    expect(explicitRequest.search.includes('startAt=0')).toBe(true)
    expect(explicitRequest.search.includes('endAt=0')).toBe(true)

    expect(parseUmamiQuery({}).startAt).toBeUndefined()
    expect(parseUmamiQuery({}).endAt).toBeUndefined()
    expect(parseUmamiQuery({ startAt: '0' }).startAt).toBe(0)
    expect(parseUmamiQuery({ startAt: '1000', endAt: '2000' }).endAt).toBe(2000)
    expect(await statusOf(() => parseUmamiQuery({ startAt: '2000', endAt: '1000' }))).toBe(400)
    expect(await statusOf(() => parseUmamiQuery({ startAt: 'nope' }))).toBe(400)
  })

  it('flattens nested Umami { value, prev } metrics end to end', async () => {
    const nested = await startServer((request, response) => {
      response.setHeader('content-type', 'application/json')
      response.end(JSON.stringify({
        meta: { startAt: 1, endAt: 2, unit: 'day', limit: 5, envType: 'browser' },
        summary: {
          pageviews: { value: 3018, prev: 3508 },
          visitors: { value: 889, prev: 1001 },
          visits: { value: 1200 },
          bounces: { value: 42 },
          totaltime: { value: 37200 },
        },
        series: { pageviews: [{ x: '2026-10-01', y: { value: 12, prev: 9 } }], visitors: [] },
        top: { pages: [{ x: '/', y: { value: 3 } }], environments: [] },
      }))
      return true
    })
    try {
      const stats = await readUmamiStats({ apiBase: nested.apiBase }, parseUmamiQuery({}))
      expect(stats.summary).toEqual({ pageviews: 3018, visitors: 889, visits: 1200, bounces: 42, totaltime: 37200 })
      expect(stats.series.pageviews).toEqual([{ x: '2026-10-01', y: 12 }])
      expect(stats.top.pages).toEqual([{ x: '/', y: 3 }])
      expect(stats.meta.startAt).toBe(1)
      expect(stats.meta.endAt).toBe(2)
    }
    finally {
      nested.close()
    }
  })

  it('rejects malformed Umami metrics instead of guessing a value', async () => {
    const malformed = await startServer((request, response) => {
      response.setHeader('content-type', 'application/json')
      response.end(JSON.stringify({
        meta: { startAt: 1, endAt: 2, unit: 'day', limit: 5, envType: 'browser' },
        summary: { pageviews: { value: {} }, visitors: 1, visits: 1, bounces: 1, totaltime: 1 },
        series: { pageviews: [], visitors: [] },
        top: { pages: [], environments: [] },
      }))
      return true
    })
    try {
      expect(await statusOf(() => readUmamiStats({ apiBase: malformed.apiBase }, parseUmamiQuery({})))).toBe(502)
    }
    finally {
      malformed.close()
    }
  })

  it('preserves a legitimate long gallery list end to end', async () => {
    const many = Array.from({ length: 300 }, (_item, index) => `/uploads/img/activity/1/${index}.png`)
    const gallery = await startServer((request, response) => {
      response.setHeader('content-type', 'application/json')
      if (request.url?.startsWith('/api/activities/')) {
        response.end(JSON.stringify({
          ...publicActivitiesFixture[2]!,
          images: JSON.stringify(many),
          created_by_name: 'Taropoi',
          created_by_avatar: null,
          updated_by_name: null,
          updated_by_avatar: null,
        }))
        return true
      }
      return false
    })
    try {
      const detail = await readActivity({ apiBase: gallery.apiBase }, 1)
      expect(detail.images).toHaveLength(300)
      expect(detail.images[299]).toBe('/uploads/img/activity/1/299.png')
    }
    finally {
      gallery.close()
    }
  })

  it('rejects an oversized JSON body declared up front', async () => {
    const oversized = await startServer((request, response) => {
      response.on('error', () => {})
      response.writeHead(200, {
        'content-type': 'application/json',
        'content-length': String(9 * 1024 * 1024),
      })
      response.write('{"items":')
      return true
    })
    try {
      expect(await statusOf(() => readHistory({ apiBase: oversized.apiBase }))).toBe(502)
    }
    finally {
      oversized.close()
    }
  })

  it('cancels an oversized chunked JSON body while reading', async () => {
    const chunked = await startServer((request, response) => {
      response.on('error', () => {})
      response.setHeader('content-type', 'application/json')
      let sent = 0
      const chunk = Buffer.alloc(64 * 1024, 0x61)
      const write = (): void => {
        while (sent < 9 * 1024 * 1024) {
          sent += chunk.length
          if (!response.write(chunk)) {
            response.once('drain', write)
            return
          }
        }
        response.end()
      }
      write()
      return true
    })
    try {
      expect(await statusOf(() => readHistory({ apiBase: chunked.apiBase }))).toBe(502)
    }
    finally {
      chunked.close()
    }
  })
})

describe('public log detail redaction', () => {
  const loginDetails = async () => {
    const page = await readLogsPage(ctx, parseLogQuery({ limit: '50' }))
    return new Map(page.logs.map(log => [log.id, log]))
  }

  it('replaces frozen security-action descriptions with fixed safe text', async () => {
    const logs = await loginDetails()
    expect(logs.get(5)!.details).toBe('登录成功')
    expect(logs.get(6)!.details).toBe('登录尝试过多，已临时锁定')
    expect(logs.get(7)!.details).toBe('封禁了一个访问来源')
    expect(logs.get(8)!.details).toBe('重置了管理员密码')
    expect(logs.get(9)!.details).toBe('强制刷新了登录凭证')
  })

  it('keeps ordinary content titles while redacting credential-shaped decoys', async () => {
    const logs = await loginDetails()
    expect(logs.get(13)!.details).toBe('发布活动: 秋季例会 · 冰之妖精的茶会')
    const decoy = logs.get(12)!.details
    expect(decoy.includes('秋季例会')).toBe(true)
    expect(decoy.includes('eyJ')).toBe(false)
    expect(decoy.includes('[redacted]')).toBe(true)
    expect(logs.get(11)!.details).toBe('修改配置: qq_group_number')
    expect(logs.get(10)!.details).toBe('修改了站点配置')
  })

  it('never republishes an address from the frozen rows', async () => {
    const page = await readLogsPage(ctx, parseLogQuery({ limit: '50' }))
    for (const log of page.logs) {
      expect(/\d{1,3}(?:\.\d{1,3}){3}/.test(log.details)).toBe(false)
      expect(log.details.includes('2001:db8')).toBe(false)
      expect(log.details.includes('SomeAdmin')).toBe(false)
      expect(log.details.includes('version=42')).toBe(false)
    }
  })

  it('redacts addresses and credentials inside otherwise retained descriptions', async () => {
    const leaky = await startServer((request, response) => {
      response.setHeader('content-type', 'application/json')
      response.end(JSON.stringify({
        total: 1,
        logs: [{
          id: 1,
          username: 'Taropoi',
          action: 'UPDATE_PROFILE',
          details: '更新资料 password=hunter2 5f4dcc3b5aa765d61d8327deb882cf99 2001:db8::dead:beef 203.0.113.44',
          created_at: '2026-10-05T09:00:00+08:00',
          user_id: 1,
          user_avatar: null,
        }],
      }))
      return true
    })
    try {
      const page = await readLogsPage({ apiBase: leaky.apiBase }, parseLogQuery({}))
      const details = page.logs[0]!.details
      expect(details.includes('更新资料')).toBe(true)
      expect(details.includes('hunter2')).toBe(false)
      expect(details.includes('5f4dcc3b')).toBe(false)
      expect(details.includes('2001:db8')).toBe(false)
      expect(details.includes('beef')).toBe(false)
      expect(details.includes('203.0.113.44')).toBe(false)
      expect(details.includes('[redacted]')).toBe(true)
      expect(details.includes('[ip]')).toBe(true)
    }
    finally {
      leaky.close()
    }
  })
})

describe('reserved upstream failure fixture', () => {
  it('answers a sanitized 502 for activity id 998 and keeps 999 a 404', async () => {
    const raw = await fetch(`${ctx.apiBase}/api/activities/998`)
    expect(raw.status).toBe(503)
    // The fixture upstream really does leak private detail; the BFF must not.
    expect((await raw.text()).includes('private-value')).toBe(true)

    expect(await statusOf(() => readActivity(ctx, 998))).toBe(502)
    const failure = await readActivity(ctx, 998).catch((error: unknown) => error) as {
      statusCode?: number
      message?: string
      data?: unknown
    }
    expect(failure.statusCode).toBe(502)
    expect(failure.message?.includes('SQLITE_ERROR')).toBe(false)
    expect(failure.message?.includes('private-value')).toBe(false)
    expect(failure.message?.includes('fixture-private-detail')).toBe(false)
    expect(failure.data).toBeUndefined()

    expect(await statusOf(() => readActivity(ctx, 999))).toBe(404)
    expect((await fetch(`${ctx.apiBase}/api/activities/999`)).status).toBe(404)
  })
})

describe('upstream deadline and cancellation', () => {
  it('only accepts private deadlines up to the production default', () => {
    expect(resolveUpstreamTimeout({ apiBase: 'http://127.0.0.1:1' })).toBe(8_000)
    expect(resolveUpstreamTimeout({ apiBase: 'http://127.0.0.1:1', timeoutMs: 250 })).toBe(250)
    for (const invalid of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 8_001, 60_000]) {
      expect(resolveUpstreamTimeout({ apiBase: 'http://127.0.0.1:1', timeoutMs: invalid })).toBe(8_000)
    }
  })

  it('aborts an upstream that never sends headers', async () => {
    let closed = false
    const stalled = await startServer((request, response) => {
      response.on('error', () => {})
      response.on('close', () => { closed = true })
      return true
    })
    try {
      const started = Date.now()
      expect(await statusOf(() => readHistory({ apiBase: stalled.apiBase, timeoutMs: 150 }))).toBe(502)
      expect(Date.now() - started < 5_000).toBe(true)
      await delay(200)
      expect(closed).toBe(true)
    }
    finally {
      stalled.close()
    }
  })

  it('aborts an upstream that stalls after the headers', async () => {
    let closed = false
    const stalled = await startServer((request, response) => {
      response.on('error', () => {})
      response.on('close', () => { closed = true })
      response.writeHead(200, { 'content-type': 'application/json' })
      response.write('{"items":[')
      return true
    })
    try {
      const started = Date.now()
      expect(await statusOf(() => readHistory({ apiBase: stalled.apiBase, timeoutMs: 150 }))).toBe(502)
      expect(Date.now() - started < 5_000).toBe(true)
      await delay(200)
      expect(closed).toBe(true)
    }
    finally {
      stalled.close()
    }
  })
})
