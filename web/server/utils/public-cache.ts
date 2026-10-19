/**
 * Bounded stale-while-revalidate cache for *projected public data* only.
 *
 * The public HTML is rendered fresh for every request (see
 * `docs/revamp/CACHE.md`), so this cache never stores rendered HTML, CSP
 * nonces or browser-specific state. Callers pass an already validated query
 * and a loader that reads the frozen v1 API; the cache stores only the
 * loader's resolved, projected DTO.
 *
 * Design constraints:
 * - keys are canonical and caller-built from parsed values, and include the
 *   upstream origin plus the per-kind generation;
 * - the key count, per-entry serialized size and total retained size are
 *   explicitly bounded (least-recently-used eviction);
 * - concurrent fills for one key are deduplicated;
 * - errors are never cached, and a background refresh failure is swallowed
 *   while a still-acceptable stale value remains;
 * - a generation bump makes any older in-flight fill unable to repopulate the
 *   cache after a mutation.
 */

import { createError } from 'h3'

export const PUBLIC_DATA_KINDS = [
  'config',
  'activities',
  'events',
  'members',
  'history',
  'logs',
] as const

export type PublicDataKind = (typeof PUBLIC_DATA_KINDS)[number]

/** Own-key guard; `kind in object` would also accept inherited names. */
const PUBLIC_DATA_KIND_SET: ReadonlySet<string> = new Set<string>(PUBLIC_DATA_KINDS)

export interface PublicDataPolicy {
  /** Time during which a stored value is returned without contacting upstream. */
  freshMs: number
  /**
   * Additional time after `freshMs` during which a stale value may still be
   * served while a background refresh runs. Once this window is exceeded the
   * entry is discarded and the caller waits for a fresh read.
   */
  maxStaleMs: number
}

/**
 * TTLs follow the assigned design: config/events 60 s, activities 120 s,
 * members/history 300 s, logs 30 s. Max-stale windows are deliberately finite
 * (never "forever") and stay small enough that a deleted row cannot be served
 * indefinitely if no explicit invalidation arrives.
 */
export const PUBLIC_DATA_POLICY: Readonly<Record<PublicDataKind, PublicDataPolicy>> = Object.freeze({
  config: Object.freeze({ freshMs: 60_000, maxStaleMs: 300_000 }),
  activities: Object.freeze({ freshMs: 120_000, maxStaleMs: 600_000 }),
  events: Object.freeze({ freshMs: 60_000, maxStaleMs: 300_000 }),
  members: Object.freeze({ freshMs: 300_000, maxStaleMs: 1_800_000 }),
  history: Object.freeze({ freshMs: 300_000, maxStaleMs: 1_800_000 }),
  logs: Object.freeze({ freshMs: 30_000, maxStaleMs: 120_000 }),
})

export interface PublicCacheLimits {
  /** Retained entry ceiling (least-recently-used eviction above it). */
  maxKeys: number
  /** Concurrent fill ceiling; further fills are refused with a public 503. */
  maxInflight: number
  /** Serialized bytes per retained entry. */
  maxEntryBytes: number
  /** Serialized bytes across all retained entries. */
  maxTotalBytes: number
}

/**
 * Hard, non-negotiable ceilings. Constructor options may only lower them, so a
 * misconfigured caller cannot create an unbounded cache. Values above a
 * retention bound are still served to the caller but never retained.
 */
export const PUBLIC_CACHE_HARD_LIMITS: Readonly<PublicCacheLimits> = Object.freeze({
  maxKeys: 500,
  maxInflight: 64,
  maxEntryBytes: 2 * 1024 * 1024,
  maxTotalBytes: 8 * 1024 * 1024,
})

/** Defaults equal the hard ceilings. */
export const PUBLIC_CACHE_LIMITS: Readonly<PublicCacheLimits> = PUBLIC_CACHE_HARD_LIMITS

export interface PublicDataCacheOptions {
  /** Injectable clock for deterministic tests; defaults to `Date.now`. */
  now?: () => number
  /** Optional lower ceilings; any value above the hard limit is clamped down. */
  maxKeys?: number
  maxInflight?: number
  maxEntryBytes?: number
  maxTotalBytes?: number
}

export interface PublicCacheRead<T> {
  kind: PublicDataKind
  /** Administrator-configured upstream origin; keeps different backends apart. */
  origin: string
  /**
   * Fully validated, canonically ordered parameters. `undefined` is not
   * accepted: callers must normalize an absent filter to `null` so omitted and
   * explicitly empty values cannot collide. No cookie, authorization, IP or
   * request-derived value may ever appear here.
   */
  parameters: readonly (string | number | null)[]
  /** Pure public read. Its result must already be projected/redacted. */
  load: () => Promise<T>
}

