import { createHmac } from 'node:crypto'
import { getCookie, getHeader, setCookie } from 'h3'
import type { H3Event } from 'h3'
// `useRuntimeConfig` stays a Nitro auto-import (as in `bff-auth-context.ts`) so
// this module loads under plain Vitest without a `#imports` virtual-module stub.
import {
  GUEST_DRAFT_PROOF_HEADER,
  EVENT_FIELDS,
  EVENT_TYPES,
  eventSignupRecordSchema,
  eventSignupSchema
} from '@guatswr/shared'
import type { EventSignupInput, EventType } from '@guatswr/shared'
import { parseClubTime } from '~/utils/club-date'
import { getBffRuntime, getCsrfBinding, readCookieSession, readEventJsonBody, resolveEventClientIp } from './bff-auth-context'
import type { BffRuntime } from './bff-runtime'
import { isLoopbackHostname, isLoopbackIp, parseIp } from './bff-identity'
import { BffError } from './bff-errors'
import {
  CSRF_COOKIE,
  CSRF_HEADER,
  assertAllowedOrigin,
  assertJsonContentType,
  createFixedWindowRateLimiter,
  verifyCsrf
} from './bff-write'
import type { FixedWindowRateLimiter } from './bff-write'
import { upstreamUrl } from './upstream'
import { invalidatePublicData } from './public-data'
import {
  GUEST_COOKIE_ID_PATTERN,
  GUEST_DRAFT_COOKIE,
  GUEST_DRAFT_PURPOSE,
  createGuestDraftStore
} from './guest-drafts'
import type { GuestDraftStore, GuestIntent, IssuedDraft } from './guest-drafts'
import { signGuestDraftProof } from './guest-proof'

/**
 * Guest BFF composition helpers.
 *
 * Everything here composes the auth batch's reviewed primitives (runtime, origin,
 * CSRF, trusted-proxy identity, limiter, bounded JSON body) with a **closed
 * operation map** over the frozen v1 write/upload routes. There is no arbitrary
 * path/verb surface, no forwarded browser credential, and no automatic retry.
 */

export const GUEST_MAX_JSON_BYTES = 64 * 1024
export const GUEST_MAX_CONTENT_BYTES = 48 * 1024
export const GUEST_MAX_STRING_LENGTH = 5_000
export const GUEST_MAX_CONTENT_DEPTH = 4
export const GUEST_UPSTREAM_TIMEOUT_MS = 8_000
export const GUEST_UPSTREAM_MAX_RESPONSE_BYTES = 64 * 1024

export const guestLimiters: Readonly<Record<'draft' | 'save' | 'signup' | 'upload', FixedWindowRateLimiter>> = {
  draft: createFixedWindowRateLimiter({ limit: 10, windowMs: 60_000, maxKeys: 5_000 }),
  save: createFixedWindowRateLimiter({ limit: 30, windowMs: 60_000, maxKeys: 5_000 }),
  signup: createFixedWindowRateLimiter({ limit: 20, windowMs: 60_000, maxKeys: 5_000 }),
  upload: createFixedWindowRateLimiter({ limit: 12, windowMs: 60_000, maxKeys: 2_000 })
}

export function enforceGuestLimit(limiter: FixedWindowRateLimiter, key: string): void {
  const result = limiter.check(key)
  if (!result.allowed) {
    throw new BffError(429, 'rate_limited', '操作过于频繁，请稍后再试', {
      retryAfterSeconds: result.retryAfterSeconds
    })
  }
}

/* --------------------------------------------------------------- operations */

export type GuestOperationName =
  | 'draft'
  | 'save'
  | 'signupRead'
  | 'signupSave'
  | 'signupDelete'
  | 'eventRead'
  | 'uploadContent'
  | 'uploadAvatar'

export interface GuestOperation {
  name: GuestOperationName
  /** Present exactly for the id-addressed operations. */
  id?: number
}

interface OperationRoute {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  /** Frozen v1 path; ids are validated safe positive integers before use. */
  path: (id: number) => string
}

const safeId = (id: unknown): number => {
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0) {
    throw new BffError(400, 'invalid_request', '找不到该活动')
  }
  return id
}

const eventPath = (suffix = '') => (id: number) => `/api/event/${safeId(id)}${suffix}`

