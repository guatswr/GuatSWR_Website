/**
 * Client boundary for the BFF auth API.
 *
 * Only the four explicit internal paths are reachable: there is no arbitrary
 * proxy, no browser `Authorization` header, no external origin, and requests
 * are same-origin with the HttpOnly session cookie. The CSRF token lives in
 * client memory only (never localStorage/sessionStorage/cookies/URLs).
 */

export const BFF_AUTH_PATHS = {
  csrf: '/api/bff/auth/csrf',
  login: '/api/bff/auth/login',
  session: '/api/bff/auth/session',
  logout: '/api/bff/auth/logout',
} as const

export type BffAuthPath = typeof BFF_AUTH_PATHS[keyof typeof BFF_AUTH_PATHS]

const ALLOWED_PATHS: readonly string[] = Object.values(BFF_AUTH_PATHS)

export type BffErrorCode =
  | 'invalid_credentials'
  | 'rate_limited'
  | 'invalid_request'
  | 'session_expired'
  | 'unauthenticated'
  | 'forbidden'
  | 'csrf_invalid'
  | 'login_verification_failed'
  | 'not_found'
  | 'conflict'
  | 'upstream_unavailable'
  | 'upstream_timeout'
  | 'upstream_invalid_response'
  | 'upstream_error'
  | 'payload_too_large'
  | 'unsupported_media_type'
  | 'origin_rejected'
  | 'request_timeout'
  | 'service_unavailable'
  | 'internal_error'
  | 'network_error'
  | 'aborted'
  | 'invalid_response'

export class BffRequestError extends Error {
  /** HTTP status, or 0 when the request never reached the BFF. */
  readonly status: number
  readonly code: BffErrorCode
  /** Only transport failures and 5xx are worth a user-visible retry. */
  readonly retryable: boolean

  constructor(status: number, code: BffErrorCode, message: string) {
    super(message)
    this.name = 'BffRequestError'
    this.status = status
    this.code = code
    this.retryable = status === 0 || status >= 500
  }
}

export function isBffRequestError(error: unknown): error is BffRequestError {
  return error instanceof BffRequestError
}

function assertAllowedPath(path: string): asserts path is BffAuthPath {
  if (!ALLOWED_PATHS.includes(path)) {
    throw new Error(`BFF client refused a non-allowlisted path: ${path}`)
  }
}

interface BffErrorBody {
  error?: { code?: unknown, message?: unknown }
}

function readErrorBody(value: unknown): { code?: BffErrorCode, message?: string } {
  if (typeof value !== 'object' || value === null) return {}
  const body = value as BffErrorBody
  return {
    code: safeErrorCode(body.error?.code),
    message: safeErrorMessage(body.error?.message),
  }
}

export interface BffRequestOptions {
  method: 'GET' | 'POST'
  body?: unknown
  csrfToken?: string
  timeoutMs?: number
  signal?: AbortSignal
  fetchImpl?: typeof fetch
}

const DEFAULT_TIMEOUT_MS = 15_000
// Auth responses are tiny; anything larger is a broken or hostile response.
const MAX_RESPONSE_BYTES = 64 * 1024
const MAX_ERROR_MESSAGE_LENGTH = 200

// Only server error codes this client understands are projected; anything else
// becomes a generic response error instead of reflecting an upstream value.
const SAFE_ERROR_CODES: readonly BffErrorCode[] = [
  'invalid_credentials',
  'rate_limited',
  'invalid_request',
  'session_expired',
  'unauthenticated',
  'forbidden',
  'csrf_invalid',
  'login_verification_failed',
  'not_found',
  'conflict',
  'upstream_unavailable',
  'upstream_timeout',
  'upstream_invalid_response',
  'upstream_error',
  'payload_too_large',
  'unsupported_media_type',
  'origin_rejected',
  'request_timeout',
  'service_unavailable',
  'internal_error',
] as const

