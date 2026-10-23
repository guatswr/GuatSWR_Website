import { it, expect } from 'vitest'
import { fixture, get, token } from '../helpers/fixture.mjs'
const draft = async (f, forwarded) => {
 const req=f.http.post('/api/event/draft').set('Authorization',`Bearer ${token()}`).send({})
 if(forwarded)req.set('X-Forwarded-For',forwarded)
 const response=await req
 expect(response.status).toBe(200)
 return (await get(f.db,'SELECT visitor_ip FROM events WHERE id=?',[response.body.id])).visitor_ip
}
it('N01 untrusted direct clients cannot choose their identity using forwarding headers',async()=>{
 const f=await fixture()
 expect(await draft(f,'203.0.113.200')).toBe('127.0.0.1')
})
it('N01 explicit CIDRs accept a single BFF hop and stop at the nearest untrusted hop',async()=>{
 const f=await fixture({env:{TRUST_PROXY_CIDRS:'127.0.0.1/32,::1/128'}})
 expect(await draft(f,'203.0.113.200')).toBe('203.0.113.200')
 expect(await draft(f,'203.0.113.200, 198.51.100.9')).toBe('198.51.100.9')
 expect(await draft(f,'2001:db8::123')).toBe('2001:db8::123')
 expect(await draft(f,undefined)).toBe('127.0.0.1')
})

it('N01 rejects blanket, boolean, hop-count and malformed proxy trust configuration',async()=>{
 const {createRequire}=await import('node:module')
 const require=createRequire(import.meta.url)
 const {createTrustProxy}=require('../../src/config/proxy')
 for(const value of ['true','1','*','0.0.0.0/0','::/0','127.0.0.1/33','::1/129','127.0.0.1/32,']) expect(()=>createTrustProxy(value)).toThrow()
 expect(createTrustProxy('')).toBe(false)
 const trusted=createTrustProxy('127.0.0.1/32,::1/128')
 expect(trusted('::ffff:127.0.0.1')).toBe(true)
 expect(trusted('203.0.113.200')).toBe(false)
})
