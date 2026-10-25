import { expect, it } from 'vitest'
import { botCredentialUpstreamListSchema, botCredentialCreatedSchema } from '@guatswr/shared/bot'
import { createAdminUpstreamClient } from '../server/utils/bff-admin-upstream'

it('projects metadata without leaking the credential hash or an unexpected secret', () => {
  const row = { id: '12345678-1234-4234-8234-123456789abc', name: 'bot', scopes: '["query:read"]', groups_json: '["123456"]', created_at: 1, revoked_at: null }
  expect(botCredentialUpstreamListSchema.parse({ items: [{ ...row, secret_hash: 'private', token: 'private' }] })).toEqual({ items: [{ id: row.id, name: 'bot', scopes: ['query:read'], groups: ['123456'], created_at: 1, revoked_at: null, secret_available: false }], vault_enabled: false })
  expect(botCredentialUpstreamListSchema.safeParse({ items: [{ ...row, scopes: 'not-json' }] }).success).toBe(false)
  expect(botCredentialCreatedSchema.safeParse({ ...row, scopes: ['query:read'], groups: [], token: 'not-a-token' }).success).toBe(false)
})

it('fixes credential upstream methods and rejects injected credential IDs', async () => {
  const calls: { url: string; method?: string }[] = []
  const client = createAdminUpstreamClient({ origin: 'http://127.0.0.1:3000', fetch: async (input, init) => {
    calls.push({ url: String(input), method: init?.method })
    return new Response('{}', { headers: { 'content-type': 'application/json' } })
  } })
  const id = '12345678-1234-4234-8234-123456789abc'
  await client.request({ route: 'bot.credentials' })
  await client.request({ route: 'bot.createCredential', body: { name: 'bot', scopes: ['query:read'] } })
  await client.request({ route: 'bot.revokeCredential', params: { id } })
  expect(calls).toEqual([
    { url: 'http://127.0.0.1:3000/api/bot/admin/credentials', method: 'GET' },
    { url: 'http://127.0.0.1:3000/api/bot/admin/credentials', method: 'POST' },
    { url: `http://127.0.0.1:3000/api/bot/admin/credentials/${id}`, method: 'DELETE' },
  ])
  for (const invalid of ['../private', `${id}?token=private`, `${id}/..`]) await expect(client.request({ route: 'bot.revokeCredential', params: { id: invalid } })).rejects.toThrow()
  expect(calls).toHaveLength(3)
})