function safeErrorCode(value: unknown): BffErrorCode | undefined {
  return typeof value === 'string' && (SAFE_ERROR_CODES as readonly string[]).includes(value)
    ? value as BffErrorCode
    : undefined
}

function safeErrorMessage(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  // eslint-disable-next-line no-control-regex
  const stripped = value.replace(/[\u0000-\u001F\u007F-\u009F]/g, '').trim()
  if (stripped.length === 0 || stripped.length > MAX_ERROR_MESSAGE_LENGTH) return undefined
  return stripped
}

/** Streamed cap: never buffer an unbounded response before checking its size. */
async function readCappedText(response: Response, maxBytes: number): Promise<string> {
  const declared = response.headers.get('content-length')
  if (declared && /^\d+$/.test(declared) && Number.parseInt(declared, 10) > maxBytes) {
    await response.body?.cancel().catch(() => {})
    throw new BffRequestError(response.status, 'invalid_response', '服务响应异常')
  }
  if (!response.body) {
    const text = await response.text()
    if (new TextEncoder().encode(text).byteLength > maxBytes) {
      throw new BffRequestError(response.status, 'invalid_response', '服务响应异常')
    }
    return text
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel().catch(() => {})
      throw new BffRequestError(response.status, 'invalid_response', '服务响应异常')
    }
    chunks.push(value)
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
    throw new BffRequestError(response.status, 'invalid_response', '服务响应异常')
  }
}

/**
 * Perform one same-origin BFF request. Redirects are followed only as far as
 * the fetch default allows for same-origin URLs, credentials are
 * `same-origin`, and no browser credential header is ever added by hand.
 */
export async function bffRequest(path: BffAuthPath, options: BffRequestOptions): Promise<unknown> {
  assertAllowedPath(path)

  const fetchImpl = options.fetchImpl ?? globalThis.fetch
  if (typeof fetchImpl !== 'function') {
    throw new BffRequestError(0, 'network_error', '当前环境不支持网络请求')
  }

  const headers = new Headers({ accept: 'application/json' })
  if (options.body !== undefined) headers.set('content-type', 'application/json')
  if (options.csrfToken) headers.set('x-csrf-token', options.csrfToken)

  if (options.signal?.aborted) {
    // An already-aborted caller must not trigger a network side effect.
    throw new BffRequestError(0, 'aborted', '请求已取消')
  }

  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, Math.max(1, options.timeoutMs ?? DEFAULT_TIMEOUT_MS))
  const onExternalAbort = () => controller.abort()
  options.signal?.addEventListener('abort', onExternalAbort, { once: true })

  let response: Response
  let text: string
  try {
    response = await fetchImpl(path, {
      method: options.method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      credentials: 'same-origin',
      // Never follow a redirect: a 30x could resend credentials or a CSRF
      // token to another origin.
      redirect: 'error',
      signal: controller.signal,
    })
    // The deadline covers the body read too, not just response headers.
    text = await readCappedText(response, MAX_RESPONSE_BYTES)
  }
  catch (error) {
    if (error instanceof BffRequestError) throw error
    if (timedOut) throw new BffRequestError(0, 'request_timeout', '请求超时，请重试')
    if (options.signal?.aborted) throw new BffRequestError(0, 'aborted', '请求已取消')
    throw new BffRequestError(0, 'network_error', '服务器连接失败，请检查网络或后端状态')
  }
  finally {
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', onExternalAbort)
  }

  let parsed: unknown
  if (text.length > 0) {
    try {
      parsed = JSON.parse(text)
    }
    catch {
      parsed = undefined
    }
  }

  if (!response.ok) {
    const { code, message } = readErrorBody(parsed)
    const fallback = response.status === 401
      ? '登录状态已失效，请重新登录'
      : response.status === 403
        ? '请求被拒绝'
        : '请求失败，请稍后再试'
    // Only a known code may carry a server message, and never on a 5xx.
    const safeMessage = code && response.status < 500 ? message : undefined
    throw new BffRequestError(
      response.status,
      code ?? 'invalid_response',
      safeMessage ?? fallback,
    )
  }

  if (parsed === undefined) {
    throw new BffRequestError(response.status, 'invalid_response', '服务响应异常')
  }
  return parsed
}

