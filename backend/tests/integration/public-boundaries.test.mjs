import { it, expect } from 'vitest'
import { fixture, token, run, get } from '../helpers/fixture.mjs'
it('A05 generic config cannot write internal security or backup keys',async()=>{
 const f=await fixture()
 for(const auth of [token(2,'admin'),token()])for(const key of ['token_version','backup_enabled','backup_last_error']){
   expect((await f.http.post('/api/config').set('Authorization',`Bearer ${auth}`).send({key,value:'999'})).status).toBe(403)
   expect(await get(f.db,'SELECT value FROM site_config WHERE key=?',[key])).toBeUndefined()
 }
 expect((await f.http.post('/api/config').set('Authorization',`Bearer ${token(2,'admin')}`).send({key:'future_private_key',value:'secret'})).status).toBe(403)
 expect((await f.http.get('/api/config').set('Authorization',`Bearer ${token(2,'admin')}`)).body).not.toHaveProperty('internal_test_key')
})
it('A08 public audit descriptions cannot expose source IPs, credentials or internal config names',async()=>{
 const f=await fixture()
 for(const [action,details] of [['LOGIN','登录成功 IP 203.0.113.99'],['UPDATE_CONFIG','修改配置: backup_last_error'],['CUSTOM','password=sample-secret token=sample-token 2001:db8::1 203.0.113.99'],['CUSTOM','x'.repeat(5000)]])await run(f.logDb,'INSERT INTO audit_logs(username,action,details) VALUES (?,?,?)',['admin',action,details])
 const response=await f.http.get('/api/logs')
 expect(response.status).toBe(200)
 const body=JSON.stringify(response.body)
 for(const value of ['203.0.113.99','2001:db8::1','sample-secret','sample-token','backup_last_error'])expect(body).not.toContain(value)
 expect(body).toContain('日志详情过长，已省略')
 expect(response.body.logs[0]).not.toHaveProperty('user_id')
 const admin=await f.http.get('/api/admin/logs').set('Authorization',`Bearer ${token()}`)
 expect(JSON.stringify(admin.body)).toContain('203.0.113.99')
})
it('A05 public event projection removes private fields while privileged detail preserves editable extensions',async()=>{
 const f=await fixture()
 const content={copy:'public',future:{enabled:true},visitor_ip:'203.0.113.99',person:{id:'player',qq:'12345',token:'private-token'}}
 await run(f.db,'UPDATE events SET content=? WHERE id=1',[JSON.stringify(content)])
 const response=await f.http.get('/api/event/1')
 expect(response.body).not.toHaveProperty('visitor_ip')
 expect(response.body.content).not.toHaveProperty('visitor_ip')
 expect(response.body.content.person).toEqual({id:'player',qq:'12345'})
 expect(response.body.content.future).toEqual({enabled:true})
 const admin=await f.http.get('/api/event/1').set('Authorization',`Bearer ${token()}`)
 expect(admin.body.content).toEqual(content)
 expect(admin.headers['cache-control']).toContain('no-store')
 expect(admin.headers.vary).toContain('Authorization')
})
it('A08 SQL details never leave public failures and list limits remain bounded',async()=>{
 const f=await fixture()
 const many=await f.http.get('/api/logs?limit=-1&page=-5')
 expect(many.body.logs.length).toBeLessThanOrEqual(100)
 await run(f.logDb,'DROP TABLE audit_logs')
 const failure=await f.http.get('/api/logs')
 expect(failure.status).toBe(500)
 expect(JSON.stringify(failure.body)).not.toMatch(/SQLITE|audit_logs|no such table/)
})

it('A08 unusual action names and long tokens are redacted without inherited lookups',async()=>{
 const f=await fixture()
 for(const action of ['constructor','__proto__','toString'])await run(f.logDb,'INSERT INTO audit_logs(username,action,details) VALUES (?,?,?)',['admin',action,'Bearer=sample-secret '+ 'a'.repeat(1000)])
 const response=await f.http.get('/api/logs')
 expect(response.status).toBe(200)
 expect(JSON.stringify(response.body)).not.toContain('sample-secret')
 expect(JSON.stringify(response.body)).not.toContain('a'.repeat(1000))
})
it('A05 public participant contact fields remain compatible while own signup omits source IP',async()=>{
 const f=await fixture()
 const participants=await f.http.get('/api/event/1/participants/public')
 expect(participants.body.items[0]).toHaveProperty('qq','12345')
 expect(participants.body.items[0]).not.toHaveProperty('visitor_ip')
 const signup=await f.http.get('/api/event/1/signup').set('Authorization',`Bearer ${token(2,'admin')}`)
 expect(signup.body.data.common_id).toBe('pilot')
 expect(signup.body.data).not.toHaveProperty('visitor_ip')
})
