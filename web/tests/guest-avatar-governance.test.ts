import { beforeEach, describe, expect, it } from 'vitest'
import {
  checkAndRecordAvatarQuota,
  resetAvatarQuotaForTesting,
  MAX_AVATAR_UPLOADS_PER_WINDOW
} from '../server/utils/guest-upload'
import { BffError } from '../server/utils/bff-errors'

describe('Guest Avatar Quota Governance (UPLOAD-01)', () => {
  beforeEach(() => {
    resetAvatarQuotaForTesting()
  })

  it('preserves active quotas when the key capacity is reached', () => {
    const now = 1_000_000
    for (let i = 0; i < MAX_AVATAR_UPLOADS_PER_WINDOW; i++) checkAndRecordAvatarQuota('exhausted', 1, now)
    for (let i = 0; i < 4999; i++) checkAndRecordAvatarQuota(`visitor-${i}`, 1, now)
    expect(() => checkAndRecordAvatarQuota('exhausted', 1, now)).toThrowError(BffError)
    expect(() => checkAndRecordAvatarQuota('new-visitor', 1, now)).toThrowError(BffError)
    expect(() => checkAndRecordAvatarQuota('exhausted', 1, now)).toThrowError(BffError)
    expect(() => checkAndRecordAvatarQuota('new-visitor', 1, now + 3600_000)).not.toThrow()
  })

  it('allows uploads within count and volume quotas', () => {
    const key = 'avatar:127.0.0.1:42'
    for (let i = 0; i < MAX_AVATAR_UPLOADS_PER_WINDOW; i++) {
      expect(() => checkAndRecordAvatarQuota(key, 1024 * 1024)).not.toThrow()
    }
  })

  it('rejects uploads exceeding window count quota', () => {
    const key = 'avatar:127.0.0.1:42'
    for (let i = 0; i < MAX_AVATAR_UPLOADS_PER_WINDOW; i++) {
      checkAndRecordAvatarQuota(key, 1024 * 1024)
    }

    expect(() => checkAndRecordAvatarQuota(key, 1024)).toThrowError(BffError)
    try {
      checkAndRecordAvatarQuota(key, 1024)
    } catch (e: unknown) {
      const err = e as BffError
      expect(err.statusCode).toBe(429)
      expect(err.code).toBe('quota_exceeded')
      expect(err.message).toContain('头像上传次数已达上限')
    }
  })

  it('rejects uploads exceeding cumulative byte quota', () => {
    const key = 'avatar:127.0.0.1:42'
    // First upload: 40 MiB
    checkAndRecordAvatarQuota(key, 40 * 1024 * 1024)
    // Second upload: 40 MiB (total 80 MiB)
    checkAndRecordAvatarQuota(key, 40 * 1024 * 1024)
    // Third upload: 25 MiB (total 105 MiB > 100 MiB quota)
    expect(() => checkAndRecordAvatarQuota(key, 25 * 1024 * 1024)).toThrowError(BffError)
    try {
      checkAndRecordAvatarQuota(key, 25 * 1024 * 1024)
    } catch (e: unknown) {
      const err = e as BffError
      expect(err.statusCode).toBe(429)
      expect(err.code).toBe('quota_exceeded')
      expect(err.message).toContain('头像上传累计体积已达上限')
    }
  })

  it('isolates quota across different visitor IPs and different events', () => {
    const key1 = 'avatar:10.0.0.1:100'
    const key2 = 'avatar:10.0.0.2:100'
    const key3 = 'avatar:10.0.0.1:200'

    for (let i = 0; i < MAX_AVATAR_UPLOADS_PER_WINDOW; i++) {
      checkAndRecordAvatarQuota(key1, 1024 * 1024)
    }
    // key1 is now exhausted
    expect(() => checkAndRecordAvatarQuota(key1, 1024)).toThrow()

    // key2 (different IP) has its own fresh quota
    expect(() => checkAndRecordAvatarQuota(key2, 1024 * 1024)).not.toThrow()

    // key3 (different event) has its own fresh quota
    expect(() => checkAndRecordAvatarQuota(key3, 1024 * 1024)).not.toThrow()
  })

  it('resets quota after 1 hour sliding window', () => {
    const key = 'avatar:127.0.0.1:55'
    const t0 = 1000000

    for (let i = 0; i < MAX_AVATAR_UPLOADS_PER_WINDOW; i++) {
      checkAndRecordAvatarQuota(key, 1024 * 1024, t0)
    }
    // Exhausted at t0
    expect(() => checkAndRecordAvatarQuota(key, 1024, t0 + 1800_000)).toThrow()

    // 1 hour later (t0 + 3600_001 ms): fresh window begins
    expect(() => checkAndRecordAvatarQuota(key, 1024 * 1024, t0 + 3600_001)).not.toThrow()
  })
})
