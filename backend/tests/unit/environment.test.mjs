import path from 'node:path'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
const require = createRequire(import.meta.url)
const { parseEnvironment } = require('../../dist/src/config/environment.js')
const { AppError } = require('../../dist/src/errors.js')

const root = path.resolve('isolated-package-root')
const input = { JWT_SECRET: ' exact secret bytes ' }
describe('compiled strict environment foundation', () => {
  it('keeps secret bytes and resolves package anchored defaults', () => {
    const result = parseEnvironment(input, root)
    expect(result.jwtSecret).toBe(input.JWT_SECRET)
    expect(result.port).toBe(3000)
    expect(result.maxBodyBytes).toBe(50 * 1024 ** 2)
    expect(result.paths.data).toBe(path.join(root, 'data'))
    expect(result.paths.public).toBe(path.join(root, 'data/public'))
  })
  it('accepts explicit ephemeral ports and isolated absolute paths', () => {
    const result = parseEnvironment({ ...input, PORT: '0', DATA_DIR: root, MAX_BODY_SIZE: '16kb', SHUTDOWN_TIMEOUT_MS: '100' }, root)
    expect(result.port).toBe(0)
    expect(result.maxBodyBytes).toBe(16384)
    expect(result.paths.data).toBe(root)
  })
  it.each([
    ['NODE_ENV', 'unknown'], ['JWT_SECRET', '  '], ['PORT', '-1'], ['PORT', '65536'],
    ['PORT', '1.5'], ['DATA_DIR', 'relative'], ['PUBLIC_DIR', 'relative'],
    ['BACKUP_ROOT', 'relative'], ['MAX_BODY_SIZE', '51mb'], ['MAX_BODY_SIZE', '0'],
    ['MAX_BODY_SIZE', '1e6'], ['SHUTDOWN_TIMEOUT_MS', '99'], ['BFF_BRIDGE_SECRET', 'secret-value'],
  ])('rejects invalid %s without exposing values', (key, value) => {
    try {
      parseEnvironment({ ...input, [key]: value }, root)
      throw new Error('Expected configuration rejection')
    } catch (error) {
      expect(error).toBeInstanceOf(AppError)
      expect(error.code).toBe('invalid_configuration')
      expect(error.message).toBe(`Invalid configuration: ${key}`)
    }
  })
  it('requires a bridge credential in production', () => {
    expect(() => parseEnvironment({ ...input, NODE_ENV: 'production' }, root)).toThrow('BFF_BRIDGE_SECRET')
    expect(parseEnvironment({ ...input, NODE_ENV: 'production', BFF_BRIDGE_SECRET: 'a'.repeat(32) }, root).nodeEnv).toBe('production')
  })
  it('preserves error causes', () => {
    const cause = new Error('synthetic')
    expect(new AppError('safe', 'test', 503, { cause }).cause).toBe(cause)
  })
})
