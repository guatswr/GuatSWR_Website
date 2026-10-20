import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { ZodError } from 'zod'
import { BffConfigError, BffError } from './bff-errors'

export const CSRF_HEADER = 'x-csrf-token'
export const CSRF_COOKIE = 'bff_csrf'
export const CSRF_TOKEN_PREFIX = 'v1'
export const DEFAULT_CSRF_TTL_MS = 2 * 60 * 60 * 1000
export const MAX_EXPECTED_MESSAGE_LENGTH = 200

const LOOPBACK_ORIGIN_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])
const NONCE_BYTES = 32

/* ------------------------------------------------------------------ origins */

function normalizeOrigin(value: string): string {
  let url: URL
  try {
    url = new URL(value)
  }
  catch {
    throw new BffConfigError('allowed origin is not a URL')
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new BffConfigError('allowed origin must be http(s)')
  }
  if (url.username || url.password) throw new BffConfigError('allowed origin must not contain credentials')
  if ((url.pathname !== '' && url.pathname !== '/') || url.search || url.hash) {
    throw new BffConfigError('allowed origin must not contain a path, query or fragment')
  }
  // Plain HTTP is only acceptable for an explicit local test origin; every real
  // deployment origin must be HTTPS.
  if (url.protocol === 'http:' && !LOOPBACK_ORIGIN_HOSTS.has(url.hostname)) {
    throw new BffConfigError('non-loopback allowed origins must use https')
  }
  return url.origin
}

/** Accept an explicit list, a comma-separated string or nothing at all. */
export function parseAllowedOrigins(raw: unknown): string[] {
  const entries: string[] = []
  if (raw === undefined || raw === null) return entries
  if (typeof raw === 'string') {
    entries.push(...raw.split(','))
  }
  else if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (typeof entry !== 'string') throw new BffConfigError('allowed origin entries must be strings')
      entries.push(entry)
    }
  }
  else {
    throw new BffConfigError('allowed origins must be a string list')
  }

  const origins: string[] = []
  for (const entry of entries) {
    const trimmed = entry.trim()
    if (trimmed.length === 0) continue
    if (trimmed === '*') throw new BffConfigError('wildcard origins are not allowed')
    const origin = normalizeOrigin(trimmed)
    if (!origins.includes(origin)) origins.push(origin)
  }
  return origins
}

/**
 * Exact-origin enforcement for every state-changing request. A missing, empty,
 * `null`, malformed or foreign origin is rejected instead of falling back to
 * the Host or a forwarded host header.
 */
export function assertAllowedOrigin(originHeader: unknown, allowedOrigins: readonly string[]): string {
  if (typeof originHeader !== 'string') {
    throw new BffError(403, 'origin_rejected', '请求来源不被允许')
  }
  const trimmed = originHeader.trim()
  if (trimmed.length === 0 || trimmed === 'null' || trimmed.includes(',')) {
    throw new BffError(403, 'origin_rejected', '请求来源不被允许')
  }
  let origin: string
  try {
    const url = new URL(trimmed)
    if ((url.pathname !== '' && url.pathname !== '/') || url.search || url.hash || url.username || url.password) {
      throw new Error('origin has extra components')
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('origin scheme is not http(s)')
    origin = url.origin
  }
  catch {
    throw new BffError(403, 'origin_rejected', '请求来源不被允许')
  }
  if (!allowedOrigins.includes(origin)) {
    throw new BffError(403, 'origin_rejected', '请求来源不被允许')
  }
  return origin
}

/* ----------------------------------------------------------- content types */

export function isJsonContentType(value: unknown): boolean {
  if (typeof value !== 'string') return false
  const [mediaType, ...parameters] = value.split(';').map(part => part.trim().toLowerCase())
  if (mediaType !== 'application/json') return false
  return parameters.every(parameter => parameter.length === 0 || parameter === 'charset=utf-8' || parameter === 'charset=us-ascii')
}

export function assertJsonContentType(value: unknown): void {
  if (!isJsonContentType(value)) {
    throw new BffError(415, 'unsupported_media_type', '请求格式不受支持')
  }
}

/** Logout carries no payload, so an absent content type is acceptable. */
export function assertOptionalJsonContentType(value: unknown): void {
  if (value === undefined || value === null || (typeof value === 'string' && value.trim().length === 0)) return
  assertJsonContentType(value)
}

export function parseContentLengthHeader(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string' || !/^\d{1,9}$/.test(value.trim())) {
    throw new BffError(400, 'invalid_request', '请求内容无效')
  }
  return Number.parseInt(value.trim(), 10)
}

/* -------------------------------------------------------------- body reads */

export interface BoundedBodySource {
  chunks: AsyncIterable<Uint8Array | string>
  /** Destroys the underlying request when the read is abandoned. */
  destroy?: (error?: Error) => void
}

export interface ReadBoundedJsonOptions {
  maxBytes: number
  timeoutMs: number
  declaredLength?: number
}

