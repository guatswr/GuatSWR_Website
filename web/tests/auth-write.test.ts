import { Readable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import {
  CSRF_HEADER,
  DEFAULT_CSRF_TTL_MS,
  assertAllowedOrigin,
  assertJsonContentType,
  assertOptionalJsonContentType,
  createCsrfToken,
  createFixedWindowRateLimiter,
  firstValidationMessage,
  isJsonContentType,
  parseAllowedOrigins,
  parseContentLengthHeader,
  readBoundedJson,
  sanitizeExpectedMessage,
  verifyCsrf,
} from '../server/utils/bff-write'
import { BffConfigError, BffError } from '../server/utils/bff-errors'
import { derivePurposeKey, CSRF_KEY_PURPOSE } from '../server/utils/bff-session'
import { loginSchema } from '@guatswr/shared'

const SECRET = 'test-session-secret-that-is-long-enough-0123456789'
const CSRF_KEY = derivePurposeKey(SECRET, CSRF_KEY_PURPOSE)
const NOW = 1_760_000_000_000

function expectBffError(fn: () => unknown, statusCode: number, code: string) {
  try {
    fn()
  }
  catch (error) {
    expect(error).toBeInstanceOf(BffError)
    expect((error as BffError).statusCode).toBe(statusCode)
    expect((error as BffError).code).toBe(code)
    return
  }
  throw new Error(`expected a BffError with code ${code}`)
}

describe('allowed origins fail closed', () => {
  it('parses explicit https origins and loopback http test origins', () => {
    expect(parseAllowedOrigins(['https://next.guatswr.top', 'http://127.0.0.1:3100']))
      .toEqual(['https://next.guatswr.top', 'http://127.0.0.1:3100'])
    expect(parseAllowedOrigins('https://a.example, https://b.example')).toEqual(['https://a.example', 'https://b.example'])
    expect(parseAllowedOrigins([])).toEqual([])
    expect(parseAllowedOrigins(undefined)).toEqual([])
  })

  it('rejects wildcards, paths, credentials, non-http schemes and plain-http remote origins', () => {
    expect(() => parseAllowedOrigins(['*'])).toThrow(BffConfigError)
    expect(() => parseAllowedOrigins(['https://a.example/path'])).toThrow(BffConfigError)
    expect(() => parseAllowedOrigins(['https://user:pass@a.example'])).toThrow(BffConfigError)
    expect(() => parseAllowedOrigins(['file:///etc/passwd'])).toThrow(BffConfigError)
    expect(() => parseAllowedOrigins(['http://next.guatswr.top'])).toThrow(BffConfigError)
    expect(() => parseAllowedOrigins([42])).toThrow(BffConfigError)
  })

  it('accepts only an exact configured origin for writes', () => {
    const allowed = ['https://next.guatswr.top', 'http://127.0.0.1:3100']
    expect(assertAllowedOrigin('https://next.guatswr.top', allowed)).toBe('https://next.guatswr.top')
    expect(assertAllowedOrigin('https://NEXT.guatswr.top', allowed)).toBe('https://next.guatswr.top')
    expectBffError(() => assertAllowedOrigin(null, allowed), 403, 'origin_rejected')
    expectBffError(() => assertAllowedOrigin(undefined, allowed), 403, 'origin_rejected')
    expectBffError(() => assertAllowedOrigin('null', allowed), 403, 'origin_rejected')
    expectBffError(() => assertAllowedOrigin('https://evil.example', allowed), 403, 'origin_rejected')
    expectBffError(() => assertAllowedOrigin('https://next.guatswr.top.evil.example', allowed), 403, 'origin_rejected')
    expectBffError(() => assertAllowedOrigin('https://next.guatswr.top:8443', allowed), 403, 'origin_rejected')
    expectBffError(() => assertAllowedOrigin('http://next.guatswr.top', allowed), 403, 'origin_rejected')
    expectBffError(() => assertAllowedOrigin('https://next.guatswr.top/path', allowed), 403, 'origin_rejected')
    expectBffError(() => assertAllowedOrigin('https://a.example, https://next.guatswr.top', allowed), 403, 'origin_rejected')
  })
})

describe('content types', () => {
  it.each(['application/json', 'application/json; charset=utf-8', 'Application/JSON; Charset=UTF-8'])('accepts %s', (value) => {
    expect(isJsonContentType(value)).toBe(true)
    expect(() => assertJsonContentType(value)).not.toThrow()
  })

  it.each(['', 'text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data; boundary=x', 'application/json; charset=utf-16', 'application/jsonish', undefined, 42])(
    'rejects %s',
    (value) => {
      expect(isJsonContentType(value)).toBe(false)
      expectBffError(() => assertJsonContentType(value), 415, 'unsupported_media_type')
    },
  )

  it('allows an absent content type only for bodyless logout', () => {
    expect(() => assertOptionalJsonContentType(undefined)).not.toThrow()
    expect(() => assertOptionalJsonContentType('')).not.toThrow()
    expectBffError(() => assertOptionalJsonContentType('text/plain'), 415, 'unsupported_media_type')
  })

  it('parses only plain content-length values', () => {
    expect(parseContentLengthHeader('42')).toBe(42)
    expect(parseContentLengthHeader(undefined)).toBeUndefined()
    expectBffError(() => parseContentLengthHeader('42, 42'), 400, 'invalid_request')
    expectBffError(() => parseContentLengthHeader('-1'), 400, 'invalid_request')
    expectBffError(() => parseContentLengthHeader('1'.repeat(12)), 400, 'invalid_request')
  })
})

describe('bounded JSON body reads', () => {
  const read = (chunks: unknown[], options: { maxBytes?: number, timeoutMs?: number, declaredLength?: number } = {}) =>
    readBoundedJson({ chunks: Readable.from(chunks) }, {
      maxBytes: options.maxBytes ?? 1024,
      timeoutMs: options.timeoutMs ?? 500,
      declaredLength: options.declaredLength,
    })

  it('parses a bounded JSON object', async () => {
    await expect(read([Buffer.from('{"username":"admin"}')])).resolves.toEqual({ username: 'admin' })
    await expect(read(['{"a":', '1}'])).resolves.toEqual({ a: 1 })
  })

  it('rejects an oversized declared or streamed body with 413', async () => {
    await expect(read([Buffer.from('{}')], { declaredLength: 2048 })).rejects.toMatchObject({ statusCode: 413 })
    await expect(read([Buffer.from('x'.repeat(2048))], { maxBytes: 1024 })).rejects.toMatchObject({ statusCode: 413 })
  })

  it('releases the source when a declared length is already oversized', async () => {
    let destroyed = false
    await expect(readBoundedJson({
      chunks: Readable.from([Buffer.from('{}')]),
      destroy: () => {
        destroyed = true
      },
    }, { maxBytes: 16, timeoutMs: 100, declaredLength: 1_000_000 })).rejects.toMatchObject({ statusCode: 413 })
    expect(destroyed).toBe(true)
  })

  it.each([
    ['empty body', []],
    ['invalid JSON', [Buffer.from('{')]],
    ['JSON array', [Buffer.from('[1,2]')]],
    ['JSON scalar', [Buffer.from('42')]],
    ['JSON null', [Buffer.from('null')]],
  ])('rejects %s with 400', async (_label, chunks) => {
    await expect(read(chunks)).rejects.toMatchObject({ statusCode: 400 })
  })

  it('rejects invalid UTF-8 with 400', async () => {
    await expect(read([Buffer.from([0xC3, 0x28])])).rejects.toMatchObject({ statusCode: 400 })
  })

  it('times out a stalled body, destroys the source, and never returns partial data', async () => {
    let destroyed = false
    let abortNext: ((error: Error) => void) | undefined
    const stalled: AsyncIterable<Uint8Array> = {
      [Symbol.asyncIterator]() {
        return {
          next: () => new Promise<IteratorResult<Uint8Array>>((_resolve, reject) => {
            abortNext = reject
          }),
          return: () => Promise.resolve({ done: true, value: undefined }),
        }
      },
    }
    const result = readBoundedJson({
      chunks: stalled,
      destroy: (error) => {
        destroyed = true
        abortNext?.(error ?? new Error('destroyed'))
      },
    }, { maxBytes: 1024, timeoutMs: 20 })
    await expect(result).rejects.toMatchObject({ statusCode: 408 })
    expect(destroyed).toBe(true)
  })

  it('still times out when no destroy hook exists, so a stalled test cannot hang forever', async () => {
    const stalled: AsyncIterable<Uint8Array> = {
      [Symbol.asyncIterator]() {
        return {
          next: () => new Promise<IteratorResult<Uint8Array>>(() => {}),
          return: () => new Promise<IteratorResult<Uint8Array>>(() => {}),
        }
      },
    }
    await expect(readBoundedJson({ chunks: stalled }, { maxBytes: 1024, timeoutMs: 20 }))
      .rejects.toMatchObject({ statusCode: 408 })
  })
})

describe('CSRF tokens', () => {
  it('round-trips a bound token', () => {
    const token = createCsrfToken(CSRF_KEY, 'anonymous', NOW)
    expect(token.startsWith('v1.')).toBe(true)
    expect(() => verifyCsrf({ cookieToken: token, headerToken: token, key: CSRF_KEY, binding: 'anonymous', now: NOW }))
      .not.toThrow()
  })

  it('rejects a foreign binding, another key, tampering and expiry', () => {
    const token = createCsrfToken(CSRF_KEY, 'session:abc', NOW)
    expectBffError(() => verifyCsrf({ cookieToken: token, headerToken: token, key: CSRF_KEY, binding: 'session:def', now: NOW }), 403, 'csrf_invalid')
    expectBffError(() => verifyCsrf({ cookieToken: token, headerToken: token, key: derivePurposeKey(SECRET, 'other-purpose'), binding: 'session:abc', now: NOW }), 403, 'csrf_invalid')
    expectBffError(() => verifyCsrf({ cookieToken: token, headerToken: `${token}x`, key: CSRF_KEY, binding: 'session:abc', now: NOW }), 403, 'csrf_invalid')
    expectBffError(() => verifyCsrf({ cookieToken: token, headerToken: token, key: CSRF_KEY, binding: 'session:abc', now: NOW + DEFAULT_CSRF_TTL_MS + 1 }), 403, 'csrf_invalid')
  })

  it('rejects missing, mismatched and structurally invalid tokens', () => {
    const token = createCsrfToken(CSRF_KEY, 'anonymous', NOW)
    expectBffError(() => verifyCsrf({ cookieToken: undefined, headerToken: token, key: CSRF_KEY, binding: 'anonymous', now: NOW }), 403, 'csrf_invalid')
    expectBffError(() => verifyCsrf({ cookieToken: token, headerToken: undefined, key: CSRF_KEY, binding: 'anonymous', now: NOW }), 403, 'csrf_invalid')
    expectBffError(() => verifyCsrf({ cookieToken: token, headerToken: 'v2.1.2.3', key: CSRF_KEY, binding: 'anonymous', now: NOW }), 403, 'csrf_invalid')
    expectBffError(() => verifyCsrf({ cookieToken: 'short', headerToken: 'short', key: CSRF_KEY, binding: 'anonymous', now: NOW }), 403, 'csrf_invalid')
  })

  it('generates a fresh nonce per token and a header name that is not a cookie', () => {
    expect(createCsrfToken(CSRF_KEY, 'anonymous', NOW)).not.toBe(createCsrfToken(CSRF_KEY, 'anonymous', NOW))
    expect(CSRF_HEADER).toBe('x-csrf-token')
  })
})

describe('fixed-window rate limiting', () => {
  it('allows the limit, then denies with a bounded retry hint', () => {
    let current = NOW
    const limiter = createFixedWindowRateLimiter({ limit: 2, windowMs: 60_000, now: () => current })
    expect(limiter.check('ip-a')).toMatchObject({ allowed: true, remaining: 1 })
    expect(limiter.check('ip-a')).toMatchObject({ allowed: true, remaining: 0 })
    expect(limiter.check('ip-a')).toMatchObject({ allowed: false, remaining: 0, retryAfterSeconds: 60 })
    expect(limiter.check('ip-b').allowed).toBe(true)
    current += 60_000
    expect(limiter.check('ip-a')).toMatchObject({ allowed: true, remaining: 1 })
  })

  it('hard-bounds live keys under a flood of distinct addresses and fake time', () => {
    let current = NOW
    const limiter = createFixedWindowRateLimiter({ limit: 5, windowMs: 60_000, now: () => current, maxKeys: 3 })
    for (let index = 0; index < 50; index += 1) {
      current += 1
      expect(limiter.check(`live-${index}`).allowed).toBe(true)
      expect(limiter.size()).toBeLessThanOrEqual(3)
    }
    // Eviction forgets the soonest-reset window; it never grows the map.
    expect(limiter.size()).toBe(3)
  })

  it('never lets non-finite limits disable the bound', () => {
    let current = NOW
    const limiter = createFixedWindowRateLimiter({
      limit: Number.NaN,
      windowMs: Number.POSITIVE_INFINITY,
      now: () => current,
      maxKeys: Number.NaN,
    })
    for (let index = 0; index < 20_050; index += 1) {
      current += 1
      limiter.check(`k-${index}`)
    }
    expect(limiter.size()).toBeLessThanOrEqual(10_000)
    expect(limiter.check('fresh').allowed).toBe(true)
  })

  it('preserves a renewed active quota when an older window is closer to reset', () => {
    let current = 0
    const limiter = createFixedWindowRateLimiter({ limit: 1, windowMs: 100, maxKeys: 2, now: () => current })
    expect(limiter.check('renewed').allowed).toBe(true) // expires at 100
    current = 50
    expect(limiter.check('older').allowed).toBe(true) // expires at 150
    current = 110
    expect(limiter.check('renewed').allowed).toBe(true) // renewed to 210, still first in Map order
    current = 120
    expect(limiter.check('newcomer').allowed).toBe(true)
    expect(limiter.size()).toBe(2)
    // Capacity pressure may forget the 150ms window, not reset the fresh quota.
    expect(limiter.check('renewed').allowed).toBe(false)
  })
})

describe('upstream message sanitizing', () => {
  it('keeps expected messages but redacts submitted credentials and control characters', () => {
    expect(sanitizeExpectedMessage('用户名或密码错误 (剩余 4 次)', [])).toBe('用户名或密码错误 (剩余 4 次)')
    expect(sanitizeExpectedMessage('bad admin secretpass', ['admin', 'secretpass'])).toBe('bad *** ***')
    expect(sanitizeExpectedMessage('line\u0000break\u001b[31m', [])).toBe('linebreak[31m')
    expect(sanitizeExpectedMessage(`shaped${'x'.repeat(300)}`, [])?.length).toBe(200)
  })

  it('ignores non-string messages, empty values and reflections of white-listed secrets', () => {
    expect(sanitizeExpectedMessage(undefined, [])).toBeUndefined()
    expect(sanitizeExpectedMessage({ message: 'nope' }, [])).toBeUndefined()
    expect(sanitizeExpectedMessage('   ', [])).toBeUndefined()
    expect(sanitizeExpectedMessage('adminadmin', ['admin'])).toBe('******')
    expect(sanitizeExpectedMessage('token leaked', ['', null, undefined])).toBe('token leaked')
  })

  it('uses the first schema issue for validation failures', () => {
    const parsed = loginSchema.safeParse({ username: 'bad user', password: '' })
    expect(parsed.success).toBe(false)
    if (!parsed.success) {
      expect(firstValidationMessage(parsed.error, 'fallback')).toContain('用户名')
      expect(firstValidationMessage(parsed.error, 'fallback').length).toBeLessThanOrEqual(200)
    }
  })
})
