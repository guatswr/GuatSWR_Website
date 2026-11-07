import { afterEach, expect, it, vi } from 'vitest'
import { stateDriver } from '../server/utils/postgres-state'
import { createMemorySessionStore } from '../server/utils/bff-session'
import { createGuestDraftStore } from '../server/utils/guest-drafts'
import { createPostgresDurableStore } from '../server/utils/durable-records'

afterEach(() => vi.unstubAllEnvs())

it('selects the explicit state driver before environment defaults', () => {
  vi.stubEnv('DATABASE_DRIVER', 'postgres')
  vi.stubEnv('BFF_DATABASE_DRIVER', 'sqlite')
  expect(stateDriver()).toBe('sqlite')
  expect(stateDriver('memory')).toBe('memory')
  vi.stubEnv('BFF_DATABASE_DRIVER', 'typo')
  expect(() => stateDriver()).toThrow()
})

it('refuses PostgreSQL state without a private URL instead of falling back to SQLite', () => {
  vi.stubEnv('BFF_DATABASE_DRIVER', 'postgres')
  vi.stubEnv('BFF_POSTGRES_URL', '')
  vi.stubEnv('POSTGRES_URL', '')
  expect(() => createMemorySessionStore({ secret: 's'.repeat(40) })).toThrow()
  expect(() => createGuestDraftStore(Buffer.alloc(32))).toThrow()
})

it.each(['http://localhost/db', 'postgres://localhost/db', 'postgres://app@localhost/', 'postgres://app@localhost/db?options=-c+search_path%3Dpublic'])('rejects invalid state URL %s before creating a pool', (connectionString) => {
  expect(() => createPostgresDurableStore({ namespace: 'test', secret: Buffer.alloc(32), connectionString })).toThrow()
})

it.each([0, -1, Infinity, NaN, 1.5])('rejects invalid durable capacity %s', maxEntries => {
  expect(() => createPostgresDurableStore({ namespace: 'test', secret: Buffer.alloc(32), connectionString: 'postgres://app@localhost/test', maxEntries })).toThrow()
})

// Concurrency, encryption, restart and recovery contracts execute against real
// PostgreSQL in backend/tests/postgres/release.test.mjs via pnpm test:release.