/** Bounded capacities must stay finite positive integers; NaN/Infinity must
 * not be able to disable a memory or rate limit. */
export function positiveInteger(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 1 ? Math.floor(value) : fallback
}

/**
 * Read and parse a JSON object with a hard byte cap and a deadline. Nothing is
 * logged, and oversized or malformed bodies never reach the upstream call.
 *
 * The deadline is enforced with a race, not with the optional `destroy` hook,
 * so a never-ending iterable cannot hang the request. Every exit path releases
 * the source (destroy and iterator return) without waiting on a stalled stream.
 */
export async function readBoundedJson(source: BoundedBodySource, options: ReadBoundedJsonOptions): Promise<unknown> {
  const maxBytes = positiveInteger(options.maxBytes, 16 * 1024)
  const timeoutMs = positiveInteger(options.timeoutMs, 5_000)
  if (options.declaredLength !== undefined && options.declaredLength > maxBytes) {
    source.destroy?.(new Error('BFF request body exceeded the declared limit'))
    throw new BffError(413, 'payload_too_large', '请求内容过大')
  }

  const iterator = source.chunks[Symbol.asyncIterator]()
  // Fire-and-forget release: a stalled iterator's `return` may not settle.
  const release = () => {
    try {
      const returned = iterator.return?.()
      if (returned && typeof returned.catch === 'function') returned.catch(() => {})
    }
    catch {
      // Released best-effort only.
    }
  }

  let timedOut = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      timedOut = true
      source.destroy?.(new Error('BFF request body timed out'))
      release()
      reject(new BffError(408, 'request_timeout', '请求超时'))
    }, timeoutMs)
  })

  const chunks: Buffer[] = []
  let total = 0
  try {
    for (;;) {
      const next = iterator.next()
      // If the deadline wins the race, the dangling read must not surface as an
      // unhandled rejection later.
      if (typeof next.catch === 'function') next.catch(() => {})
      const step = await Promise.race([next, deadline])
      if (step.done) break
      const chunk = step.value
      const buffer = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : Buffer.from(chunk)
      total += buffer.byteLength
      if (total > maxBytes) {
        source.destroy?.(new Error('BFF request body exceeded the limit'))
        release()
        throw new BffError(413, 'payload_too_large', '请求内容过大')
      }
      chunks.push(buffer)
    }
  }
  catch (error) {
    if (timedOut) throw new BffError(408, 'request_timeout', '请求超时')
    if (error instanceof BffError) throw error
    throw new BffError(400, 'invalid_request', '请求内容无效')
  }
  finally {
    if (timer) clearTimeout(timer)
    release()
  }

  if (total === 0) throw new BffError(400, 'invalid_request', '请求内容无效')

  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))
  }
  catch {
    throw new BffError(400, 'invalid_request', '请求内容无效')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  }
  catch {
    throw new BffError(400, 'invalid_request', '请求内容无效')
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new BffError(400, 'invalid_request', '请求内容无效')
  }
  return parsed
}

/* -------------------------------------------------------------------- CSRF */

function csrfMac(key: Buffer, expiresAt: number, nonce: string, binding: string): string {
  return createHmac('sha256', key)
    .update(`${CSRF_TOKEN_PREFIX}|${expiresAt}|${nonce}|${binding}`, 'utf8')
    .digest('base64url')
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'utf8')
  const rightBuffer = Buffer.from(right, 'utf8')
  if (leftBuffer.byteLength !== rightBuffer.byteLength) return false
  return timingSafeEqual(leftBuffer, rightBuffer)
}

/**
 * Opaque, HMAC-bound double-submit token. The value is returned to same-origin
 * JavaScript and mirrored in an HttpOnly cookie, so a cross-site page can
 * neither read nor forge it. The binding separates anonymous, per-session and
 * rotated-after-login tokens.
 */
export function createCsrfToken(
  key: Buffer,
  binding: string,
  now: number,
  ttlMs: number = DEFAULT_CSRF_TTL_MS,
): string {
  const ttl = Math.min(Math.max(ttlMs, 60_000), DEFAULT_CSRF_TTL_MS)
  const expiresAt = Math.floor(now + ttl)
  const nonce = randomBytes(NONCE_BYTES).toString('base64url')
  const mac = csrfMac(key, expiresAt, nonce, binding)
  return `${CSRF_TOKEN_PREFIX}.${expiresAt}.${nonce}.${mac}`
}

export interface CsrfCheck {
  cookieToken?: unknown
  headerToken?: unknown
  key: Buffer
  binding: string
  now: number
  maxAgeMs?: number
}