interface CacheEntry<T = unknown> {
  kind: PublicDataKind
  value: T
  storedAt: number
  bytes: number
}

const textEncoder = new TextEncoder()

const boundedInteger = (
  value: number | undefined,
  fallback: number,
  maximum: number,
): number => (typeof value === 'number' && Number.isSafeInteger(value) && value > 0
  ? Math.min(value, maximum)
  : fallback)

/**
 * Admission failure used when every concurrent-fill slot is busy. It is an
 * explicit, public-safe 503; the cache never turns back-pressure into an empty
 * successful payload. There is no wait queue: a refused caller retries later.
 */
const cacheBusy = () => createError({
  statusCode: 503,
  statusMessage: 'Public data busy',
  message: '公开数据请求过多，请稍后重试。',
})

const canonicalOrigin = (origin: string): string => {
  try {
    return new URL(origin).origin
  }
  catch {
    // The loader will reject an invalid origin; keeping the raw value only
    // isolates cache keys, it never becomes part of an upstream request.
    return origin
  }
}

const isNotFoundError = (error: unknown): boolean =>
  typeof error === 'object' && error !== null
  && (error as { statusCode?: unknown }).statusCode === 404

const serializedBytes = (value: unknown): number | null => {
  let serialized: string | undefined
  try {
    serialized = JSON.stringify(value)
  }
  catch {
    return null
  }
  if (typeof serialized !== 'string') return null
  return textEncoder.encode(serialized).byteLength
}

export class PublicDataCache {
  private readonly entries = new Map<string, CacheEntry>()
  private readonly inflight = new Map<string, Promise<unknown>>()
  private readonly generations = new Map<PublicDataKind, number>()
  private readonly now: () => number
  private readonly maxKeys: number
  private readonly maxInflight: number
  private readonly maxEntryBytes: number
  private readonly maxTotalBytes: number
  private retained = 0

  constructor(options: PublicDataCacheOptions = {}) {
    this.now = options.now ?? Date.now
    this.maxKeys = boundedInteger(options.maxKeys, PUBLIC_CACHE_HARD_LIMITS.maxKeys, PUBLIC_CACHE_HARD_LIMITS.maxKeys)
    this.maxInflight = boundedInteger(options.maxInflight, PUBLIC_CACHE_HARD_LIMITS.maxInflight, PUBLIC_CACHE_HARD_LIMITS.maxInflight)
    this.maxEntryBytes = boundedInteger(options.maxEntryBytes, PUBLIC_CACHE_HARD_LIMITS.maxEntryBytes, PUBLIC_CACHE_HARD_LIMITS.maxEntryBytes)
    this.maxTotalBytes = boundedInteger(options.maxTotalBytes, PUBLIC_CACHE_HARD_LIMITS.maxTotalBytes, PUBLIC_CACHE_HARD_LIMITS.maxTotalBytes)
  }

  /** Effective (clamped) ceilings, for documentation, probes and tests. */
  get limits(): Readonly<PublicCacheLimits> {
    return Object.freeze({
      maxKeys: this.maxKeys,
      maxInflight: this.maxInflight,
      maxEntryBytes: this.maxEntryBytes,
      maxTotalBytes: this.maxTotalBytes,
    })
  }

  /** Number of retained entries (observability and bounds tests). */
  get size(): number {
    return this.entries.size
  }

  /** Total serialized bytes currently retained (observability and bounds tests). */
  get retainedBytes(): number {
    return this.retained
  }

  /** Number of concurrent fills currently admitted (observability and bounds tests). */
  get inflightCount(): number {
    return this.inflight.size
  }

  /** Current invalidation generation for one public-data kind. */
  generation(kind: PublicDataKind): number {
    return this.generations.get(kind) ?? 0
  }

  /**
   * Read through the cache. A fresh value is returned immediately. A stale
   * value within its max-stale window is returned immediately while one
   * background refresh runs. Otherwise the caller waits for the loader.
   *
   * Loader rejections are propagated and never stored. A 404 observed by a
   * background refresh drops the retained value so a deleted entity stops
   * being served after at most one stale response.
   */
  read<T>(request: PublicCacheRead<T>): Promise<T> {
    if (!PUBLIC_DATA_KIND_SET.has(request.kind)) {
      return Promise.reject(new TypeError(`Unknown public data kind: ${String(request.kind)}`))
    }
    const policy = PUBLIC_DATA_POLICY[request.kind]
    const generation = this.generation(request.kind)
    const key = this.keyFor(request, generation)
    const entry = this.entries.get(key)

    if (entry !== undefined) {
      const age = Math.max(0, this.now() - entry.storedAt)
      if (age <= policy.freshMs) {
        this.touch(key, entry)
        return Promise.resolve(entry.value as T)
      }
      if (age <= policy.freshMs + policy.maxStaleMs) {
        this.touch(key, entry)
        this.refresh(key, request, generation)
        return Promise.resolve(entry.value as T)
      }
      // Retaining a value beyond its max-stale window would be unbounded
      // staleness; discard it and fall through to a waiting fill.
      this.remove(key)
    }

    return this.fill(key, request, generation)
  }

