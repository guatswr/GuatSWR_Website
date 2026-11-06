/**
 * Bounded server-side cache for rendered Markdown AST trees with single-flight
 * deduplication.
 *
 * Markdown parsing (MDC), formula compilation (KaTeX), syntax highlighting (Shiki)
 * and AST sanitization are CPU-intensive operations. This module caches safe
 * rendered AST results keyed strictly by content digest (SHA-256) and render/sanitizer
 * versions, completely isolated from user identity, authorization, or visibility.
 *
 * Adheres to rule C7:
 * - Upper bound: 128 entries, 8 MiB total, 512 KiB per entry, 5 minutes TTL.
 * - Oversized entries (> 512 KiB) are rendered on-demand for callers but never retained.
 * - Single-flight coalescing: concurrent requests for identical content share a single
 *   render execution, and failures are cleaned up immediately.
 * - Response isolation: returned AST trees are deeply cloned/immutable so a caller
 *   cannot mutate and poison shared cached trees.
 * - Errors are never cached.
 */
import { createHash } from 'node:crypto'
import type { SafeMarkdownResult } from '#shared/markdown'
import { renderSafeMarkdown } from './markdown'

export const DEFAULT_MARKDOWN_RENDER_VERSION = '2026-11-safe-mdc-katex-shiki-v1'

export interface MarkdownCacheLimits {
  readonly maxKeys: number
  readonly maxInflight: number
  readonly maxEntryBytes: number
  readonly maxTotalBytes: number
  readonly ttlMs: number
}

export const MARKDOWN_CACHE_LIMITS: Readonly<MarkdownCacheLimits> = Object.freeze({
  maxKeys: 128,
  maxInflight: 64,
  maxEntryBytes: 512 * 1024, // 512 KiB
  maxTotalBytes: 8 * 1024 * 1024, // 8 MiB
  ttlMs: 5 * 60 * 1000, // 5 minutes (300,000 ms)
})

export interface MarkdownRenderCacheOptions {
  /** Injectable clock for deterministic tests; defaults to `Date.now`. */
  now?: () => number
  /** Maximum number of retained AST entries (LRU evicted). */
  maxKeys?: number
  /** Maximum concurrent in-flight renders. */
  maxInflight?: number
  /** Maximum serialized byte size for a single retained entry. */
  maxEntryBytes?: number
  /** Maximum serialized byte size across all retained entries. */
  maxTotalBytes?: number
  /** TTL in milliseconds. */
  ttlMs?: number
  /** Render & sanitizer version tag. Changes to rules invalidate past entries. */
  renderVersion?: string
  /** Custom renderer function; defaults to `renderSafeMarkdown`. */
  renderer?: (source: string) => Promise<SafeMarkdownResult>
}

interface CacheEntry {
  readonly result: SafeMarkdownResult
  storedAt: number
  readonly byteLength: number
}

export const computeMarkdownDigest = (content: string): string => {
  return createHash('sha256').update(content, 'utf8').digest('hex')
}

export class MarkdownRenderCache {
  private readonly now: () => number
  private readonly maxKeys: number
  private readonly maxInflight: number
  private readonly maxEntryBytes: number
  private readonly maxTotalBytes: number
  private readonly ttlMs: number
  private readonly renderVersion: string
  private readonly renderer: (source: string) => Promise<SafeMarkdownResult>

  private readonly entries = new Map<string, CacheEntry>()
  private readonly inflight = new Map<string, Promise<SafeMarkdownResult>>()
  private retained = 0

  constructor(options: MarkdownRenderCacheOptions = {}) {
    this.now = options.now ?? Date.now
    this.maxKeys = options.maxKeys ?? MARKDOWN_CACHE_LIMITS.maxKeys
    this.maxInflight = options.maxInflight ?? MARKDOWN_CACHE_LIMITS.maxInflight
    this.maxEntryBytes = options.maxEntryBytes ?? MARKDOWN_CACHE_LIMITS.maxEntryBytes
    this.maxTotalBytes = options.maxTotalBytes ?? MARKDOWN_CACHE_LIMITS.maxTotalBytes
    this.ttlMs = options.ttlMs ?? MARKDOWN_CACHE_LIMITS.ttlMs
    this.renderVersion = options.renderVersion ?? DEFAULT_MARKDOWN_RENDER_VERSION
    this.renderer = options.renderer ?? renderSafeMarkdown
  }