export function isCsrfRejection(error: unknown): error is BffRequestError {
  return isBffRequestError(error) && error.status === 403 && error.code === 'csrf_invalid'
}

export interface BffMutationOptions extends Omit<BffRequestOptions, 'method' | 'csrfToken'> {
  csrfToken: () => string
  /** Fetches a fresh token from `/api/bff/auth/csrf`. */
  refreshCsrf: () => Promise<string>
}

export interface BffMutationResult {
  data: unknown
  csrfToken: string
}

/**
 * State-changing call with strictly bounded CSRF recovery: retry exactly once,
 * only when the server explicitly rejected the request with `csrf_invalid`
 * (proving it was rejected before any write). Transport failures, timeouts,
 * 5xx, `forbidden` and every other status are never retried.
 */
export async function bffMutation(path: BffAuthPath, options: BffMutationOptions): Promise<BffMutationResult> {
  let token = options.csrfToken()
  try {
    const data = await bffRequest(path, { ...options, method: 'POST', csrfToken: token })
    return { data, csrfToken: token }
  }
  catch (error) {
    if (!isCsrfRejection(error)) throw error
    token = await options.refreshCsrf()
    const data = await bffRequest(path, { ...options, method: 'POST', csrfToken: token })
    return { data, csrfToken: token }
  }
}

// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F-\u009F]/
const TRUSTED_LOCAL_BASE = 'http://localhost'

function isLoginPath(path: string): boolean {
  const withoutSuffix = path.split(/[?#]/)[0] ?? ''
  const normalized = withoutSuffix.toLowerCase().replace(/\/+$/, '')
  return normalized === '/login' || normalized.startsWith('/login/')
}

function isSafeLocalCandidate(value: string): boolean {
  if (value.length === 0 || value.length > 512) return false
  if (CONTROL_CHARACTERS.test(value)) return false
  if (value.includes('\\')) return false
  if (!value.startsWith('/') || value.startsWith('//')) return false
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)) return false
  return true
}

/**
 * Only same-origin, absolute-path return targets are accepted.
 *
 * Percent-encoding is decoded (bounded) before validation so `%2f%2fevil`,
 * `%5c`, `%6cogin` and double-encoded variants cannot smuggle an authority,
 * backslash or the login loop. The candidate is then resolved against a fixed
 * trusted local base and must stay on that origin; the original encoded path is
 * returned so the router sees exactly what the caller sent.
 */
export function safeLocalReturnPath(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  // A control character anywhere in the raw value is rejected outright instead
  // of being trimmed away: `/admin\t` must not silently become `/admin`.
  if (CONTROL_CHARACTERS.test(value)) return undefined
  const candidate = value.trim()
  if (!isSafeLocalCandidate(candidate)) return undefined

  let decoded = candidate
  for (let pass = 0; pass < 2; pass += 1) {
    let next: string
    try {
      next = decodeURIComponent(decoded)
    }
    catch {
      return undefined
    }
    if (next === decoded) break
    decoded = next
    if (!isSafeLocalCandidate(decoded)) return undefined
  }

  const pathOnly = decoded.split(/[?#]/)[0] ?? ''
  if (pathOnly.split('/').includes('..')) return undefined

  let resolved: URL
  try {
    resolved = new URL(decoded, TRUSTED_LOCAL_BASE)
  }
  catch {
    return undefined
  }
  if (resolved.origin !== TRUSTED_LOCAL_BASE) return undefined
  if (isLoginPath(`${resolved.pathname}${resolved.search}${resolved.hash}`)) return undefined
  return candidate
}

/** User-visible message for any thrown value, without leaking internals. */
export function bffErrorMessage(error: unknown, fallback: string): string {
  if (isBffRequestError(error) && typeof error.message === 'string' && error.message.length > 0) {
    return error.message
  }
  return fallback
}