export function verifyCsrf(check: CsrfCheck): void {
  const cookieToken = typeof check.cookieToken === 'string' ? check.cookieToken : ''
  const headerToken = typeof check.headerToken === 'string' ? check.headerToken : ''
  if (cookieToken.length === 0 || headerToken.length === 0) {
    throw new BffError(403, 'csrf_invalid', '请求校验失败，请刷新页面后重试')
  }
  if (!constantTimeEqual(cookieToken, headerToken)) {
    throw new BffError(403, 'csrf_invalid', '请求校验失败，请刷新页面后重试')
  }
  const parts = headerToken.split('.')
  if (parts.length !== 4) throw new BffError(403, 'csrf_invalid', '请求校验失败，请刷新页面后重试')
  const [prefix, rawExpiresAt, nonce, mac] = parts as [string, string, string, string]
  if (prefix !== CSRF_TOKEN_PREFIX || !/^\d{1,15}$/.test(rawExpiresAt) || !/^[A-Za-z0-9_-]{20,64}$/.test(nonce)) {
    throw new BffError(403, 'csrf_invalid', '请求校验失败，请刷新页面后重试')
  }
  const expiresAt = Number.parseInt(rawExpiresAt, 10)
  const maxAgeMs = Math.min(Math.max(check.maxAgeMs ?? DEFAULT_CSRF_TTL_MS, 60_000), DEFAULT_CSRF_TTL_MS)
  if (expiresAt <= Math.floor(check.now) || expiresAt > Math.floor(check.now + maxAgeMs)) {
    throw new BffError(403, 'csrf_invalid', '请求校验失败，请刷新页面后重试')
  }
  const expected = csrfMac(check.key, expiresAt, nonce, check.binding)
  if (!constantTimeEqual(expected, mac)) {
    throw new BffError(403, 'csrf_invalid', '请求校验失败，请刷新页面后重试')
  }
}

/* ------------------------------------------------------------ rate limiting */

export interface FixedWindowRateLimiterOptions {
  limit: number
  windowMs: number
  now?: () => number
  maxKeys?: number
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  retryAfterSeconds: number
}

export interface FixedWindowRateLimiter {
  check: (key: string) => RateLimitResult
  size: () => number
}

interface WindowState {
  count: number
  resetAt: number
}

/**
 * Deterministic in-memory limiter for the BFF login boundary. The frozen
 * backend keeps its own persistent lockout; this only stops proxy-level abuse
 * before an upstream call is made.
 *
 * Memory is hard-bounded by `maxKeys`: expired windows are swept first, then
 * the window closest to reset is evicted. Eviction deliberately forgets that
 * window's counter, so a flood of distinct keys can shorten (never extend) a
 * single key's window; that is the documented trade-off for a bounded limiter
 * without a shared store.
 */
export function createFixedWindowRateLimiter(options: FixedWindowRateLimiterOptions): FixedWindowRateLimiter {
  const limit = positiveInteger(options.limit, 1)
  const windowMs = positiveInteger(options.windowMs, 60_000)
  const maxKeys = positiveInteger(options.maxKeys, 10_000)
  const now = options.now ?? Date.now
  const windows = new Map<string, WindowState>()

  const sweep = (current: number) => {
    for (const [key, state] of windows) {
      if (state.resetAt <= current) windows.delete(key)
    }
  }

  const evictSoonestReset = () => {
    const oldestKey = windows.keys().next().value
    if (oldestKey !== undefined) windows.delete(oldestKey)
  }

  return {
    check(key) {
      const current = now()
      let state = windows.get(key)
      if (!state || state.resetAt <= current) {
        if (!state && windows.size >= maxKeys) {
          sweep(current)
          if (windows.size >= maxKeys) evictSoonestReset()
        }
        state = { count: 0, resetAt: current + windowMs }
        windows.set(key, state)
      }
      if (state.count >= limit) {
        return {
          allowed: false,
          remaining: 0,
          retryAfterSeconds: Math.max(1, Math.ceil((state.resetAt - current) / 1000)),
        }
      }
      state.count += 1
      return { allowed: true, remaining: Math.max(0, limit - state.count), retryAfterSeconds: 0 }
    },
    size() {
      return windows.size
    },
  }
}

/* --------------------------------------------------------- error sanitizing */

function stripControlCharacters(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Keep only a short, control-character-free message from an expected upstream
 * validation failure, and redact anything the caller submitted so a hostile or
 * compromised upstream cannot reflect credentials back into the UI.
 */
export function sanitizeExpectedMessage(value: unknown, secrets: readonly (string | null | undefined)[] = []): string | undefined {
  if (typeof value !== 'string') return undefined
  let message = stripControlCharacters(value).trim()
  if (message.length === 0) return undefined
  for (const secret of secrets) {
    if (typeof secret !== 'string' || secret.length === 0) continue
    message = message.replace(new RegExp(escapeRegExp(secret), 'g'), '***')
  }
  message = message.trim()
  if (message.length === 0) return undefined
  return message.length > MAX_EXPECTED_MESSAGE_LENGTH ? message.slice(0, MAX_EXPECTED_MESSAGE_LENGTH) : message
}

export function firstValidationMessage(error: ZodError, fallback: string): string {
  const issue = error.issues[0]
  if (!issue || typeof issue.message !== 'string') return fallback
  return sanitizeExpectedMessage(issue.message) ?? fallback
}
