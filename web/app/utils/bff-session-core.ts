import type { LoginInput, SafeUser } from '@guatswr/shared'
import { safeUserSchema } from '@guatswr/shared'
import { BFF_AUTH_PATHS, BffRequestError, bffMutation, bffRequest, isBffRequestError, isCsrfRejection } from './bff-client'
import type { BffAuthPath } from './bff-client'

/**
 * Framework-agnostic BFF session controller.
 *
 * One instance belongs to one Nuxt application (never a module-global user or
 * query cache). It holds only the safe user projection and the CSRF token in
 * memory, issues no private request until an explicit `refresh`/`login`/
 * `logout`, and clears registered private state on an invalid session (401)
 * while leaving an explicit permission denial (403) untouched.
 *
 * Concurrency model: every async operation captures the current generation.
 * Logout, a new login, a different identity/role and explicit disposal bump the
 * generation, so a delayed response from an older operation is ignored instead
 * of resurrecting a session or overwriting newer state. Refresh and CSRF
 * fetches are deduplicated while in flight.
 */

export type BffSessionStatus = 'unknown' | 'anonymous' | 'authenticated' | 'unavailable'

export interface BffSessionSnapshot {
  status: BffSessionStatus
  user: SafeUser | null
  twofaEnabled: boolean
  expiresAt: number | null
  /** True while a login mutation is in flight; used to block duplicate submits. */
  submitting: boolean
  /** Last sanitized server message code, when a request failed. */
  lastErrorCode: string | null
}

export interface BffSessionCoreDeps {
  fetchImpl?: typeof fetch
  timeoutMs?: number
  /** Runs registered private-state cleanup; must not clear theme preferences. */
  onSessionLost?: () => void
}

/**
 * Memory-only CSRF access for closed guest/admin transports. The facade never
 * exposes a URL: the transport owns its allowlisted path and only asks for a
 * header value.
 */
export interface BffCsrfFacade {
  token: () => string
  ensure: () => Promise<string>
  /** Drops the current token and fetches a fresh one (used after csrf_invalid). */
  invalidate: () => Promise<string>
}

export interface BffMutationFacadeOptions<T> {
  /** Closed transport call; receives the CSRF header value, never a URL. */
  send: (csrfToken: string) => Promise<T>
  isCsrfRejection?: (error: unknown) => boolean
}

export interface BffSessionCore {
  getSnapshot: () => BffSessionSnapshot
  subscribe: (listener: (snapshot: BffSessionSnapshot) => void) => () => void
  refresh: () => Promise<BffSessionSnapshot>
  login: (input: LoginInput) => Promise<BffSessionSnapshot>
  logout: () => Promise<void>
  /**
   * CSRF-protected mutation against one of the allowlisted auth paths, with the
   * memory-only token and at most one explicit `csrf_invalid` retry.
   */
  mutate: (path: BffAuthPath, body: unknown) => Promise<unknown>
  csrf: BffCsrfFacade
  /**
   * Generic CSRF-protected mutation for future closed transports (guest/admin).
   * The caller supplies the request; this only coordinates the token and the
   * single bounded retry. No arbitrary URL forwarding happens here.
   */
  performMutation: <T>(options: BffMutationFacadeOptions<T>) => Promise<T>
  ensureCsrf: () => Promise<string>
  csrfToken: () => string
  clearPrivateState: () => void
  /** Stops the controller; in-flight responses are ignored afterwards. */
  dispose: () => void
}

interface SessionPayload {
  authenticated: boolean
  user: SafeUser | null
  twofaEnabled: boolean
  expiresAt: number | null
}

function initialSnapshot(): BffSessionSnapshot {
  return {
    status: 'unknown',
    user: null,
    twofaEnabled: false,
    expiresAt: null,
    submitting: false,
    lastErrorCode: null,
  }
}

function readSessionPayload(value: unknown): SessionPayload | null {
  if (typeof value !== 'object' || value === null) return null
  const payload = value as Record<string, unknown>
  if (payload.authenticated === false) {
    return { authenticated: false, user: null, twofaEnabled: false, expiresAt: null }
  }
  const user = safeUserSchema.safeParse(payload.user)
  if (!user.success) return null
  return {
    authenticated: true,
    user: user.data,
    twofaEnabled: payload.twofaEnabled === true,
    expiresAt: typeof payload.expiresAt === 'number' && Number.isFinite(payload.expiresAt) ? payload.expiresAt : null,
  }
}

function readCsrfToken(data: unknown): string | undefined {
  if (typeof data !== 'object' || data === null) return undefined
  const token = (data as Record<string, unknown>).csrfToken
  return typeof token === 'string' && token.length > 0 && token.length <= 4096 ? token : undefined
}

