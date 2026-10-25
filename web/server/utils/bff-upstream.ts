import { upstreamUrl } from './upstream'
import { BffConfigError } from './bff-errors'

/**
 * Closed upstream route tables. Nothing may be forwarded by pattern: every
 * route has a fixed verb/path, optional allowlisted query keys and its own
 * request/response caps. Later batches extend the table explicitly.
 */
export interface UpstreamRouteDefinition {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  path: string
  /** Query keys the caller may set for this route; anything else is rejected. */
  query?: readonly string[]
  maxRequestBytes?: number
  maxResponseBytes?: number
  /** Only explicitly allowlisted upload routes accept a server-built form. */
  multipart?: boolean
  paramFormats?:Readonly<Record<string,'uuid'>>
}

export type UpstreamRouteTable = Record<string, UpstreamRouteDefinition>

/** Auth-only routes. */
export const UPSTREAM_ROUTES = {
  'auth.login': { method: 'POST', path: '/api/auth/login' },
  'auth.me': { method: 'GET', path: '/api/auth/me' },
} as const satisfies UpstreamRouteTable

export type UpstreamRouteName = keyof typeof UPSTREAM_ROUTES

export type UpstreamFailureKind =
  | 'timeout'
  | 'aborted'
  | 'network'
  | 'redirect'
  | 'too_large'
  | 'request_too_large'
  | 'bad_response'

export class UpstreamFailure extends Error {
  readonly kind: UpstreamFailureKind

  constructor(kind: UpstreamFailureKind, message: string) {
    super(message)
    this.name = 'UpstreamFailure'
    this.kind = kind
  }
}

export interface UpstreamClientOptions {
  origin: string
  fetch?: typeof fetch
  timeoutMs?: number
  maxResponseBytes?: number
  maxRequestBytes?: number
}

export interface UpstreamRequestOptions {
  route: UpstreamRouteName
  body?: unknown
  /** Server-side JWT only. Browser credentials are never accepted here. */
  bearerToken?: string
  /** Validated client address, sent as a single `X-Forwarded-For` value. */
  clientIp?: string
  signal?: AbortSignal
}

export interface FixedUpstreamRequestOptions<RouteName extends string> {
  route: RouteName
  /** Values for `:name` path tokens; only 1..15 digit positive ids are allowed. */
  params?: Record<string, string | number>
  query?: Record<string, string | number | boolean | undefined>
  body?: unknown
  bearerToken?: string
  clientIp?: string
  signal?: AbortSignal
  /** May only tighten the route/global response cap. */
  maxResponseBytes?: number
}

export interface UpstreamJsonResponse {
  status: number
  data: unknown
  retryAfterSeconds?: number
}

export interface UpstreamClient {
  request: (options: UpstreamRequestOptions) => Promise<UpstreamJsonResponse>
}

export interface FixedUpstreamClient<RouteName extends string> {
  request: (options: FixedUpstreamRequestOptions<RouteName>) => Promise<UpstreamJsonResponse>
}

const DEFAULT_TIMEOUT_MS = 8_000
const DEFAULT_MAX_RESPONSE_BYTES = 64 * 1024
const DEFAULT_MAX_REQUEST_BYTES = 16 * 1024
const HARD_MAX_RESPONSE_BYTES = 16 * 1024 * 1024
const MAX_RETRY_AFTER_SECONDS = 900
const PATH_TOKEN = /:([a-zA-Z][a-zA-Z0-9]*)/g

function classifyFetchError(error: unknown, timedOut: boolean, externalAborted: boolean): UpstreamFailureKind {
  if (timedOut) return 'timeout'
  if (externalAborted) return 'aborted'
  const cause = (error as { cause?: { message?: unknown } } | null)?.cause
  const text = [
    error instanceof Error ? error.message : '',
    typeof cause?.message === 'string' ? cause.message : '',
  ].join(' ')
  if (/redirect/i.test(text)) return 'redirect'
  return 'network'
}

function boundedRetryAfter(response: Response): number | undefined {
  const raw = response.headers.get('retry-after')
  if (!raw || !/^\d{1,9}$/.test(raw.trim())) return undefined
  const seconds = Number.parseInt(raw.trim(), 10)
  if (seconds <= 0) return undefined
  return Math.min(seconds, MAX_RETRY_AFTER_SECONDS)
}

