import { it, expect } from 'vitest'
import { fixture, token, get, png, draftProofHeaders } from '../helpers/fixture.mjs'
const key='isolated-guest-gateway-test-secret-at-least-32'
const headers=(ip='203.0.113.99')=>({'x-bff-bridge':key,'x-forwarded-for':ip})
it('E01 direct anonymous writes and private signup reads cannot bypass BFF',async()=>{
 const f=await fixture({env:{BFF_BRIDGE_SECRET:key}})
 expect((await f.http.post('/api/event/draft').send({})).status).toBe(403)
 expect((await f.http.put('/api/event/2').send({title:'foreign'})).status).toBe(403)
 for(const method of ['get','post','delete'])expect((await f.http[method]('/api/event/1/signup').send({})).status).toBe(403)
 expect((await f.http.post('/api/upload/visitor').field('eid','2').attach('file',png,'fixture.png')).status).toBe(403)
 expect((await f.http.post('/api/upload/visitor/avatar').field('eid','1').attach('file',png,'fixture.png')).status).toBe(403)
 expect((await get(f.db,'SELECT title FROM events WHERE id=2')).title).toBe('draft')
 expect(await f.fs.readdir(f.context.PRIVATE_UPLOADS_DIR)).toEqual([])
 expect((await f.http.get('/api/event/1')).status).toBe(200)
 expect((await f.http.get('/api/event/1/participants/public')).status).toBe(200)
})
it('E01 missing gateway configuration fails closed and never echoes credentials',async()=>{
 const f=await fixture({env:{BFF_BRIDGE_SECRET:''}})
 const response=await f.http.post('/api/event/draft').set(headers()).send({})
 expect(response.status).toBe(503)
 expect(JSON.stringify(response.body)).not.toContain(key)
})
it('E01 forged keys and malformed forwarded identities are rejected',async()=>{
 const f=await fixture({env:{BFF_BRIDGE_SECRET:key,TRUST_PROXY_CIDRS:'127.0.0.1/32'}})
 expect((await f.http.post('/api/event/draft').set({...headers(),'x-bff-bridge':'forged'}).send({})).status).toBe(403)
 expect((await f.http.post('/api/event/draft').set(headers('203.0.113.1, 198.51.100.1')).send({})).status).toBe(400)
})
it('E01 authenticated BFF keeps the reconstructed visitor IP and signup identity',async()=>{
 const f=await fixture({env:{BFF_BRIDGE_SECRET:key,TRUST_PROXY_CIDRS:'127.0.0.1/32'}})
 const draft=await f.http.post('/api/event/draft').set(draftProofHeaders('draft', 0, '203.0.113.99', key)).send({})
 expect(draft.status).toBe(200)
 expect((await get(f.db,'SELECT visitor_ip FROM events WHERE id=?',[draft.body.id])).visitor_ip).toBe('203.0.113.99')
 expect((await f.http.post('/api/event/1/signup').set(headers()).send({common_id:'gateway visitor',qq:'12345',avatar:'/uploads/avatar.png'})).status).toBe(200)
 const signup=await f.http.get('/api/event/1/signup').set(headers())
 expect(signup.body.data.common_id).toBe('gateway visitor')
 expect(signup.headers['cache-control']).toContain('no-store')
 expect((await f.http.delete('/api/event/1/signup').set(headers())).status).toBe(200)
})
it('N01 a gateway key cannot mask an unconfigured proxy topology',async()=>{
 const f=await fixture({env:{BFF_BRIDGE_SECRET:key}})
 expect((await f.http.post('/api/event/draft').set(headers()).send({})).status).toBe(503)
})
it('E01 current administrators retain their authenticated direct routes',async()=>{
 const f=await fixture({env:{BFF_BRIDGE_SECRET:''}})
 expect((await f.http.post('/api/event/draft').set('Authorization',`Bearer ${token()}`).send({})).status).toBe(200)
 expect((await f.http.post('/api/upload/visitor').set('Authorization',`Bearer ${token()}`).field('eid','2').attach('file',png,{filename:'fixture.png',contentType:'image/png'})).status).toBe(200)
})
