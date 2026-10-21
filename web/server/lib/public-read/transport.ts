import { upstreamUrl } from '../../utils/upstream'
import { upstreamUnavailable, publicNotFound } from './errors'

/** Corruption guard only: legitimate lists are preserved in full. */
const MAX_JSON_BYTES = 8 * 1024 * 1024
const UPSTREAM_TIMEOUT_MS = 8_000

export interface PublicReadContext {
  /** Administrator-configured private origin; never derived from the request. */
  apiBase: string
  /**
   * Private deadline override for tests and constrained callers. It can only
   * shorten the production deadline: absent, non-finite, non-positive or larger
   * than `UPSTREAM_TIMEOUT_MS` all fall back to the 8 s default. It is never
   * built from browser input.
   */
  timeoutMs?: number | undefined
}

/**
 * Effective upstream deadline in milliseconds. Only the private context may
 * lower it; a browser query value can never reach this function.
 */
export const resolveUpstreamTimeout = (ctx: PublicReadContext): number => {
  const injected = ctx.timeoutMs
  if (typeof injected !== 'number' || !Number.isFinite(injected)
    || injected <= 0 || injected > UPSTREAM_TIMEOUT_MS) {
    return UPSTREAM_TIMEOUT_MS
  }
  return injected
}

interface ReadOptions {
  query?: Record<string, string | number | undefined> | undefined
  /** Legacy statuses that carry public meaning for one specific route. */
  statusOverrides?: Record<number, () => Error> | undefined
}

export const cancelUpstreamBody = (response: Response): void => {
  // Release the upstream socket when the body is rejected unread.
  void response.body?.cancel().catch(() => {})
}

const concatChunks = (chunks: Uint8Array[]): Uint8Array => {
  let total = 0
  for (const chunk of chunks) total += chunk.byteLength
  const merged = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }
  return merged
}

/**
 * Read the body through the byte budget. The cap is enforced while reading (not
 * after buffering) and the upstream stream is cancelled as soon as it is
 * exceeded, so a runaway response cannot be allocated in full.
 */
export const readCappedText = async (response: Response): Promise<string> => {
  const declaredLength = Number(response.headers.get('content-length') ?? '')
  if (Number.isFinite(declaredLength) && declaredLength > MAX_JSON_BYTES) {
    cancelUpstreamBody(response)
    throw upstreamUnavailable()
  }
  const body = response.body
  if (!body) throw upstreamUnavailable()
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    let result: { done: boolean, value?: Uint8Array }
    try {
      result = await reader.read()
    }
    catch {
      throw upstreamUnavailable()
    }
    if (result.done) break
    const chunk = result.value
    if (!chunk) continue
    total += chunk.byteLength
    if (total > MAX_JSON_BYTES) {
      await reader.cancel().catch(() => {})
      throw upstreamUnavailable()
    }
    chunks.push(chunk)
  }
  return new TextDecoder().decode(concatChunks(chunks))
}

export const readUpstreamJson = async (
  ctx: PublicReadContext,
  path: string,
  options: ReadOptions = {},
): Promise<unknown> => {
  let response: Response
  try {
    // The query is serialized here (native fetch has no `query` option) from the
    // validated allowlist only: no browser parameter is forwarded verbatim, and
    // a misconfigured origin resolves to the same 502 as the config route.
    const target = new URL(upstreamUrl(ctx.apiBase, path))
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value === undefined) continue
      target.searchParams.set(key, String(value))
    }
    response = await fetch(target, {
      // Only a fixed Accept header: browser credentials, cookies, Origin and
      // forwarding headers must never reach a shared public read.
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(resolveUpstreamTimeout(ctx)),
      redirect: 'error',
    })
  }
  catch {
    throw upstreamUnavailable()
  }
  // Upstream 403 means "not public"; public readers must not learn the difference.
  if (response.status === 404 || response.status === 403) {
    cancelUpstreamBody(response)
    throw publicNotFound()
  }
  if (!response.ok) {
    const override = options.statusOverrides?.[response.status]
    cancelUpstreamBody(response)
    throw override ? override() : upstreamUnavailable()
  }
  const body = await readCappedText(response)
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  }
  catch {
    throw upstreamUnavailable()
  }
  return parsed
}
