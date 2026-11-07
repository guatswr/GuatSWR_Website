import type { Row, DatabaseStore } from '../database/contracts.js'
import type { Actor } from '../modules/actor.js'
import { AppError } from '../errors.js'
import { authorizeSecurityActor, requireSecuritySchema } from './authorize.js'
import { enqueueSecurityAudit } from './audit-outbox.js'

export function banExpiration(raw: unknown, now = Date.now()) {
  const minutes = Number(raw || 0), expires = minutes > 0 ? now + minutes * 60000 : null
  if (!Number.isFinite(minutes) || (expires !== null && (!Number.isFinite(expires) || expires > 8640000000000000))) throw new AppError('封禁时长无效', 'BAN_EXPIRY', 400)
  return expires
}

export interface BanCacheEntry {
  blocked: boolean
  reason: string
  expiresAt: number | null
  cachedAt: number
  ttl: number
}

const DEFAULT_BAN_CACHE_MAX_ENTRIES = 2048
const DEFAULT_BAN_CACHE_TTL_MS = 5000 // 5 seconds bounded TTL

export class BoundedBanCache {
  private readonly map = new Map<string, BanCacheEntry>()
  constructor(
    readonly maxEntries = DEFAULT_BAN_CACHE_MAX_ENTRIES,
    readonly defaultTtlMs = DEFAULT_BAN_CACHE_TTL_MS
  ) {}

  get(ip: string, now = Date.now()): BanCacheEntry | undefined {
    const entry = this.map.get(ip)
    if (!entry) return undefined
    // Check expiration: either TTL expired or ban expiresAt reached
    if (now - entry.cachedAt >= entry.ttl || (entry.expiresAt !== null && now >= entry.expiresAt)) {
      this.map.delete(ip)
      return undefined
    }
    // Refresh LRU position on access
    this.map.delete(ip)
    this.map.set(ip, entry)
    return entry
  }

  set(ip: string, entry: Omit<BanCacheEntry, 'cachedAt'>, now = Date.now()): void {
    if (this.map.has(ip)) {
      this.map.delete(ip)
    } else if (this.map.size >= this.maxEntries) {
      // Evict oldest (Map keys iterate in insertion order)
      const oldestKey = this.map.keys().next().value
      if (oldestKey !== undefined) this.map.delete(oldestKey)
    }
    this.map.set(ip, { ...entry, cachedAt: now })
  }

  delete(ip: string): void {
    this.map.delete(ip)
  }

  clear(): void {
    this.map.clear()
  }

  cleanupExpired(now = Date.now()): void {
    for (const [key, entry] of this.map.entries()) {
      if (now - entry.cachedAt >= entry.ttl || (entry.expiresAt !== null && now >= entry.expiresAt)) {
        this.map.delete(key)
      }
    }
  }

  get size(): number {
    return this.map.size
  }
}

export function createBanService(options: {
  store: DatabaseStore
  ready: boolean
  committed(): void
  report(error: unknown): void
  cacheTtlMs?: number | undefined
  maxCacheEntries?: number | undefined
}) {
  const committed = () => { try { options.committed() } catch (error) { options.report(error) } }
  const cache = new BoundedBanCache(options.maxCacheEntries ?? DEFAULT_BAN_CACHE_MAX_ENTRIES, options.cacheTtlMs ?? DEFAULT_BAN_CACHE_TTL_MS)
  let cacheGeneration = 0

  const cleanup = async (now = Date.now()) => {
    cacheGeneration++
    cache.clear()
    return options.store.run("DELETE FROM banned_ips WHERE expires_at IS NOT NULL AND expires_at<=$1", [now])
  }

  return {
    cache,
    cleanup,
    list: async (now = Date.now()) => {
      cache.cleanupExpired(now)
      await options.store.run("DELETE FROM banned_ips WHERE expires_at IS NOT NULL AND expires_at<=$1", [now]).catch(options.report)
      return options.store.all('SELECT * FROM banned_ips ORDER BY created_at DESC NULLS LAST')
    },
    blocked: async (ip: string, now = Date.now()) => {
      const cached = cache.get(ip, now)
      if (cached !== undefined) {
        return cached.blocked ? { reason: cached.reason } : undefined
      }
      const generation = cacheGeneration

      // Preserve fail-open lookup policy; failures are reported and NOT cached
      let row: (Row & { ip: string; reason: string | null; expires_at: number | null }) | undefined
      try {
        row = await options.store.get<Row & { ip: string; reason: string | null; expires_at: number | null }>(
          "SELECT ip,reason,expires_at FROM banned_ips WHERE ip=$1",
          [ip]
        )
      } catch (error) {
        options.report(error)
        return undefined
      }

      if (!row) {
        if (generation === cacheGeneration) cache.set(ip, {
          blocked: false,
          reason: '',
          expiresAt: null,
          ttl: cache.defaultTtlMs
        }, now)
        return undefined
      }

      const expiresAt = row.expires_at !== null && row.expires_at !== undefined ? Number(row.expires_at) : null
      if (expiresAt !== null && expiresAt <= now) {
        await options.store.run("DELETE FROM banned_ips WHERE ip=$1 AND expires_at IS NOT NULL AND expires_at<=$2", [ip, now]).catch(options.report)
        cache.delete(ip)
        return undefined
      }

      // Bounded ban TTL: cache lifespan cannot exceed remaining ban duration
      const effectiveTtl = expiresAt !== null ? Math.max(1, Math.min(cache.defaultTtlMs, expiresAt - now)) : cache.defaultTtlMs
      const reason = row.reason || ''
      if (generation === cacheGeneration) cache.set(ip, {
        blocked: true,
        reason,
        expiresAt,
        ttl: effectiveTtl
      }, now)

      return { reason }
    },
    ban: async (ip: string, reason = '', operator = 'ATRI', expires: number | null = null, actor?: Actor) => {
      if (expires !== null && (!Number.isFinite(expires) || Math.abs(expires) > 8640000000000000)) throw new AppError('Invalid ban expiry', 'BAN_EXPIRY', 400)
      requireSecuritySchema(options.ready)
      const until = expires ? ` until ${new Date(expires).toISOString()}` : ''
      await options.store.transaction(async tx => {
        const principal = actor ? await authorizeSecurityActor(tx, actor, true) : undefined
        const username = principal ? String(principal.username || 'System') : operator
        await tx.run("INSERT INTO banned_ips(ip,reason,created_at,expires_at,created_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT(ip) DO UPDATE SET reason=excluded.reason,created_at=excluded.created_at,expires_at=excluded.expires_at,created_by=excluded.created_by", [ip, reason, Date.now(), expires, username])
        await enqueueSecurityAudit(tx, username, 'BAN_IP', `封禁IP ${ip}${reason ? ` (${reason})` : ''}${until}`)
      })
      cacheGeneration++
      cache.delete(ip)
      committed()
    },
    unban: async (ip: string, operator = 'ATRI', actor?: Actor) => {
      requireSecuritySchema(options.ready)
      await options.store.transaction(async tx => {
        const principal = actor ? await authorizeSecurityActor(tx, actor, true) : undefined
        await tx.run("DELETE FROM banned_ips WHERE ip=$1", [ip])
        await enqueueSecurityAudit(tx, principal ? String(principal.username || 'System') : operator, 'UNBAN_IP', `解封IP ${ip}`)
      })
      cacheGeneration++
      cache.delete(ip)
      committed()
    }
  }
}
export type BanService = ReturnType<typeof createBanService>