async function readCappedText(response: Response, maxBytes: number, abortKind: () => 'timeout' | 'aborted' | null): Promise<string> {
  const declared = response.headers.get('content-length')
  if (declared && /^\d+$/.test(declared) && Number.parseInt(declared, 10) > maxBytes) {
    await response.body?.cancel().catch(() => {})
    throw new UpstreamFailure('too_large', 'Upstream response exceeds the configured limit')
  }

  if (!response.body) {
    const text = await response.text()
    if (Buffer.byteLength(text, 'utf8') > maxBytes) {
      throw new UpstreamFailure('too_large', 'Upstream response exceeds the configured limit')
    }
    return text
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel().catch(() => {})
        throw new UpstreamFailure('too_large', 'Upstream response exceeds the configured limit')
      }
      chunks.push(value)
    }
  }
  catch (error) {
    const kind = abortKind()
    if (kind === 'timeout') throw new UpstreamFailure('timeout', 'Upstream request timed out')
    if (kind === 'aborted') throw new UpstreamFailure('aborted', 'Upstream request was aborted')
    if (error instanceof UpstreamFailure) throw error
    throw new UpstreamFailure('bad_response', 'Upstream response could not be read')
  }

  const merged = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(merged)
  }
  catch {
    throw new UpstreamFailure('bad_response', 'Upstream response is not valid UTF-8')
  }
}

function isSafePathParam(value: unknown): value is string | number {
  if (typeof value === 'number') return Number.isInteger(value) && value > 0 && value <= 999_999_999_999_999
  return typeof value === 'string' && /^\d{1,15}$/.test(value) && Number.parseInt(value, 10) > 0
}

function buildPath(path: string, params: Record<string, string | number> | undefined,formats?:Readonly<Record<string,'uuid'>>): string {
  const supplied = params ?? {}
  const names = Object.keys(supplied)
  let used = 0
  const built = path.replace(PATH_TOKEN, (_match, name: string) => {
    const value = supplied[name]
    const valid=formats?.[name]==='uuid' ? typeof value==='string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value) : isSafePathParam(value)
    if (!valid) throw new BffConfigError('Route parameter is missing or invalid')
    used += 1
    return String(value)
  })
  if (used !== names.length) throw new BffConfigError('Route parameter is not used by this route')
  if (built.includes(':')) throw new BffConfigError('Route definition has an unresolved parameter')
  return built
}

function buildQuery(
  route: UpstreamRouteDefinition,
  query: Record<string, string | number | boolean | undefined> | undefined,
): string {
  if (!query) return ''
  const allowed = new Set(route.query ?? [])
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue
    if (!allowed.has(key)) throw new BffConfigError('Query parameter is not allowlisted for this route')
    const text = typeof value === 'boolean' ? (value ? '1' : '0') : String(value)
    // eslint-disable-next-line no-control-regex
    if (text.length > 200 || /[\u0000-\u001F\u007F]/.test(text)) {
      throw new BffConfigError('Query parameter value is invalid')
    }
    search.set(key, text)
  }
  const encoded = search.toString()
  return encoded.length > 0 ? `?${encoded}` : ''
}

function resolveCap(routeValue: number | undefined, override: number | undefined, globalValue: number): number {
  // The client's configured cap is the ceiling; route and per-request values
  // may only tighten it.
  const values = [globalValue]
  if (typeof routeValue === 'number' && Number.isFinite(routeValue) && routeValue > 0) values.push(routeValue)
  if (typeof override === 'number' && Number.isFinite(override) && override > 0) values.push(override)
  return Math.min(...values, HARD_MAX_RESPONSE_BYTES)
}

/**
 * Build a client for one closed route table. The fetch/header construction is
 * the same hardened path used by the auth endpoints: exact origin, fixed
 * paths, redirects denied, one attempt, timeout, streamed caps, and headers
 * built from scratch (server bearer token and validated XFF only).
 */