  get size(): number {
    return this.entries.size
  }

  get retainedBytes(): number {
    return this.retained
  }

  get inflightCount(): number {
    return this.inflight.size
  }

  get limits(): Readonly<MarkdownCacheLimits> {
    return Object.freeze({
      maxKeys: this.maxKeys,
      maxInflight: this.maxInflight,
      maxEntryBytes: this.maxEntryBytes,
      maxTotalBytes: this.maxTotalBytes,
      ttlMs: this.ttlMs,
    })
  }

  /**
   * Render Markdown text with caching and single-flight coalescing.
   * Always returns an isolated, deeply-cloned result so callers cannot mutate
   * shared cache memory.
   */
  async render(markdown: string): Promise<SafeMarkdownResult> {
    const source = typeof markdown === 'string' ? markdown : ''
    if (!source.trim()) {
      return { nodes: [], headings: [], complete: true }
    }

    const digest = computeMarkdownDigest(source)
    const key = `${this.renderVersion}:${digest}`

    // 1. Check existing cached entry
    const entry = this.entries.get(key)
    if (entry !== undefined) {
      const age = Math.max(0, this.now() - entry.storedAt)
      if (age <= this.ttlMs) {
        this.touch(key, entry)
        return structuredClone(entry.result)
      }
      this.remove(key)
    }

    // 2. Single-flight coalescing for concurrent renders of identical key
    const pending = this.inflight.get(key)
    if (pending !== undefined) {
      const coalesced = await pending
      return structuredClone(coalesced)
    }

    if (this.inflight.size >= this.maxInflight) {
      // Graceful degradation: render directly without caching to avoid 503 on public pages
      return structuredClone(await this.renderer(source))
    }

    // 3. Initiate single-flight render
    const renderPromise = (async () => {
      const result = await this.renderer(source)
      this.maybeStore(key, result)
      return result
    })()

    this.inflight.set(key, renderPromise)
    const cleanup = () => {
      if (this.inflight.get(key) === renderPromise) {
        this.inflight.delete(key)
      }
    }
    void renderPromise.then(cleanup, cleanup)

    const result = await renderPromise
    return structuredClone(result)
  }

  clear(): void {
    this.entries.clear()
    this.inflight.clear()
    this.retained = 0
  }

  remove(key: string): void {
    const entry = this.entries.get(key)
    if (!entry) return
    this.entries.delete(key)
    this.retained -= entry.byteLength
  }

  private touch(key: string, entry: CacheEntry): void {
    this.entries.delete(key)
    this.entries.set(key, entry)
  }

  private maybeStore(key: string, result: SafeMarkdownResult): void {
    let byteLength: number
    try {
      const serialized = JSON.stringify(result)
      byteLength = Buffer.byteLength(serialized, 'utf8')
    }
    catch {
      // If serialization fails, do not cache
      return
    }

    if (byteLength > this.maxEntryBytes) {
      // Oversized entry: allowed for caller, never retained in cache
      return
    }

    const existing = this.entries.get(key)
    if (existing !== undefined) {
      this.retained -= existing.byteLength
      this.entries.delete(key)
    }

    // Evict oldest entries until within key and memory bounds
    while (
      this.entries.size >= this.maxKeys ||
      this.retained + byteLength > this.maxTotalBytes
    ) {
      const oldestKey = this.entries.keys().next().value
      if (!oldestKey) break
      this.remove(oldestKey)
    }

    this.entries.set(key, {
      result,
      storedAt: this.now(),
      byteLength,
    })
    this.retained += byteLength
  }
}

export const createMarkdownRenderCache = (
  options?: MarkdownRenderCacheOptions,
): MarkdownRenderCache => new MarkdownRenderCache(options)

/** Process-wide singleton cache for server-rendered Markdown content. */
export const markdownRenderCache = createMarkdownRenderCache()

/**
 * Render Markdown using the process-wide cache with single-flight protection.
 */
export const renderCachedMarkdown = (
  markdown: string,
  cache: MarkdownRenderCache = markdownRenderCache,
): Promise<SafeMarkdownResult> => cache.render(markdown)