const OPERATION_ROUTES: Readonly<Record<GuestOperationName, OperationRoute>> = Object.freeze({
  draft: { method: 'POST', path: () => '/api/event/draft' },
  save: { method: 'PUT', path: eventPath() },
  signupRead: { method: 'GET', path: eventPath('/signup') },
  signupSave: { method: 'POST', path: eventPath('/signup') },
  signupDelete: { method: 'DELETE', path: eventPath('/signup') },
  eventRead: { method: 'GET', path: eventPath() },
  uploadContent: { method: 'POST', path: () => '/api/upload/visitor' },
  uploadAvatar: { method: 'POST', path: () => '/api/upload/visitor/avatar' }
})

export interface ResolvedGuestOperation {
  method: OperationRoute['method']
  path: string
}

/** The only place a verb and a path are combined; ids must be safe integers. */
export function resolveGuestOperation(operation: GuestOperation): ResolvedGuestOperation {
  const route = OPERATION_ROUTES[operation.name]
  if (!route) throw new BffError(500, 'internal_error', '服务暂不可用')
  const needsId =
    operation.name !== 'draft' &&
    operation.name !== 'uploadContent' &&
    operation.name !== 'uploadAvatar'
  if (needsId && operation.id === undefined) {
    throw new BffError(400, 'invalid_request', '找不到该活动')
  }
  return { method: route.method, path: route.path(operation.id ?? 0) }
}

/* --------------------------------------------------------------- context */

export interface GuestContext {
  runtime: BffRuntime
  /** Validated address from the trusted socket/proxy chain (never raw XFF). */
  ip: string
  origin: string
  /** Server-only gateway credential; never taken from browser headers. */
  bridgeSecret?: string
}

export function guestContext(event: H3Event): GuestContext {
  const runtime = getBffRuntime(event)
  const { apiBase, bffBridgeSecret } = useRuntimeConfig(event)
  return {
    runtime,
    ip: resolveEventClientIp(event, runtime).ip.address,
    origin: String(apiBase),
    bridgeSecret: String(bffBridgeSecret || '')
  }
}

/** Origin + bound-CSRF check for every guest mutation, including uploads. */
export async function assertGuestWrite(event: H3Event, runtime: BffRuntime): Promise<string> {
  assertAllowedOrigin(getHeader(event, 'origin'), runtime.config.allowedOrigins)
  const binding = await getCsrfBinding(event, runtime)
  verifyCsrf({
    cookieToken: getCookie(event, CSRF_COOKIE),
    headerToken: getHeader(event, CSRF_HEADER),
    key: runtime.csrfKey,
    binding,
    now: Date.now(),
    // Exact runtime CSRF lifetime instead of the helper's default.
    maxAgeMs: runtime.config.csrfMaxAgeSeconds * 1000
  })
  return resolveEventClientIp(event, runtime).ip.address
}

/** JSON body: content type is asserted before a single body byte is read. */
export async function readGuestJson(
  event: H3Event,
  runtime: BffRuntime,
  maxBytes: number = GUEST_MAX_JSON_BYTES
): Promise<unknown> {
  assertJsonContentType(getHeader(event, 'content-type'))
  return await readEventJsonBody(event, runtime, maxBytes)
}

/**
 * A stable per-visitor intent key for the *first* request of a visitor that has no
 * draft cookie yet: the bound CSRF token. Two concurrent first requests therefore
 * resolve to one intent instead of two drafts, without trusting any client value.
 */
export async function guestIntent(
  event: H3Event,
  runtime: BffRuntime,
  ip: string
): Promise<GuestIntent> {
  const cookieId = readGuestCookieId(event)
  if (cookieId) return { cookieId, clientIp: ip }
  const token = getCookie(event, CSRF_COOKIE)
  const binding = await getCsrfBinding(event, runtime)
  const intentKey =
    typeof token === 'string' && token.length > 0
      ? createHmac('sha256', runtime.csrfKey).update(`${binding}|${token}`).digest('base64url')
      : undefined
  return { intentKey, clientIp: ip }
}

/* --------------------------------------------------------------- cookie */

export function readGuestCookieId(event: H3Event): string | undefined {
  const value = getCookie(event, GUEST_DRAFT_COOKIE)
  return typeof value === 'string' && GUEST_COOKIE_ID_PATTERN.test(value) ? value : undefined
}

