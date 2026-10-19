import { describe, expect, it } from 'vitest'
import {
  TRUST_NOTHING,
  createTrustedProxyMatcher,
  isLoopbackHostname,
  isLoopbackIp,
  parseIp,
  resolveClientIp,
  resolveClientIpFromHeaders,
} from '../server/utils/bff-identity'
import { BffConfigError, ClientIpError } from '../server/utils/bff-errors'

const TRUSTING_ONE_HOP = createTrustedProxyMatcher(['10.0.0.0/8'])
const TRUSTING_V6 = createTrustedProxyMatcher(['2001:db8::/32'])

describe('address parsing and canonicalization', () => {
  it('accepts IPv4 and canonicalizes IPv6', () => {
    expect(parseIp('203.0.113.9')).toEqual({ family: 4, address: '203.0.113.9' })
    expect(parseIp('2001:0DB8:0000:0000:0000:0000:0000:0001')).toEqual({ family: 6, address: '2001:db8::1' })
    expect(parseIp('::1')).toEqual({ family: 6, address: '::1' })
  })

  it('normalizes IPv4-mapped IPv6 to the underlying IPv4 identity', () => {
    expect(parseIp('::ffff:127.0.0.1')).toEqual({ family: 4, address: '127.0.0.1' })
    expect(parseIp('0:0:0:0:0:ffff:7f00:1')).toEqual({ family: 4, address: '127.0.0.1' })
    expect(parseIp('::ffff:203.0.113.9')).toEqual({ family: 4, address: '203.0.113.9' })
  })

  it.each([
    ['', 'empty'],
    ['not-an-ip', 'garbage'],
    ['203.0.113.9:443', 'port'],
    ['[2001:db8::1]', 'brackets'],
    ['fe80::1%eth0', 'zone id'],
    ['10.0.0.0/8', 'cidr'],
    ['203.0.113.9, 10.0.0.1', 'list'],
    [`${'1'.repeat(70)}`, 'oversized'],
  ])('rejects unusable address shapes (%s)', (value) => {
    expect(parseIp(value)).toBeNull()
  })

  it('detects loopback for both families', () => {
    expect(isLoopbackIp({ family: 4, address: '127.0.0.1' })).toBe(true)
    expect(isLoopbackIp({ family: 4, address: '127.9.9.9' })).toBe(true)
    expect(isLoopbackIp({ family: 4, address: '128.0.0.1' })).toBe(false)
    expect(isLoopbackIp({ family: 6, address: '::1' })).toBe(true)
    expect(isLoopbackIp({ family: 6, address: '::2' })).toBe(false)
  })
})

describe('trusted proxy configuration', () => {
  it('trusts nothing by default', () => {
    expect(TRUST_NOTHING.isTrusted({ family: 4, address: '10.0.0.1' })).toBe(false)
    expect(TRUST_NOTHING.isTrusted({ family: 6, address: '::1' })).toBe(false)
  })

  it('matches IPv4 CIDRs, exact addresses and IPv6 CIDRs', () => {
    expect(TRUSTING_ONE_HOP.isTrusted({ family: 4, address: '10.1.2.3' })).toBe(true)
    expect(TRUSTING_ONE_HOP.isTrusted({ family: 4, address: '11.1.2.3' })).toBe(false)
    expect(TRUSTING_V6.isTrusted({ family: 6, address: '2001:db8::5' })).toBe(true)
    expect(TRUSTING_V6.isTrusted({ family: 6, address: '2001:db9::5' })).toBe(false)
    const exact = createTrustedProxyMatcher(['192.0.2.7'])
    expect(exact.isTrusted({ family: 4, address: '192.0.2.7' })).toBe(true)
    expect(exact.isTrusted({ family: 4, address: '192.0.2.8' })).toBe(false)
  })

  it.each(['10.0.0.0/33', '10.0.0.0/-1', 'garbage/8', '::ffff:10.0.0.0/104', '10.0.0.0/8/8', ''])(
    'rejects an invalid trusted proxy entry (%s)',
    (entry) => {
      expect(() => createTrustedProxyMatcher([entry])).toThrow(BffConfigError)
    },
  )
})

