import { describe, expect, it } from 'vitest'
import { createSecondPasswordCodec, comparePassword, hashPassword } from '../../dist/src/security/credentials.js'

describe('createSecondPasswordCodec', () => {
  it('encrypts and decrypts with a single secret', () => {
    const codec = createSecondPasswordCodec('primary-secret')
    const encrypted = codec.encrypt('my-password-123')
    expect(encrypted).toContain(':')
    expect(codec.decrypt(encrypted)).toBe('my-password-123')
  })

  it('supports candidate fallback keys for rotation and migration', () => {
    const oldCodec = createSecondPasswordCodec('historical-secret')
    const oldCiphertext = oldCodec.encrypt('legacy-2fa-value')

    const newCodec = createSecondPasswordCodec(['new-secret', 'historical-secret'])
    expect(newCodec.decrypt(oldCiphertext)).toBe('legacy-2fa-value')

    const newCiphertext = newCodec.encrypt('new-2fa-value')
    expect(newCodec.decrypt(newCiphertext)).toBe('new-2fa-value')
  })

  it('supports comma-separated candidate keys in a single string', () => {
    const codec1 = createSecondPasswordCodec('first-key')
    const cipher1 = codec1.encrypt('secret-a')

    const codecCombined = createSecondPasswordCodec('second-key, first-key')
    expect(codecCombined.decrypt(cipher1)).toBe('secret-a')
  })

  it('throws an error when all candidate keys fail decryption', () => {
    const codec = createSecondPasswordCodec(['key-a', 'key-b'])
    const otherCodec = createSecondPasswordCodec('unrelated-key')
    const foreignCiphertext = otherCodec.encrypt('secret')
    expect(() => codec.decrypt(foreignCiphertext)).toThrow()
  })

  it('returns null on empty or non-string payloads', () => {
    const codec = createSecondPasswordCodec('secret')
    expect(codec.decrypt(null)).toBeNull()
    expect(codec.decrypt(undefined)).toBeNull()
    expect(codec.decrypt('')).toBeNull()
    expect(codec.decrypt(123)).toBeNull()
  })

  it('verifies bcrypt-hashed passwords for modern 2FA storage', () => {
    const hashed = hashPassword('my-strong-2fa')
    expect(hashed).toMatch(/^\$2[ab]\$/)
    expect(comparePassword('my-strong-2fa', hashed)).toBe(true)
    expect(comparePassword('wrong-password', hashed)).toBe(false)
  })
})
