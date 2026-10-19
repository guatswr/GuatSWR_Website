import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createAdminUpstreamFixture } from './fixtures/admin-upstream.mjs'
import type { createAdminUpstreamClient } from '../server/utils/bff-admin-upstream'
import {
  adminCreateActivity,
  adminDeleteLog,
  adminListActivities,
  adminListLogs,
  adminListUsers,
  adminReadConfig,
  adminResetUserPassword,
  adminWriteConfig,
  updateOwnProfile,
} from '../server/utils/bff-admin-resources'
import { createBoundAdminClient, parseAdminId, parseQueryFlag } from '../server/utils/bff-protected'
import { publicDataCache } from '../server/utils/public-data'
import { BffConfigError, BffError } from '../server/utils/bff-errors'

// Real loopback HTTP against the admin fixture: permissions, projections,
// bounded queries/ids, error mapping and cache invalidation on confirmed
// mutations only. No real backend, database or browser is involved.

const SUPER = { id: 1, username: 'admin', role: 'super_admin' as const, avatar: null }
const ADMIN = { id: 2, username: 'editor', role: 'admin' as const, avatar: '/uploads/e.webp' }
const SERVER_TOKEN = `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url')}.${Buffer.from('{"id":1,"role":"super_admin"}').toString('base64url')}.fixture-signature`

const fixture = createAdminUpstreamFixture()
let client: ReturnType<typeof createAdminUpstreamClient>

beforeAll(async () => {
  const port = await fixture.listen(0)
  client = createBoundAdminClient({ apiBase: `http://127.0.0.1:${port}`, config: { upstreamTimeoutMs: 2000 } }, SERVER_TOKEN, '127.0.0.1')
})

afterAll(async () => {
  await fixture.close()
})

function resetFixture() {
  vi.restoreAllMocks()
  fixture.state.meStatus = null
  fixture.state.roleOverride = null
  fixture.state.failNext = null
  fixture.state.requests.length = 0
}

async function expectBffError(promise: Promise<unknown>, statusCode: number, code: string) {
  try {
    await promise
  }
  catch (error) {
    expect(error).toBeInstanceOf(BffError)
    expect((error as BffError).statusCode).toBe(statusCode)
    expect((error as BffError).code).toBe(code)
    return error as BffError
  }
  throw new Error(`expected a BffError with code ${code}`)
}

describe('closed upstream table', () => {
  it('binds the verified server JWT and validated address for every protected request', async () => {
    resetFixture()
    // The concrete fixture port is captured from its listening server.
    const address = fixture.server.address()
    if (!address || typeof address === 'string') throw new Error('fixture is not bound')
    const bound = createBoundAdminClient({ apiBase: `http://127.0.0.1:${address.port}`, config: { upstreamTimeoutMs: 2000 } }, SERVER_TOKEN, '203.0.113.7')
    expect((await bound.request({ route: 'activity.list', bearerToken: 'caller-cannot-replace', clientIp: '198.51.100.9' })).status).toBe(200)
    expect(fixture.state.requests[0]?.headers.authorization).toBe(`Bearer ${SERVER_TOKEN}`)
    expect(fixture.state.requests[0]?.headers['x-forwarded-for']).toBe('203.0.113.7')
    expect(fixture.state.requests[0]?.headers.cookie).toBeUndefined()
    expect(fixture.state.requests[0]?.headers.origin).toBeUndefined()
  })
  it('rejects non-allowlisted query keys and unsafe path parameters', async () => {
    resetFixture()
    await expect(client.request({ route: 'activity.list', query: { evil: '1' } })).rejects.toBeInstanceOf(BffConfigError)
    await expect(client.request({ route: 'activity.detail', params: { id: '1 OR 1=1' } })).rejects.toBeInstanceOf(BffConfigError)
    await expect(client.request({ route: 'activity.detail', params: { id: 0 } })).rejects.toBeInstanceOf(BffConfigError)
    await expect(client.request({ route: 'activity.detail', params: {} })).rejects.toBeInstanceOf(BffConfigError)
    await expect(client.request({ route: 'activity.list', params: { id: 1 } })).rejects.toBeInstanceOf(BffConfigError)
    expect(fixture.state.requests).toHaveLength(0)
  })

  it('sends only the server JWT and the server-resolved address', async () => {
    resetFixture()
    const response = await client.request({ route: 'activity.list', query: { all: '1' } })
    expect(response.status).toBe(200)
    const request = fixture.state.requests[0]
    expect(request?.headers.authorization).toBe(`Bearer ${SERVER_TOKEN}`)
    expect(request?.headers.cookie).toBeUndefined()
    expect(request?.headers.origin).toBeUndefined()
    expect(request?.headers['x-forwarded-for']).toBe('127.0.0.1')
    expect(request?.query).toBe('all=1')
  })

  it('validates ids and flags at the route boundary', () => {
    expect(parseAdminId('12')).toBe(12)
    for (const value of ['0', '-1', 'abc', '../etc', '1 OR 1=1', '9999999999999999', '', undefined, 12]) {
      expect(() => parseAdminId(value)).toThrow(BffError)
    }
    expect(parseQueryFlag('1', false)).toBe(true)
    expect(parseQueryFlag('false', true)).toBe(false)
    expect(parseQueryFlag(undefined, true)).toBe(true)
    expect(() => parseQueryFlag('yes', false)).toThrow(BffError)
  })
})