describe('client identity resolution', () => {
  it('ignores forwarding headers when the socket peer is not a trusted proxy', () => {
    const resolution = resolveClientIp({
      remoteAddress: '198.51.100.7',
      forwardedFor: '203.0.113.9, 10.0.0.5',
    }, TRUSTING_ONE_HOP)
    expect(resolution).toEqual({ ip: { family: 4, address: '198.51.100.7' }, source: 'socket', hops: 0 })
  })

  it('walks multiple hops right-to-left and stops at the first untrusted address', () => {
    const resolution = resolveClientIp({
      remoteAddress: '10.0.0.5',
      forwardedFor: '203.0.113.9, 198.51.100.4, 10.0.0.7',
    }, TRUSTING_ONE_HOP)
    expect(resolution.ip).toEqual({ family: 4, address: '198.51.100.4' })
    expect(resolution.source).toBe('x-forwarded-for')
    expect(resolution.hops).toBe(2)
  })

  it('keeps a fully trusted chain distinct per client and falls back to the socket when the chain is empty', () => {
    const first = resolveClientIp({ remoteAddress: '10.0.0.5', forwardedFor: '10.0.0.9' }, TRUSTING_ONE_HOP)
    const second = resolveClientIp({ remoteAddress: '10.0.0.5', forwardedFor: '10.0.0.10' }, TRUSTING_ONE_HOP)
    expect(first.ip.address).toBe('10.0.0.9')
    expect(second.ip.address).toBe('10.0.0.10')
    expect(first.ip.address).not.toBe(second.ip.address)
    expect(resolveClientIp({ remoteAddress: '10.0.0.5' }, TRUSTING_ONE_HOP).source).toBe('socket')
  })

  it('normalizes a mapped trusted peer and an IPv6 chain', () => {
    expect(resolveClientIp({ remoteAddress: '::ffff:10.0.0.5', forwardedFor: '203.0.113.9' }, TRUSTING_ONE_HOP).ip)
      .toEqual({ family: 4, address: '203.0.113.9' })
    expect(resolveClientIp({ remoteAddress: '2001:db8::1', forwardedFor: '2001:4860::1' }, TRUSTING_V6).ip)
      .toEqual({ family: 6, address: '2001:4860::1' })
  })

  it.each([
    ['unusable socket address', { remoteAddress: 'not-an-ip' }, 'invalid_socket_address'],
    ['malformed chain entry', { remoteAddress: '10.0.0.5', forwardedFor: '203.0.113.9, not-an-ip' }, 'invalid_forwarded_for'],
    ['empty chain entry', { remoteAddress: '10.0.0.5', forwardedFor: '203.0.113.9,,10.0.0.3' }, 'invalid_forwarded_for'],
  ])('fails closed instead of guessing (%s)', (_label, input, code) => {
    expect(() => resolveClientIp(input, TRUSTING_ONE_HOP)).toThrow(ClientIpError)
    try {
      resolveClientIp(input, TRUSTING_ONE_HOP)
    }
    catch (error) {
      expect((error as ClientIpError).code).toBe(code)
    }
  })

  it('bounds the forwarded chain length and size', () => {
    const manyHops = Array.from({ length: 21 }, () => '10.0.0.1').join(',')
    expect(() => resolveClientIp({ remoteAddress: '10.0.0.5', forwardedFor: manyHops }, TRUSTING_ONE_HOP))
      .toThrow(ClientIpError)
    expect(() => resolveClientIp({ remoteAddress: '10.0.0.5', forwardedFor: '1'.repeat(3000) }, TRUSTING_ONE_HOP))
      .toThrow(ClientIpError)
  })

  it('reads only x-forwarded-for and ignores spoofed real-ip, CF and Forwarded headers', () => {
    const headers = {
      'x-forwarded-for': '203.0.113.9',
      'x-real-ip': '10.0.0.200',
      'cf-connecting-ip': '10.0.0.201',
      'forwarded': 'for=10.0.0.202',
      'CF-Connecting-IP': '10.0.0.203',
    }
    expect(resolveClientIpFromHeaders({ remoteAddress: '10.0.0.5', headers }, TRUSTING_ONE_HOP).ip.address)
      .toBe('203.0.113.9')
    expect(resolveClientIpFromHeaders({
      remoteAddress: '198.51.100.7',
      headers: { 'x-real-ip': '10.0.0.200', 'cf-connecting-ip': '10.0.0.201' },
    }, TRUSTING_ONE_HOP).ip.address).toBe('198.51.100.7')
  })

  it('accepts a repeated header array as a single chain', () => {
    expect(resolveClientIp({
      remoteAddress: '10.0.0.5',
      forwardedFor: ['203.0.113.9', '10.0.0.7'],
    }, TRUSTING_ONE_HOP).ip.address).toBe('203.0.113.9')
  })
})

describe('loopback host detection for the local insecure-cookie switch', () => {
  it.each(['localhost', 'localhost:3100', '127.0.0.1', '127.0.0.1:3100', '[::1]', '[::1]:3100'])('accepts %s', (host) => {
    expect(isLoopbackHostname(host)).toBe(true)
  })

  it.each(['nex t.guatswr.top', 'next.guatswr.top', '10.0.0.1', '', undefined, 'localhost.evil.example'])('rejects %s', (host) => {
    expect(isLoopbackHostname(host)).toBe(false)
  })
})
