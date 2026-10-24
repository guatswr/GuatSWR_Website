import net from 'node:net'
import { createRequire } from 'node:module'

const proxyaddr = createRequire(__filename)('proxy-addr') as { compile(ranges: string[]): (address: string) => boolean }
// A missing topology trusts nobody. Never accept a boolean or hop count.
export function createTrustProxy(raw = ''): false | ((address: string) => boolean) {
  if (!raw.trim()) return false
  if (raw.length > 4096) throw new Error('TRUST_PROXY_CIDRS is too long')
  const ranges = raw.split(',').map(value => value.trim())
  if (ranges.length > 32) throw new Error('Too many TRUST_PROXY_CIDRS entries')
  for (const range of ranges) {
    const [address, prefix, extra] = range.split('/')
    const family = address === undefined ? 0 : net.isIP(address)
    if (!family || extra !== undefined || (prefix !== undefined && (!/^\d+$/.test(prefix) || Number(prefix) <= 0 || Number(prefix) > (family === 4 ? 32 : 128)))) {
      throw new Error('TRUST_PROXY_CIDRS requires explicit IP addresses or bounded CIDRs')
    }
  }
  return proxyaddr.compile(ranges)
}