export function setGuestCookie(event: H3Event, runtime: BffRuntime, id: string): void {
  const socket = parseIp(event.node?.req?.socket?.remoteAddress)
  const secure =
    !runtime.config.allowInsecureLoopbackCookies ||
    process.env.NODE_ENV === 'production' ||
    socket === null ||
    !isLoopbackIp(socket) ||
    !isLoopbackHostname(event.node?.req?.headers?.host)
  setCookie(event, GUEST_DRAFT_COOKIE, id, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/api/bff/guest',
    secure,
    maxAge: 6 * 60 * 60
  })
}

/* --------------------------------------------------------------- draft store */

const storeRegistries = new WeakMap<object, Map<string, GuestDraftStore>>()
const fallbackRegistries = new Map<string, GuestDraftStore>()
const MAX_STORE_IDENTITIES = 4

/**
 * One draft store per *stable* identity: the server session-store object plus the
 * validated upstream origin and a digest of the derived CSRF key. The runtime
 * wrapper object is recreated per request, so it is never the key. No raw secret
 * is stored as a map key.
 */
export function guestDraftStore(runtime: BffRuntime, origin: string): GuestDraftStore {
  const identity = `${origin}|${createHmac('sha256', runtime.csrfKey)
    .update(GUEST_DRAFT_PURPOSE)
    .digest('base64url')
    .slice(0, 22)}`
  const holder = runtime.store as unknown
  const registry =
    typeof holder === 'object' && holder !== null
      ? (storeRegistries.get(holder) ?? new Map<string, GuestDraftStore>())
      : (fallbackRegistries as Map<string, GuestDraftStore>)
  const existing = registry.get(identity)
  if (existing) return existing
  const created = createGuestDraftStore(
    createHmac('sha256', runtime.csrfKey).update(GUEST_DRAFT_PURPOSE).digest()
  )
  registry.set(identity, created)
  while (registry.size > MAX_STORE_IDENTITIES) {
    const oldest = registry.keys().next().value
    if (oldest === undefined || oldest === identity) break
    registry.delete(oldest)
  }
  if (typeof holder === 'object' && holder !== null) storeRegistries.set(holder, registry)
  return created
}

export interface GuestDraftContext {
  store: GuestDraftStore
  intent: GuestIntent
}

export async function guestDraftContext(
  event: H3Event,
  runtime: BffRuntime,
  origin: string,
  ip: string
): Promise<GuestDraftContext> {
  return {
    store: guestDraftStore(runtime, origin),
    intent: await guestIntent(event, runtime, ip)
  }
}

export async function issueGuestDraft(
  context: GuestDraftContext,
  create: () => Promise<number>
): Promise<IssuedDraft> {
  try {
    return await context.store.issue(context.intent, create)
  } catch (error) {
    if (error instanceof BffError) throw error
    throw new BffError(503, 'busy', '服务繁忙，请稍后重试')
  }
}

/* --------------------------------------------------------------- upstream */

export interface GuestUpstreamOptions {
  bridgeSecret?: string
  origin: string
  fetch?: typeof fetch
  timeoutMs?: number
  maxResponseBytes?: number
}

export interface GuestUpstreamRequest {
  operation: GuestOperation
  body?: Record<string, unknown> | FormData
  /** Server-only JWT for authenticated participant operations. */
  bearerToken?: string
  /** Exactly one validated address, sent as `X-Forwarded-For`. */
  clientIp: string
  signal?: AbortSignal
}

export interface GuestUpstreamResponse {
  status: number
  data: unknown
}

export interface GuestUpstream {
  request: (request: GuestUpstreamRequest) => Promise<GuestUpstreamResponse>
}