export function createFixedUpstreamClient<Routes extends UpstreamRouteTable, RouteName extends keyof Routes & string>(
  options: UpstreamClientOptions & { routes: Routes },
): FixedUpstreamClient<RouteName> {
  let origin: string
  try {
    const firstPath = Object.values(options.routes)[0]?.path
    if (!firstPath) throw new Error('empty route table')
    origin = new URL(upstreamUrl(options.origin, firstPath.replace(PATH_TOKEN, '1'))).origin
  }
  catch {
    throw new BffConfigError('apiBase must be an HTTP(S) origin without credentials or a path')
  }
  const fetchImpl = options.fetch ?? globalThis.fetch
  if (typeof fetchImpl !== 'function') throw new BffConfigError('A fetch implementation is required')
  const timeoutMs = Math.max(1, options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  const globalMaxResponseBytes = Math.max(256, options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES)
  const globalMaxRequestBytes = Math.max(256, options.maxRequestBytes ?? DEFAULT_MAX_REQUEST_BYTES)

  return {
    async request(request) {
      const route = options.routes[request.route] as UpstreamRouteDefinition | undefined
      if (!route) throw new BffConfigError('Upstream route is not allowlisted')
      const path = buildPath(route.path, request.params,route.paramFormats)
      const url = upstreamUrl(origin, path) + buildQuery(route, request.query)

      let payload: string | FormData | undefined
      if (request.body !== undefined) {
        const maxRequestBytes = Math.min(route.maxRequestBytes ?? globalMaxRequestBytes, globalMaxRequestBytes)
        let bytes = 0
        if (request.body instanceof FormData) {
          if (!route.multipart) throw new BffConfigError('Multipart is not allowed for this route')
          payload = request.body
          for (const [name, value] of payload) bytes += Buffer.byteLength(name) + (typeof value === 'string' ? Buffer.byteLength(value) : value.size)
        } else {
          payload = JSON.stringify(request.body)
          if (payload === undefined) throw new UpstreamFailure('bad_response', 'Request body is not serializable')
          bytes = Buffer.byteLength(payload, 'utf8')
        }
        if (bytes > maxRequestBytes) {
          throw new UpstreamFailure('request_too_large', 'Request body exceeds the configured limit')
        }
      }

      const headers = new Headers({ accept: 'application/json' })
      if (typeof payload === 'string') headers.set('content-type', 'application/json')
      if (request.bearerToken) headers.set('authorization', `Bearer ${request.bearerToken}`)
      if (request.clientIp) headers.set('x-forwarded-for', request.clientIp)

      const controller = new AbortController()
      let timedOut = false
      let externalAborted = request.signal?.aborted === true
      const onExternalAbort = () => {
        externalAborted = true
        controller.abort()
      }
      request.signal?.addEventListener('abort', onExternalAbort, { once: true })
      const timer = setTimeout(() => {
        timedOut = true
        controller.abort()
      }, timeoutMs)

      try {
        let response: Response
        try {
          response = await fetchImpl(url, {
            method: route.method,
            headers,
            body: payload,
            redirect: 'error',
            credentials: 'omit',
            signal: controller.signal,
          })
        }
        catch (error) {
          throw new UpstreamFailure(classifyFetchError(error, timedOut, externalAborted), 'Upstream request failed')
        }

        if (response.redirected || (response.status >= 300 && response.status < 400)) {
          throw new UpstreamFailure('redirect', 'Upstream attempted a redirect')
        }

        const maxResponseBytes = resolveCap(route.maxResponseBytes, request.maxResponseBytes, globalMaxResponseBytes)
        const text = await readCappedText(response, maxResponseBytes, () =>
          timedOut ? 'timeout' : externalAborted ? 'aborted' : null)
        const retryAfterSeconds = boundedRetryAfter(response)

        if (text.length === 0) {
          if (response.status === 204 || response.status === 205) {
            return retryAfterSeconds === undefined
              ? { status: response.status, data: null }
              : { status: response.status, data: null, retryAfterSeconds }
          }
          throw new UpstreamFailure('bad_response', 'Upstream returned an empty JSON body')
        }

        let data: unknown
        try {
          data = JSON.parse(text)
        }
        catch {
          throw new UpstreamFailure('bad_response', 'Upstream returned invalid JSON')
        }
        return retryAfterSeconds === undefined
          ? { status: response.status, data }
          : { status: response.status, data, retryAfterSeconds }
      }
      finally {
        clearTimeout(timer)
        request.signal?.removeEventListener('abort', onExternalAbort)
      }
    },
  }
}

/** Auth-only client preserved for the existing auth service/tests. */
export function createUpstreamClient(options: UpstreamClientOptions): UpstreamClient {
  const client = createFixedUpstreamClient<typeof UPSTREAM_ROUTES, UpstreamRouteName>({
    ...options,
    routes: UPSTREAM_ROUTES,
  })
  return {
    request: options_ => client.request(options_),
  }
}