export function createBffSessionCore(deps: BffSessionCoreDeps = {}): BffSessionCore {
  let snapshot = initialSnapshot()
  let csrf = ''
  let generation = 0
  let disposed = false
  let inFlightRefresh: Promise<BffSessionSnapshot> | undefined
  let inFlightCsrf: Promise<string> | undefined
  let csrfRequestSeq = 0
  const listeners = new Set<(snapshot: BffSessionSnapshot) => void>()

  const emit = () => {
    for (const listener of listeners) listener(snapshot)
  }
  const update = (patch: Partial<BffSessionSnapshot>) => {
    snapshot = { ...snapshot, ...patch }
    emit()
  }
  const isCurrent = (epoch: number) => !disposed && epoch === generation
  const runPrivateCleanup = () => {
    deps.onSessionLost?.()
  }

  /**
   * Identity adoption is the only place a new generation is created for a
   * successful read: any older in-flight response is stale from that point on,
   * and a different user or role clears the previous user's private data first.
   */
  const adoptIdentity = (payload: SessionPayload) => {
    const previous = snapshot.user
    const next = payload.user as SafeUser
    // Only a *different* user or role invalidates the previous user's private
    // data; a first adoption (anonymous -> user) has nothing to clear, and the
    // same user re-authenticating keeps their own cache.
    const changed = previous !== null && (previous.id !== next.id || previous.role !== next.role)
    if (changed) runPrivateCleanup()
    update({
      status: 'authenticated',
      user: next,
      twofaEnabled: payload.twofaEnabled,
      expiresAt: payload.expiresAt,
      submitting: false,
      lastErrorCode: null,
    })
    generation += 1
  }

  const clearPrivateState = () => {
    generation += 1
    csrf = ''
    runPrivateCleanup()
    update({
      status: 'anonymous',
      user: null,
      twofaEnabled: false,
      expiresAt: null,
      submitting: false,
      lastErrorCode: null,
    })
  }

  const storeCsrf = (token: unknown): string => {
    csrf = typeof token === 'string' && token.length > 0 && token.length <= 4096 ? token : ''
    return csrf
  }

  /**
   * Fetch (or reuse) a token. Concurrent callers share one request; the result
   * is only stored when this is still the newest request in the current
   * generation, so an older fetch cannot overwrite a rotation performed by a
   * newer login/logout.
   */
  const fetchCsrf = (): Promise<string> => {
    if (disposed) return Promise.reject(new BffRequestError(0, 'aborted', '请求已取消'))
    if (inFlightCsrf) return inFlightCsrf
    const epoch = generation
    const seq = ++csrfRequestSeq
    const run = (async () => {
      const data = await bffRequest(BFF_AUTH_PATHS.csrf, { method: 'GET', fetchImpl: deps.fetchImpl, timeoutMs: deps.timeoutMs })
      const token = readCsrfToken(data)
      if (!token) throw new BffRequestError(200, 'invalid_response', '服务响应异常')
      if (!disposed && epoch === generation && seq === csrfRequestSeq) csrf = token
      return token
    })()
    const tracked = run.finally(() => {
      if (inFlightCsrf === tracked) inFlightCsrf = undefined
    })
    inFlightCsrf = tracked
    return tracked
  }

  const ensureCsrf = (): Promise<string> => csrf.length > 0 ? Promise.resolve(csrf) : fetchCsrf()

  const performMutation = async <T>(options: BffMutationFacadeOptions<T>): Promise<T> => {
    const token = await ensureCsrf()
    const isRejected = options.isCsrfRejection ?? isCsrfRejection
    try {
      return await options.send(token)
    }
    catch (error) {
      if (!isRejected(error)) throw error
      const refreshed = await fetchCsrf()
      return options.send(refreshed)
    }
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },

    refresh() {
      if (disposed) return Promise.resolve(snapshot)
      if (inFlightRefresh) return inFlightRefresh
      const epoch = generation
      const run = (async () => {
        try {
          const data = await bffRequest(BFF_AUTH_PATHS.session, {
            method: 'GET',
            fetchImpl: deps.fetchImpl,
            timeoutMs: deps.timeoutMs,
          })
          // A logout, a newer login or disposal happened while this was in
          // flight: never re-adopt the older identity.
          if (!isCurrent(epoch)) return snapshot
          const payload = readSessionPayload(data)
          if (!payload) {
            update({ status: 'unavailable', lastErrorCode: 'invalid_response' })
            return snapshot
          }
          if (!payload.authenticated) {
            if (snapshot.user) {
              clearPrivateState()
              return snapshot
            }
            update({ status: 'anonymous', user: null, twofaEnabled: false, expiresAt: null, lastErrorCode: null })
            return snapshot
          }
          adoptIdentity(payload)
          return snapshot
        }
        catch (error) {
          if (!isCurrent(epoch)) return snapshot
          if (isBffRequestError(error) && error.status === 401) {
            clearPrivateState()
            return snapshot
          }
          if (isBffRequestError(error) && error.status === 403) {
            // Current permission denial is not session expiry: never clear.
            update({
              status: snapshot.user ? 'authenticated' : 'unavailable',
              lastErrorCode: error.code,
            })
            return snapshot
          }
          update({
            status: 'unavailable',
            lastErrorCode: isBffRequestError(error) ? error.code : 'network_error',
          })
          return snapshot
        }
      })()
      const tracked = run.finally(() => {
        if (inFlightRefresh === tracked) inFlightRefresh = undefined
      })
      inFlightRefresh = tracked
      return tracked
    },

    async login(input) {
      if (disposed) return snapshot
      if (snapshot.submitting) return snapshot
      const epoch = generation
      update({ submitting: true, lastErrorCode: null })
      try {
        await ensureCsrf()
        if (!isCurrent(epoch)) return snapshot
        const { data, csrfToken } = await bffMutation(BFF_AUTH_PATHS.login, {
          body: input,
          fetchImpl: deps.fetchImpl,
          timeoutMs: deps.timeoutMs,
          csrfToken: () => csrf,
          refreshCsrf: fetchCsrf,
        })
        // A concurrent logout/login changed the generation: the response is
        // stale and must not adopt a user or a token.
        if (!isCurrent(epoch)) return snapshot
        const user = typeof data === 'object' && data !== null ? (data as Record<string, unknown>).user : undefined
        const parsed = safeUserSchema.safeParse(user)
        if (!parsed.success) {
          update({ status: 'anonymous', user: null, lastErrorCode: 'invalid_response' })
          throw new BffRequestError(200, 'invalid_response', '服务响应异常')
        }
        const payload = data as Record<string, unknown>
        storeCsrf(csrfToken)
        // A login response carries a rotated CSRF token; keep it if present.
        if (typeof payload.csrfToken === 'string') storeCsrf(payload.csrfToken)
        adoptIdentity({
          authenticated: true,
          user: parsed.data,
          twofaEnabled: false,
          expiresAt: typeof payload.expiresAt === 'number' && Number.isFinite(payload.expiresAt) ? payload.expiresAt : null,
        })
        return snapshot
      }
      catch (error) {
        if (isCurrent(epoch)) {
          update({
            status: snapshot.user ? 'authenticated' : 'anonymous',
            lastErrorCode: isBffRequestError(error) ? error.code : 'network_error',
          })
        }
        throw error
      }
      finally {
        if (isCurrent(epoch)) update({ submitting: false })
      }
    },

    async logout() {
      if (disposed) return
      const epoch = generation
      try {
        await ensureCsrf()
        if (!isCurrent(epoch)) return
        await bffMutation(BFF_AUTH_PATHS.logout, {
          body: {},
          fetchImpl: deps.fetchImpl,
          timeoutMs: deps.timeoutMs,
          csrfToken: () => csrf,
          refreshCsrf: fetchCsrf,
        })
      }
      catch (error) {
        if (isCurrent(epoch) && isBffRequestError(error) && error.status === 401) {
          // The server already considers the session gone.
          clearPrivateState()
          return
        }
        // Network/5xx: the HttpOnly cookie and server record may still exist,
        // so keep the authenticated state and let the caller surface a retry.
        if (isCurrent(epoch)) {
          update({ lastErrorCode: isBffRequestError(error) ? error.code : 'network_error' })
        }
        throw error
      }
      // A newer login superseded this logout; keep the newer session.
      if (!isCurrent(epoch)) return
      clearPrivateState()
    },

    ensureCsrf,
    async mutate(path, body) {
      const epoch = generation
      await ensureCsrf()
      const { data, csrfToken } = await bffMutation(path, {
        body,
        fetchImpl: deps.fetchImpl,
        timeoutMs: deps.timeoutMs,
        csrfToken: () => csrf,
        refreshCsrf: fetchCsrf,
      })
      // Do not let an older mutation's rotated token overwrite a newer one.
      if (isCurrent(epoch)) storeCsrf(csrfToken)
      return data
    },
    csrf: {
      token: () => csrf,
      ensure: ensureCsrf,
      invalidate: () => {
        csrf = ''
        return fetchCsrf()
      },
    },
    performMutation,
    csrfToken: () => csrf,
    clearPrivateState,
    dispose() {
      disposed = true
      generation += 1
      listeners.clear()
      inFlightRefresh = undefined
      inFlightCsrf = undefined
    },
  }
}