export function createGuestUpstream(options: GuestUpstreamOptions): GuestUpstream {
  const send = options.fetch ?? fetch
  const timeoutMs = options.timeoutMs ?? GUEST_UPSTREAM_TIMEOUT_MS
  const maxBytes = options.maxResponseBytes ?? GUEST_UPSTREAM_MAX_RESPONSE_BYTES

  return {
    async request(request) {
      const { method, path } = resolveGuestOperation(request.operation)
      // Rebinds the configured origin and rejects anything but fixed API paths.
      const url = upstreamUrl(options.origin, path)
      const controller = new AbortController()
      // One deadline spans response headers *and* the body.
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      const abort = (): void => controller.abort()
      request.signal?.addEventListener('abort', abort, { once: true })
      const headers: Record<string, string> = {
        accept: 'application/json',
        // Rebuilt identity: never the browser's raw forwarding headers.
        'x-forwarded-for': request.clientIp
      }
      let body: BodyInit | undefined
      if (request.body instanceof FormData) body = request.body
      else if (request.body) {
        headers['content-type'] = 'application/json'
        body = JSON.stringify(request.body)
      }
      if (options.bridgeSecret) headers['x-bff-bridge'] = options.bridgeSecret
      if (request.bearerToken) headers.authorization = `Bearer ${request.bearerToken}`

      try {
        if (options.bridgeSecret && ['draft', 'save', 'uploadContent'].includes(request.operation.name)) {
          const scope = request.operation.name === 'draft' ? 'draft' : request.operation.name === 'save' ? 'save' : 'upload'
          const rawId = request.operation.name === 'draft' ? 0 : request.operation.name === 'save' ? request.operation.id
            : request.body instanceof FormData ? request.body.get('eid') : undefined
          headers[GUEST_DRAFT_PROOF_HEADER] = signGuestDraftProof(options.bridgeSecret, scope, Number(rawId), request.clientIp)
        }
        const response = await send(url, {
          method,
          headers,
          body,
          redirect: 'manual',
          signal: controller.signal
        })
        if (response.status >= 300 && response.status < 400) {
          await response.body?.cancel().catch(() => undefined)
          throw new BffError(502, 'upstream_unavailable', '服务暂时不可用，请稍后重试')
        }
        const declared = Number(response.headers.get('content-length') ?? Number.NaN)
        if (Number.isFinite(declared) && declared > maxBytes) {
          await response.body?.cancel().catch(() => undefined)
          throw new BffError(502, 'upstream_unavailable', '服务暂时不可用，请稍后重试')
        }

        // Streamed, capped read: an unbounded or chunked body is cancelled before
        // it can be buffered in full.
        const reader = response.body?.getReader()
        const chunks: Uint8Array[] = []
        let total = 0
        if (reader) {
          for (;;) {
            const { done, value } = await reader.read()
            if (done) break
            if (!value) continue
            total += value.byteLength
            if (total > maxBytes) {
              await reader.cancel().catch(() => undefined)
              controller.abort()
              throw new BffError(502, 'upstream_unavailable', '服务暂时不可用，请稍后重试')
            }
            chunks.push(value)
          }
        }
        const bytes = new Uint8Array(total)
        let offset = 0
        for (const chunk of chunks) {
          bytes.set(chunk, offset)
          offset += chunk.byteLength
        }
        let text = ''
        if (total > 0) {
          try {
            text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
          } catch {
            throw new BffError(502, 'upstream_unavailable', '服务暂时不可用，请稍后重试')
          }
        }
        if (!text) return { status: response.status, data: null }
        let data: unknown
        try {
          data = JSON.parse(text)
        } catch {
          // A successful status with unparseable JSON is an upstream failure, not null.
          throw new BffError(502, 'upstream_unavailable', '服务暂时不可用，请稍后重试')
        }
        return { status: response.status, data }
      } catch (error) {
        if (error instanceof BffError) throw error
        throw new BffError(502, 'upstream_unavailable', '服务暂时不可用，请稍后重试')
      } finally {
        clearTimeout(timer)
        request.signal?.removeEventListener('abort', abort)
      }
    }
  }
}

export function guestUpstream(runtime: BffRuntime, context: GuestContext): GuestUpstream {
  return createGuestUpstream({
    origin: context.origin,
    bridgeSecret: context.bridgeSecret,
    timeoutMs: runtime.config.upstreamTimeoutMs
  })
}

/** Fixed, redacted translation of an upstream failure status. */
export function guestUpstreamError(status: number): BffError {
  if (status === 400) return new BffError(400, 'invalid_request', '提交的内容未通过校验')
  if (status === 403) return new BffError(403, 'forbidden', '当前状态不允许该操作')
  if (status === 404) return new BffError(404, 'not_found', '找不到该活动')
  if (status === 409) return new BffError(409, 'conflict', '操作冲突，请重试')
  if (status === 429) return new BffError(429, 'rate_limited', '操作过于频繁，请稍后再试')
  return new BffError(502, 'upstream_unavailable', '服务暂时不可用，请稍后重试')
}