  /**
   * Internal typed invalidation contract for successful BFF admin mutations.
   * A generation bump isolates the current key space and prevents any older
   * in-flight fill from storing into the new generation.
   *
   * There is deliberately no anonymous HTTP route for this function.
   */
  invalidate(kinds: readonly PublicDataKind[]): void {
    for (const kind of new Set(kinds)) {
      if (!PUBLIC_DATA_KIND_SET.has(kind)) {
        throw new TypeError(`Unknown public data kind: ${String(kind)}`)
      }
      this.generations.set(kind, this.generation(kind) + 1)
      for (const [key, entry] of [...this.entries]) {
        if (entry.kind === kind) this.remove(key)
      }
    }
  }

  /**
   * Wait for every fill that had started when this method was called. This is
   * used by deterministic tests and operational probes; it is not a cache
   * validity guarantee for future requests.
   */
  async settled(): Promise<void> {
    await Promise.allSettled([...this.inflight.values()])
  }

  private keyFor<T>(request: PublicCacheRead<T>, generation: number): string {
    // A JSON array is unambiguous: parameter strings cannot inject separators.
    return JSON.stringify([
      request.kind,
      generation,
      canonicalOrigin(request.origin),
      request.parameters,
    ])
  }

  private fill<T>(key: string, request: PublicCacheRead<T>, generation: number): Promise<T> {
    // Deduplicate an already-admitted key before any capacity check, so a
    // caller never has to wait for admission twice for the same fill.
    const pending = this.inflight.get(key)
    if (pending !== undefined) return pending as Promise<T>
    if (this.inflight.size >= this.maxInflight) return Promise.reject(cacheBusy())

    const promise = this.loadAndStore(key, request, generation)
    this.inflight.set(key, promise)
    const settle = () => {
      if (this.inflight.get(key) === promise) this.inflight.delete(key)
    }
    // A rejected promise is returned to the caller; this second handler only
    // clears the in-flight marker and deliberately observes the rejection.
    void promise.then(settle, settle)
    return promise
  }

  private async loadAndStore<T>(
    key: string,
    request: PublicCacheRead<T>,
    generation: number,
  ): Promise<T> {
    const value = await request.load()
    this.store(key, request.kind, generation, value)
    return value
  }

  private refresh<T>(key: string, request: PublicCacheRead<T>, generation: number): void {
    if (this.inflight.has(key)) return
    // At capacity the readable stale DTO is still returned and the refresh is
    // simply skipped; back-pressure must not turn a successful stale read into
    // a failure.
    if (this.inflight.size >= this.maxInflight) return
    const promise = this.fill(key, request, generation)
    void promise.catch((error: unknown) => {
      // A deleted or non-public entity must not keep its stale copy. Other
      // refresh failures leave the still-bounded stale value in place.
      if (isNotFoundError(error)) this.remove(key)
    })
  }

  private store<T>(key: string, kind: PublicDataKind, generation: number, value: T): void {
    // An old in-flight fill that resolves after invalidation must not
    // resurrect data into the current generation.
    if (this.generation(kind) !== generation) return

    const bytes = serializedBytes(value)
    if (bytes === null || bytes > this.maxEntryBytes || bytes > this.maxTotalBytes) return

    const previous = this.entries.get(key)
    if (previous !== undefined) this.remove(key)
    this.entries.set(key, { kind, value, storedAt: this.now(), bytes })
    this.retained += bytes
    this.evict()
  }

  private touch(key: string, entry: CacheEntry): void {
    this.entries.delete(key)
    this.entries.set(key, entry)
  }

  private remove(key: string): void {
    const entry = this.entries.get(key)
    if (entry === undefined) return
    this.entries.delete(key)
    this.retained -= entry.bytes
    if (this.retained < 0) this.retained = 0
  }

  private evict(): void {
    while (this.entries.size > this.maxKeys || this.retained > this.maxTotalBytes) {
      const oldest = this.entries.keys().next()
      if (oldest.done) return
      this.remove(oldest.value)
    }
  }
}

export const createPublicDataCache = (options: PublicDataCacheOptions = {}): PublicDataCache =>
  new PublicDataCache(options)
