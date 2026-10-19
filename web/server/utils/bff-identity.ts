import { BlockList, isIP } from 'node:net'
import { BffConfigError, ClientIpError } from './bff-errors'

export type IpFamily = 4 | 6

export interface ParsedIp {
  family: IpFamily
  address: string
}

export interface TrustedProxyMatcher {
  isTrusted: (ip: ParsedIp) => boolean
}

export interface ClientIpInput {
  remoteAddress?: unknown
  forwardedFor?: string | string[]
}

export interface ClientIpResolution {
  ip: ParsedIp
  source: 'socket' | 'x-forwarded-for'
  hops: number
}

export const MAX_FORWARDED_CHARS = 2048
export const MAX_FORWARDED_HOPS = 20

const IPV4_MAPPED_PATTERN = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/

function mappedIpv4ToDotted(match: RegExpMatchArray): string {
  const high = Number.parseInt(match[1] as string, 16)
  const low = Number.parseInt(match[2] as string, 16)
  return `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`
}

/**
 * Validate and canonicalize a single address. IPv4-mapped IPv6 addresses are
 * normalized to IPv4 so the same client cannot appear as two identities, and
 * zone ids or ports are rejected instead of being forwarded upstream.
 */
export function parseIp(value: unknown): ParsedIp | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (trimmed.length === 0 || trimmed.length > 64) return null
  if (trimmed.includes('%') || trimmed.includes('/') || trimmed.includes(',')) return null
  const family = isIP(trimmed)
  if (family === 4) return { family: 4, address: trimmed }
  if (family !== 6) return null
  try {
    const hostname = new URL(`http://[${trimmed}]/`).hostname
    const canonical = hostname.startsWith('[') && hostname.endsWith(']')
      ? hostname.slice(1, -1)
      : hostname
    const mapped = canonical.match(IPV4_MAPPED_PATTERN)
    if (mapped) return { family: 4, address: mappedIpv4ToDotted(mapped) }
    return { family: 6, address: canonical }
  }
  catch {
    return null
  }
}

export function isLoopbackIp(ip: ParsedIp): boolean {
  if (ip.family === 4) return ip.address.startsWith('127.')
  return ip.address === '::1'
}

function parseCidrEntry(entry: string): { family: IpFamily, address: string, prefix: number } {
  const trimmed = entry.trim()
  if (trimmed.length === 0) throw new BffConfigError('trusted proxy CIDR entries must not be empty')
  const slash = trimmed.indexOf('/')
  const addressPart = slash === -1 ? trimmed : trimmed.slice(0, slash)
  const prefixPart = slash === -1 ? undefined : trimmed.slice(slash + 1)
  const ip = parseIp(addressPart)
  if (!ip) throw new BffConfigError('trusted proxy entry is not a valid address')
  const maxPrefix = ip.family === 4 ? 32 : 128
  if (prefixPart === undefined) return { family: ip.family, address: ip.address, prefix: maxPrefix }
  if (!/^\d{1,3}$/.test(prefixPart)) throw new BffConfigError('trusted proxy prefix is invalid')
  const prefix = Number.parseInt(prefixPart, 10)
  if (prefix < 0 || prefix > maxPrefix) throw new BffConfigError('trusted proxy prefix is out of range')
  return { family: ip.family, address: ip.address, prefix }
}

/**
 * Build an explicit trust matcher. An empty list trusts no proxy at all, which
 * is the default: forwarding headers are then ignored completely.
 */
export function createTrustedProxyMatcher(cidrs: readonly string[]): TrustedProxyMatcher {
  const list = new BlockList()
  for (const entry of cidrs) {
    const { family, address, prefix } = parseCidrEntry(entry)
    list.addSubnet(address, prefix, family === 4 ? 'ipv4' : 'ipv6')
  }
  return {
    isTrusted(ip: ParsedIp) {
      return ip.family === 4
        ? list.check(ip.address, 'ipv4')
        : list.check(ip.address, 'ipv6')
    },
  }
}

export const TRUST_NOTHING: TrustedProxyMatcher = createTrustedProxyMatcher([])

function parseForwardedFor(value: string | string[] | undefined): ParsedIp[] {
  if (value === undefined) return []
  const raw = Array.isArray(value) ? value.join(',') : value
  if (typeof raw !== 'string' || raw.length === 0) {
    throw new ClientIpError('invalid_forwarded_for', 'Forwarded chain is empty')
  }
  if (raw.length > MAX_FORWARDED_CHARS) {
    throw new ClientIpError('forwarded_for_too_long', 'Forwarded chain is too long')
  }
  const parts = raw.split(',')
  if (parts.length > MAX_FORWARDED_HOPS) {
    throw new ClientIpError('forwarded_for_too_long', 'Forwarded chain has too many hops')
  }
  return parts.map((part) => {
    const ip = parseIp(part)
    if (!ip) throw new ClientIpError('invalid_forwarded_for', 'Forwarded chain contains an invalid address')
    return ip
  })
}

/**
 * Resolve the client identity the way Express does with `trust proxy` enabled:
 * start from the socket address and only walk `X-Forwarded-For` right-to-left
 * while the current peer is inside an explicitly trusted proxy range. The
 * first untrusted address wins, and no other forwarded header is consulted.
 */
export function resolveClientIp(input: ClientIpInput, trust: TrustedProxyMatcher): ClientIpResolution {
  const socket = parseIp(input.remoteAddress)
  if (!socket) throw new ClientIpError('invalid_socket_address', 'Socket address is not a usable IP address')
  if (!trust.isTrusted(socket)) return { ip: socket, source: 'socket', hops: 0 }

  const chain = parseForwardedFor(input.forwardedFor)
  if (chain.length === 0) return { ip: socket, source: 'socket', hops: 0 }

  let current = socket
  let index = chain.length - 1
  while (index >= 0 && trust.isTrusted(current)) {
    current = chain[index] as ParsedIp
    index -= 1
  }
  return { ip: current, source: 'x-forwarded-for', hops: chain.length - 1 - index }
}

export interface HeaderCarrier {
  remoteAddress?: unknown
  headers?: Record<string, string | string[] | undefined>
}

/**
 * Only `x-forwarded-for` participates in identity. `x-real-ip`,
 * `cf-connecting-ip` and `forwarded` are ignored by construction, so a client
 * cannot pick its own guest identity through a spoofed header.
 */
export function resolveClientIpFromHeaders(input: HeaderCarrier, trust: TrustedProxyMatcher): ClientIpResolution {
  return resolveClientIp({
    remoteAddress: input.remoteAddress,
    forwardedFor: input.headers?.['x-forwarded-for'],
  }, trust)
}

/** True only for host headers that name the local machine. */
export function isLoopbackHostname(host: string | null | undefined): boolean {
  if (typeof host !== 'string') return false
  const trimmed = host.trim()
  if (trimmed.length === 0) return false
  let hostname = trimmed
  if (trimmed.startsWith('[')) {
    const end = trimmed.indexOf(']')
    if (end === -1) return false
    hostname = trimmed.slice(1, end)
  }
  else if (trimmed.includes(':')) {
    hostname = trimmed.slice(0, trimmed.indexOf(':'))
  }
  if (hostname === 'localhost') return true
  const ip = parseIp(hostname)
  return ip !== null && isLoopbackIp(ip)
}