/* --------------------------------------------------------------- projections */

/** Safe positive integers only: `Number(true)` and unsafe integers are rejected. */
export function projectDraftId(payload: unknown): number {
  const raw =
    typeof payload === 'object' && payload !== null ? (payload as { id?: unknown }).id : undefined
  if (typeof raw !== 'number' || !Number.isSafeInteger(raw) || raw <= 0) {
    throw new BffError(502, 'upstream_unavailable', '服务暂时不可用，请稍后重试')
  }
  return raw
}

/** Fixed success copy; the upstream message is never echoed to the browser. */
export function projectSavedEvent(id: number): { id: number, message: string } {
  return { id, message: '保存成功' }
}

/** `/uploads/...` only: no traversal, backslash, encoded separators, authority or query. */
export function isSafeUploadUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 500) return false
  if (!value.startsWith('/uploads/')) return false
  if (value.includes('\\') || value.includes('?') || value.includes('#')) return false
  if (value.startsWith('/uploads//')) return false
  if (/%2e|%2f|%5c/i.test(value)) return false
  if (value.includes('@') || value.includes(':')) return false
  const segments = value.split('/')
  if (segments.some((segment) => segment === '.' || segment === '..')) return false
  const dot = value.lastIndexOf('.')
  if (dot < 0) return false
  return ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'].includes(value.slice(dot).toLowerCase())
}

export function projectUpload(payload: unknown): { url: string } {
  const url =
    typeof payload === 'object' && payload !== null ? (payload as { url?: unknown }).url : undefined
  if (!isSafeUploadUrl(url)) {
    throw new BffError(502, 'upstream_unavailable', '服务暂时不可用，请稍后重试')
  }
  return { url }
}

export interface GuestSignupProjection {
  id: number
  common_id: string
  qq: string
  avatar: string
  machine_sign: string
  pilot_source: string
}

/**
 * The visitor's own signup only, projected through the shared schema. A malformed
 * upstream shape is a 502, never a silent "no signup".
 */
export function projectSignupRecord(payload: unknown): { data: GuestSignupProjection | null } {
  const row =
    typeof payload === 'object' && payload !== null ? (payload as { data?: unknown }).data : undefined
  if (row === null || row === undefined) return { data: null }
  const parsed = eventSignupRecordSchema.safeParse(row)
  if (!parsed.success) {
    throw new BffError(502, 'upstream_unavailable', '服务暂时不可用，请稍后重试')
  }
  return {
    data: {
      id: parsed.data.id,
      common_id: parsed.data.common_id,
      qq: parsed.data.qq,
      avatar: parsed.data.avatar,
      machine_sign: parsed.data.machine_sign,
      pilot_source: parsed.data.pilot_source
    }
  }
}

/* --------------------------------------------------------------- rules */

export interface SignupEventSnapshot {
  id: number
  type: string
  status: string
  content: unknown
}

