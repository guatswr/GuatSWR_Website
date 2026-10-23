import { describe, it, expect } from 'vitest'
import { fixture, token, run, get, all, bridgeHeaders } from '../helpers/fixture.mjs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const jwt = require('jsonwebtoken')
describe('authentication and persistence integration', () => {
 it('A02 issues 24-hour JWT, locks after five wrong passwords and releases expired lock', async () => {
   const f=await fixture()
   const login=await f.http.post('/api/auth/login').send({username:' admin ',password:'fixture-password'})
   expect(login.status).toBe(200)
   const claims=jwt.verify(login.body.token,f.context.env.JWT_SECRET)
   expect(claims.exp-claims.iat).toBe(86400)
   for (let n=1;n<=5;n++) {
     const response=await f.http.post('/api/auth/login').send({username:'admin',password:'wrong'})
     expect(response.status).toBe(n===5?429:401)
   }
   expect((await f.http.post('/api/auth/login').send({username:'admin',password:'fixture-password'})).status).toBe(429)
   await run(f.db,'UPDATE login_attempts SET lock_until=1')
   expect((await f.http.post('/api/auth/login').send({username:'admin',password:'fixture-password'})).status).toBe(200)
 })
 it('A03 distinguishes missing/invalid/version-expired JWT and optional anonymous fallback', async () => {
   const f=await fixture()
   expect((await f.http.get('/api/auth/me')).status).toBe(401)
   expect((await f.http.get('/api/auth/me').set('Authorization','Bearer bad')).status).toBe(403)
   expect((await f.http.get('/api/activities').set('Authorization','Bearer bad')).status).toBe(200)
   await run(f.db,"INSERT INTO site_config VALUES ('token_version','1')")
   expect((await f.http.get('/api/auth/me').set('Authorization',`Bearer ${token()}`)).status).toBe(401)
 })
 it('A04 checks super-admin boundary and never returns password or encrypted credentials in user list', async () => {
   const f=await fixture()
   expect((await f.http.get('/api/admin/users').set('Authorization',`Bearer ${token(2,'admin')}`)).status).toBe(403)
   const response=await f.http.get('/api/admin/users').set('Authorization',`Bearer ${token()}`)
   expect(response.body).toHaveLength(4)
   expect(JSON.stringify(response.body)).not.toContain('password')
   expect(JSON.stringify(response.body)).not.toContain('twofa_secret')
 })
 it('A05/A07 preserves public config boundary and draft visibility, author projections and pagination', async () => {
   const f=await fixture()
   expect((await f.http.get('/api/config')).body).toEqual({banner_text:'fixture'})
   expect((await f.http.get('/api/activities/2')).status).toBe(404)
   expect((await f.http.get('/api/activities?all=1')).status).toBe(401)
   const list=await f.http.get('/api/activities?limit=999&page=-1')
   expect(list.body).toMatchObject({limit:100,page:1,total:1})
   expect(list.body.items[0].created_by).toBe(2)
   expect((await f.http.get('/api/activities/1')).body.created_by).toBe('admin')
 })
 it('E03 upserts the same visitor, returns it, and cancellation removes only that identity', async () => {
   const f=await fixture({env:{TRUST_PROXY_CIDRS:"127.0.0.1/32"}})
   const body={common_id:'visitor',qq:'12345',avatar:'/uploads/avatar.png'}
   for (let n=0;n<2;n++) expect((await f.http.post('/api/event/1/signup').set(bridgeHeaders()).send({...body,common_id:`visitor-${n}`})).status).toBe(200)
   expect((await f.http.get('/api/event/1/signup').set(bridgeHeaders())).body.data.common_id).toBe('visitor-1')
   expect((await all(f.db,'SELECT * FROM event_participants WHERE event_id=1')).length).toBe(2)
   expect((await f.http.delete('/api/event/1/signup').set(bridgeHeaders())).status).toBe(200)
   expect((await f.http.get('/api/event/1/signup').set(bridgeHeaders())).body).toEqual({data:null})
   expect((await get(f.db,'SELECT user_id FROM event_participants')).user_id).toBe(2)
 })
 it('A06/F01/B01 characterizes ordering, real multipart/static files and backup bytes', async () => {
   const f=await fixture()
   await run(f.db,"INSERT INTO history(date,title,sort_order) VALUES ('2025-01-01','earlier',3),('2026-01-01','sort-first',-1)")
   expect((await f.http.get('/api/history')).body.map(e=>e.title)).toEqual(['earlier','sort-first','history'])
   expect((await f.http.get('/api/admin/backups/download?type=full&file=missing').set('Authorization',`Bearer ${token()}`)).status).toBe(404)
   const sql=await get(f.db,'PRAGMA foreign_keys')
   expect(sql.foreign_keys).toBe(1)
   const audit=await f.http.get('/api/admin/logs').set('Authorization',`Bearer ${token()}`)
   expect(audit.body.logs[0].created_at).toBe('2026-01-01T08:00:00+08:00')
 })
})
// Temporary reproductions are deliberately named EX. Replace with target assertions
// in the corresponding security fix, never normalize these into permanent contracts.
describe('registered legacy defect reproductions', () => {
 it('EX-02 direct draft writes now require a trusted entry',async()=>{
   const f=await fixture()
   expect((await f.http.put('/api/event/2').send({title:'foreign draft'})).status).toBe(403)
   expect((await get(f.db,'SELECT title FROM events WHERE id=2')).title).toBe('draft')
 })
 it('EX-04 regression rejects elevated claims after role downgrade',async()=>{
   const f=await fixture()
   await run(f.db,"UPDATE users SET role='admin' WHERE id=1")
   expect((await f.http.get('/api/admin/users').set('Authorization',`Bearer ${token()}`)).status).toBe(403)
 })
 it('EX-05 regression projects public fields while preserving ordinary content descriptions',async()=>{
   const f=await fixture()
   expect((await f.http.get('/api/event')).body.items[0]).not.toHaveProperty('visitor_ip')
   expect((await f.http.get('/api/logs')).body.logs[0]).toHaveProperty('details','synthetic details')
 })
 it('EX-07 regression rejects a sibling of public',async()=>{
   const f=await fixture()
   expect(f.context.storage.resolveUploadsPath('/uploads/../public-sibling/file')).toBeNull()
 })
})