describe('permissions from the current role', () => {
  it('denies includeDeleted to a non-super admin without calling upstream', async () => {
    resetFixture()
    await expectBffError(
      adminListActivities(client, ADMIN, { includeDeleted: '1' }),
      403,
      'forbidden',
    )
    expect(fixture.state.requests).toHaveLength(0)
  })

  it('allows includeDeleted for a super admin', async () => {
    resetFixture()
    const result = await adminListActivities(client, SUPER, { includeDeleted: '1', page: '1', limit: '20' })
    expect(result.total).toBe(3)
    expect(fixture.state.requests[0]?.query).toContain('includeDeleted=1')
  })
})

describe('projections strip private fields', () => {
  it('drops raw DB columns and private config from every list', async () => {
    resetFixture()
    const activities = await adminListActivities(client, SUPER, {})
    expect(activities.items).toHaveLength(2)
    const serialized = JSON.stringify(activities)
    expect(serialized).not.toContain('private-hash')
    expect(serialized).not.toContain('token_version')
    expect(activities.items[0]).not.toHaveProperty('password')

    const config = await adminReadConfig(client)
    expect(config.banner_text).toBe('欢迎')
    expect(config).not.toHaveProperty('token_version')
    expect(config).not.toHaveProperty('backup_enabled')
    expect(JSON.stringify(config)).not.toContain('/secret/path.sqlite')

    const users = await adminListUsers(client)
    expect(users[0]).toMatchObject({ id: 1, username: 'admin', role: 'super_admin', twofa_enabled: false })
    expect(users[1]?.twofa_enabled).toBe(true)
    expect(JSON.stringify(users)).not.toContain('private-2fa')

    const logs = await adminListLogs(client, { page: '1', limit: '20' })
    expect(JSON.stringify(logs)).not.toContain('token_version')
  })
})

describe('writes validate, confirm and invalidate', () => {
  it('rejects invalid payloads before any upstream call', async () => {
    resetFixture()
    await expectBffError(adminCreateActivity(client, { title: '', tag: 'x', date: 'x' }), 400, 'invalid_request')
    await expectBffError(adminWriteConfig(client, { key: 'token_version', value: '1' }), 400, 'invalid_request')
    await expectBffError(adminWriteConfig(client, { key: 'qq_group_number', value: '12' }), 400, 'invalid_request')
    await expectBffError(adminResetUserPassword(client, 2, { password: '12345' }), 400, 'invalid_request')
    expect(fixture.state.requests).toHaveLength(0)
  })

  it('invalidates only after a confirmed success and never on failure', async () => {
    resetFixture()
    const invalidator = vi.spyOn(publicDataCache, 'invalidate')
    const generation = publicDataCache.generation('activities')

    const created = await adminCreateActivity(client, { title: '新活动', tag: '活动', date: '2026-08-05' })
    expect(created.id).toBeGreaterThan(0)
    expect(invalidator).toHaveBeenCalledWith(['activities', 'logs'])
    expect(publicDataCache.generation('activities')).toBe(generation + 1)

    invalidator.mockClear()
    fixture.state.failNext = { status: 500, body: { error: 'SQLITE_ERROR: no such table activities' } }
    const error = await expectBffError(
      adminCreateActivity(client, { title: '失败活动', tag: '活动', date: '2026-08-05' }),
      502,
      'upstream_error',
    )
    expect(error.message).not.toContain('SQLITE')
    expect(invalidator).not.toHaveBeenCalled()

    // A broken invalidator must not turn a confirmed write into an error.
    invalidator.mockImplementation(() => {
      throw new Error('cache down')
    })
    await expect(adminWriteConfig(client, { key: 'banner_text', value: '欢迎' })).resolves.toEqual({ message: '已保存' })
  })

  it('maps upstream statuses to fixed messages without reflecting bodies', async () => {
    resetFixture()
    fixture.state.failNext = { status: 401, body: { error: 'jwt malformed', stack: 'secret stack' } }
    const unauthorized = await expectBffError(adminListActivities(client, SUPER, {}), 401, 'session_expired')
    expect(unauthorized.message).not.toContain('jwt')
    expect(unauthorized.message).not.toContain('stack')
    fixture.state.failNext = { status: 403, body: { error: 'ordinary permission denial' } }
    await expectBffError(adminListActivities(client, SUPER, {}), 403, 'forbidden')

    fixture.state.failNext = { status: 404, body: { error: 'no such row' } }
    await expectBffError(adminDeleteLog(client, 99), 404, 'not_found')

    fixture.state.failNext = { status: 400, body: { error: 'SQLITE_ERROR: near "x"' } }
    const invalid = await expectBffError(adminDeleteLog(client, 1), 400, 'invalid_request')
    expect(invalid.message).not.toContain('SQLITE')

    fixture.state.failNext = { status: 429, body: { error: 'slow down' } }
    const limited = await expectBffError(adminDeleteLog(client, 1), 429, 'rate_limited')
    expect(limited.retryAfterSeconds).toBeUndefined()
  })

  it('revokes nothing itself: deletion of the caller is a fixed 400', async () => {
    resetFixture()
    // The fixture rejects deleting the caller (id 1) exactly like the backend.
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
    const payload = Buffer.from(JSON.stringify({ id: 1 })).toString('base64url')
    const response = await client.request({ route: 'user.delete', params: { id: 1 }, bearerToken: `${header}.${payload}.sig` })
    expect(response.status).toBe(400)
  })
})

describe('profile updates report credential changes', () => {
  it('flags password/second-password changes and passes the raw body through', async () => {
    resetFixture()
    const changed = await updateOwnProfile(client, { password: 'newpassword' })
    expect(changed).toMatchObject({ credentialsChanged: true, message: '个人资料更新成功' })
    expect(fixture.state.profileBodies.at(-1)).toEqual({ password: 'newpassword' })

    const avatarOnly = await updateOwnProfile(client, { avatar: '/uploads/new.webp' })
    expect(avatarOnly.credentialsChanged).toBe(false)
  })
})