const contentText = (content: unknown, key: string): string => {
  if (typeof content !== 'object' || content === null) return ''
  const value = (content as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : ''
}

/**
 * Signup gate. The frozen STG/则则 `time` is the activity time, not a signup
 * deadline, so only an explicit `content.deadline` can close signups early — and
 * only when it parses as a Beijing-anchored timestamp. Free-form text never gates
 * and the backend stays the final authority (`published`/`ongoing`).
 */
export function assertSignupOpen(snapshot: SignupEventSnapshot, now: number = Date.now()): void {
  if (snapshot.type !== 'STG' && snapshot.type !== '则则') {
    throw new BffError(400, 'signup_unsupported', '此活动不支持报名')
  }
  if (!['published', 'ongoing'].includes(snapshot.status)) {
    throw new BffError(403, 'signup_closed', '当前状态不允许报名')
  }
  const raw = contentText(snapshot.content, 'deadline')
  if (!raw) return
  const deadline = parseClubTime(raw)
  if (Number.isFinite(deadline) && deadline <= now) {
    throw new BffError(403, 'signup_closed', '报名已截止')
  }
}

/** The archived avatar route accepts any public status, not only signup-open ones. */
export function isPublicEventStatusForUpload(status: unknown): boolean {
  return (
    typeof status === 'string' &&
    ['published', 'ongoing', 'ended', 'settled'].includes(status)
  )
}

export function parseGuestSignupBody(body: unknown): EventSignupInput {
  const parsed = eventSignupSchema.safeParse(body)
  if (!parsed.success) {
    throw new BffError(400, 'invalid_request', parsed.error.issues[0]?.message ?? '请检查报名信息')
  }
  return parsed.data
}

/* --------------------------------------------------------------- guest save payload */

const PERSON_PREFIXES = ['initiator', 'a', 'b'] as const

const PROTECTED_CONTENT_KEYS: ReadonlySet<string> = new Set([
  'id',
  'status',
  'results',
  'result',
  'results_updated_at',
  'settlement',
  'completion',
  'rewarded',
  'penalty_result',
  'created_by',
  'created_by_name',
  'created_by_avatar',
  'updated_by',
  'updated_by_name',
  'updated_by_avatar',
  'created_at',
  'updated_at',
  'deleted_at',
  'visitor_ip',
  'user_id'
])

export interface GuestDraftSave {
  type: EventType
  title: string
  content: Record<string, unknown>
}

const typeShape = (type: EventType) => {
  const fields = EVENT_FIELDS[type]
  const persons = PERSON_PREFIXES.filter((prefix) =>
    fields.some((item) => item.key.startsWith(`${prefix}_`))
  )
  const keys = fields
    .map((item) => item.key)
    .filter((key) => !PERSON_PREFIXES.some((prefix) => key.startsWith(`${prefix}_`)))
  return { fields, persons, keys }
}

/** Required content paths for a type, mirroring the shared catalogue's required rules. */
function requiredPaths(type: EventType, content: Record<string, unknown>): string[] {
  const paths: string[] = []
  for (const item of EVENT_FIELDS[type]) {
    const duoPerson = item.duo ? 'b' : undefined
    if (duoPerson && !isPlainObject(content[duoPerson])) continue
    const [prefix, field] = item.key.includes('_')
      ? [item.key.slice(0, item.key.indexOf('_')), item.key.slice(item.key.indexOf('_') + 1)]
      : [undefined, item.key]
    if (!item.required) continue
    if (prefix && PERSON_PREFIXES.includes(prefix as (typeof PERSON_PREFIXES)[number])) {
      paths.push(`${prefix}.${field}`)
      continue
    }
    paths.push(field)
  }
  return paths
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const readPath = (content: Record<string, unknown>, path: string): unknown => {
  const [head, tail] = path.split('.')
  if (!tail) return content[head as string]
  const nested = content[head as string]
  return isPlainObject(nested) ? nested[tail] : undefined
}

/**
 * Depth/size/string bounds so a guest cannot smuggle a huge or deep content tree.
 *
 * `exemptKeys` applies only at the level immediately below a person key: the
 * archived guest form builds `initiator`/`a`/`b` objects that legitimately carry
 * an `id`, while `id` stays protected everywhere else. The person key set itself
 * is still enforced by the strict member allowlist in `parseGuestDraftSave`.
 */
const PERSON_MEMBER_KEYS: ReadonlySet<string> = new Set(['id', 'qq', 'avatar', 'goal'])

function assertContentBounds(value: unknown, depth = 0, exemptKeys?: ReadonlySet<string>): void {
  if (depth > GUEST_MAX_CONTENT_DEPTH) {
    throw new BffError(400, 'invalid_request', '提交的内容未通过校验')
  }
  if (typeof value === 'string') {
    if (value.length > GUEST_MAX_STRING_LENGTH) {
      throw new BffError(400, 'invalid_request', '提交的内容未通过校验')
    }
    return
  }
  if (Array.isArray(value)) {
    if (value.length > 32) throw new BffError(400, 'invalid_request', '提交的内容未通过校验')
    for (const entry of value) assertContentBounds(entry, depth + 1)
    return
  }
  if (isPlainObject(value)) {
    const keys = Object.keys(value)
    if (keys.length > 32) throw new BffError(400, 'invalid_request', '提交的内容未通过校验')
    for (const key of keys) {
      if (PROTECTED_CONTENT_KEYS.has(key) && !(exemptKeys?.has(key) ?? false)) {
        throw new BffError(400, 'invalid_request', '提交的内容未通过校验')
      }
      const childExempt = (PERSON_PREFIXES as readonly string[]).includes(key) ? PERSON_MEMBER_KEYS : undefined
      assertContentBounds(value[key], depth + 1, childExempt)
    }
  }
}

/**
 * Guest save payload: only the type's own catalogue fields (plus its person
 * objects) may pass, required fields are enforced, protected keys such as
 * settlement/results/created_by/status are rejected at every depth, and the whole
 * content tree is size/depth bounded. Unknown fields are only preserved on the
 * future protected admin route.
 */
export function parseGuestDraftSave(body: unknown): GuestDraftSave {
  if (!isPlainObject(body)) {
    throw new BffError(400, 'invalid_request', '提交的内容未通过校验')
  }
  for (const key of Object.keys(body)) {
    if (!['type', 'title', 'content', 'submit'].includes(key)) {
      throw new BffError(400, 'invalid_request', '提交的内容未通过校验')
    }
  }
  if (body.submit !== true) {
    throw new BffError(400, 'invalid_request', 'guest 只能提交草稿审核')
  }
  const type = typeof body.type === 'string' ? body.type.trim() : ''
  if (!(EVENT_TYPES as readonly string[]).includes(type)) {
    throw new BffError(400, 'invalid_request', '提交的内容未通过校验')
  }
  const title = typeof body.title === 'string' ? body.title.trim() : ''
  if (!title || title.length > 200) {
    throw new BffError(400, 'invalid_request', '提交的内容未通过校验')
  }
  const content = body.content
  if (!isPlainObject(content)) {
    throw new BffError(400, 'invalid_request', '提交的内容未通过校验')
  }
  if (Buffer.byteLength(JSON.stringify(content), 'utf8') > GUEST_MAX_CONTENT_BYTES) {
    throw new BffError(413, 'too_large', '提交的内容过大')
  }
  assertContentBounds(content)

  const shape = typeShape(type as EventType)
  for (const key of Object.keys(content)) {
    if (!shape.keys.includes(key) && !shape.persons.includes(key as (typeof PERSON_PREFIXES)[number])) {
      throw new BffError(400, 'invalid_request', '提交的内容未通过校验')
    }
  }
  for (const person of shape.persons) {
    const value = content[person]
    if (value === null && person === 'b') continue
    if (!isPlainObject(value)) {
      throw new BffError(400, 'invalid_request', '提交的内容未通过校验')
    }
    for (const key of Object.keys(value)) {
      if (!['id', 'qq', 'avatar', 'goal'].includes(key)) {
        throw new BffError(400, 'invalid_request', '提交的内容未通过校验')
      }
    }
  }
  for (const path of requiredPaths(type as EventType, content)) {
    const value = readPath(content, path)
    if (typeof value !== 'string' || !value.trim()) {
      throw new BffError(400, 'invalid_request', '请填写或上传必填内容')
    }
  }
  return { type: type as EventType, title, content }
}

/* --------------------------------------------------------------- participant identity */

/**
 * Authenticated participant operations use the cookie session only as an opaque
 * id, then a fresh `/me` verification returns the server-only upstream token.
 * The cookie's role/user is never trusted; an invalid cookie fails 401 instead of
 * silently falling back to a guest IP identity.
 */
export async function guestParticipantToken(
  event: H3Event,
  runtime: BffRuntime
): Promise<string | undefined> {
  const session = await readCookieSession(event, runtime)
  if (session.status === 'none') return undefined
  if (session.status === 'invalid' || !session.id) {
    throw new BffError(401, 'session_invalid', '登录状态已失效，请重新登录')
  }
  const verified = await runtime.auth.verify(session.id)
  if (!verified.upstreamToken) {
    throw new BffError(401, 'session_invalid', '登录状态已失效，请重新登录')
  }
  return verified.upstreamToken
}

/* --------------------------------------------------------------- invalidation */

export type GuestInvalidationScope = 'events' | 'logs'

/**
 * The cache worker's real helper (synchronous, generation bump). Called only after
 * a confirmed successful mutation; an invalidation failure must not turn a
 * confirmed write into a user-visible error, so it is contained here and reported
 * through the standard server error surface instead.
 */
export function invalidateAfterGuestMutation(scopes: readonly GuestInvalidationScope[]): void {
  try {
    invalidatePublicData(scopes)
  } catch (error) {
    console.error('[guest-bff] public data invalidation failed', error)
  }
}
