import { describe, expect, it } from 'vitest'
import { upstreamUrl } from '../server/utils/upstream'

describe('private upstream boundary', () => {
  it('resolves frozen API paths on the configured origin', () => {
    expect(upstreamUrl('http://127.0.0.1:8080', '/api/config'))
      .toBe('http://127.0.0.1:8080/api/config')
  })

  it.each([
    ['file:///etc/passwd', '/api/config'],
    ['https://user:secret@example.com', '/api/config'],
    ['http://localhost:8080/api', '/api/config'],
    ['https://example.com?token=secret', '/api/config'],
    ['https://example.com', '//evil.example/api/config'],
    ['https://example.com', '/api/../admin'],
    ['https://example.com', '/api/config?redirect=https://evil.example'],
  ])('rejects malformed origins and path escape attempts (%s, %s)', (origin, path) => {
    expect(() => upstreamUrl(origin, path)).toThrow()
  })
})
