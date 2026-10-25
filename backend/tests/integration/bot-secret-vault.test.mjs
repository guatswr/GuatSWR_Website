import { it,expect } from 'vitest'
import { createRequire } from 'node:module'
import { fixture,token,get,run,all } from '../helpers/fixture.mjs'
const require=createRequire(import.meta.url)
const {createBotSecretVault}=require('../../dist/src/integrations/bot/secret-vault.js')
const {redactSecrets}=require('../../dist/src/security/redact-secrets.js')
const headers={Authorization:`Bearer ${token()}`}
it('keeps recoverable tokens encrypted, reveals only to a live owner, audits without tokens and erases on revoke',async()=>{
  const f=await fixture({env:{BOT_PLATFORM_ENABLED:'true',BOT_CREDENTIAL_ENCRYPTION_KEY:'ab'.repeat(32)}})
  const created=await f.http.post('/api/bot/admin/credentials').set(headers).send({name:'vault',scopes:['query:read'],groups:[]})
  expect(created.status).toBe(200)
  const c=created.body
  const stored=await get(f.db,'SELECT * FROM bot_credential_secrets WHERE credential_id=?',[c.id])
  expect(stored.encrypted_token).not.toContain(c.token)
  const list=await f.http.get('/api/bot/admin/credentials').set(headers)
  expect(list.body.vault_enabled).toBe(true);expect(list.body.items[0].secret_available).toBe(1)
  expect(JSON.stringify(list.body)).not.toMatch(/gwb_|encrypted_token|secret_hash/)
  expect((await f.http.post(`/api/bot/admin/credentials/${c.id}/reveal`).set({Authorization:`Bearer ${token(2,'admin')}`})).status).toBe(403)
  expect((await f.http.post(`/api/bot/admin/credentials/${c.id}/reveal`).set({Authorization:`Bearer ${c.token}`})).status).toBe(403)
  const result=await f.http.post(`/api/bot/admin/credentials/${c.id}/reveal`).set(headers)
  expect(result.body).toEqual({id:c.id,token:c.token});expect(result.headers['cache-control']).toContain('no-store')
  expect(JSON.stringify(await all(f.db,'SELECT * FROM security_audit_outbox'))).not.toContain(c.token)
  await run(f.db,"UPDATE users SET role='admin' WHERE id=1")
  expect((await f.http.post(`/api/bot/admin/credentials/${c.id}/reveal`).set(headers)).status).toBe(403)
  await run(f.db,"UPDATE users SET role='super_admin' WHERE id=1")
  expect((await f.http.delete(`/api/bot/admin/credentials/${c.id}`).set(headers)).status).toBe(200)
  expect(await get(f.db,'SELECT * FROM bot_credential_secrets WHERE credential_id=?',[c.id])).toBeUndefined()
  expect((await f.http.post(`/api/bot/admin/credentials/${c.id}/reveal`).set(headers)).status).toBe(409)
})
it('does not invent unrecoverable legacy tokens and rejects tampering or swapped credential IDs',async()=>{
  const f=await fixture({env:{BOT_PLATFORM_ENABLED:'true'}})
  const c=(await f.http.post('/api/bot/admin/credentials').set(headers).send({name:'hash-only',scopes:['query:read']})).body
  expect((await f.http.post(`/api/bot/admin/credentials/${c.id}/reveal`).set(headers)).status).toBe(503)
  const vault=createBotSecretVault('ab'.repeat(32),true), raw=`gwb_${'a'.repeat(64)}`, encrypted=vault.seal('id',raw)
  expect(vault.open('id',encrypted)).toBe(raw)
  expect(()=>vault.open('other',encrypted)).toThrow('密钥无法读取')
  expect(()=>createBotSecretVault('cd'.repeat(32),true).open('id',encrypted)).toThrow('密钥无法读取')
  expect(()=>vault.open('id',encrypted+'.bad')).toThrow('密钥无法读取')
})
it('redacts tokens before audit writes and when reading legacy administrator logs',async()=>{
  const f=await fixture(), secret=`gwb_${'a'.repeat(64)}`
  const {enqueueSecurityAudit}=require('../../dist/src/security/audit-outbox.js')
  await enqueueSecurityAudit(f.context.sql.main,'owner','TEST',`Token: ${secret}`)
  expect(JSON.stringify(await all(f.db,'SELECT details FROM security_audit_outbox'))).not.toContain(secret)
  await run(f.logDb,'INSERT INTO audit_logs(username,action,details) VALUES(?,?,?)',['owner','TEST',`copied ${secret}; token="short-private"; Authorization: Bearer abc.def.ghi`])
  const logs=(await f.http.get('/api/admin/logs').set(headers)).body
  expect(JSON.stringify(logs)).not.toMatch(/gwb_|short-private|abc\.def\.ghi/)
  const once=redactSecrets(`token=${secret}`)
  expect(redactSecrets(once)).toBe(once)
})
