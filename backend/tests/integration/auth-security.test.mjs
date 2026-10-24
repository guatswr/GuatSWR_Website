import { it, expect } from 'vitest'
import { fixture, token, run, get } from '../helpers/fixture.mjs'
it('A03 revoked users and downgraded roles cannot reuse elevated JWT claims',async()=>{
 const f=await fixture()
 await run(f.db,"UPDATE users SET role='admin' WHERE id=1")
 expect((await f.http.get('/api/admin/users').set('Authorization',`Bearer ${token()}`)).status).toBe(403)
 await run(f.db,'DELETE FROM users WHERE id=4')
 expect((await f.http.get('/api/auth/me').set('Authorization',`Bearer ${token(4,'admin')}`)).status).toBe(401)
})
it('A03 version database failure fails closed instead of assuming version zero',async()=>{
 const f=await fixture()
 await run(f.db,'DROP TABLE site_config')
 const response=await f.http.get('/api/auth/me').set('Authorization',`Bearer ${token()}`)
 expect(response.status).toBe(503)
 expect(JSON.stringify(response.body)).not.toContain('SQLITE')
 expect((await f.http.get('/api/config').set('Authorization',`Bearer ${token()}`)).status).toBe(503)
})
it('A04 concurrent cross-deletion cannot remove every super administrator',async()=>{
 const f=await fixture()
 const responses=await Promise.all([
   f.http.delete('/api/admin/users/3').set('Authorization',`Bearer ${token(1,'super_admin')}`),
   f.http.delete('/api/admin/users/1').set('Authorization',`Bearer ${token(3,'super_admin')}`)
 ])
 expect(responses.filter(r=>r.status===200)).toHaveLength(1)
 expect((await get(f.db,"SELECT count(*) AS n FROM users WHERE role='super_admin'")).n).toBe(1)
})
it('A03 concurrent global revocation increments once for every successful response',async()=>{
 const f=await fixture()
 const responses=await Promise.all(Array.from({length:8},()=>f.http.post('/api/admin/token-version/refresh').set('Authorization',`Bearer ${token()}`).send({})))
 const versions=responses.filter(r=>r.status===200).map(r=>r.body.version)
 expect(versions.length).toBeGreaterThan(0)
 expect(new Set(versions).size).toBe(versions.length)
 expect(Number((await get(f.db,"SELECT value FROM site_config WHERE key='token_version'")).value)).toBe(versions.length)
})
it('A02 incorrect second passwords count toward the same five-attempt lock',async()=>{
 const f=await fixture()
 expect((await f.http.put('/api/auth/profile').set('Authorization',`Bearer ${token(2,'admin')}`).send({twofa_enabled:true,twofa_password:'correct-second',avatar:'/uploads/avatar.png'})).status).toBe(200)
 for(let n=1;n<=5;n++){
  const response=await f.http.post('/api/auth/login').send({username:'admin',password:'fixture-password',twofa:'wrong-second'})
  expect(response.status).toBe(n===5?429:401)
 }
})

it('A02 fixed legacy CBC remains readable and malformed ciphertext fails safely',async()=>{
 const f=await fixture()
 // Frozen CBC bytes produced before the TypeScript extraction, using the fixture key.
 await run(f.db,"UPDATE users SET twofa_enabled=1,twofa_secret=? WHERE id=2",['BwcHBwcHBwcHBwcHBwcHBw==:tHx0e38DbY3/JeeueK45eyfKCqmMl+vDt2fwZ6xqfuk='])
 expect((await f.http.post('/api/auth/login').send({username:'admin',password:'fixture-password',twofa:'legacy-second-password'})).status).toBe(200)
 await run(f.db,"UPDATE users SET twofa_enabled=1,twofa_secret='bad:bad' WHERE id=2")
 const response=await f.http.post('/api/auth/login').send({username:'admin',password:'fixture-password',twofa:'second-password'})
 expect(response.status).toBe(503)
 expect(response.body).toEqual({message:'登录暂时不可用'})
 expect((await f.http.get('/api/version')).status).toBe(200)
})
it('A03 absent legacy version stays zero while malformed stored versions fail closed',async()=>{
 const f=await fixture()
 const {createRequire}=await import('node:module')
 const require=createRequire(import.meta.url)
 const legacy=require('jsonwebtoken').sign({id:2,username:'admin',role:'admin'},f.context.env.JWT_SECRET)
 expect((await f.http.get('/api/auth/me').set('Authorization',`Bearer ${legacy}`)).status).toBe(200)
 await run(f.db,"INSERT INTO site_config VALUES('token_version','invalid')")
 expect((await f.http.get('/api/auth/me').set('Authorization',`Bearer ${legacy}`)).status).toBe(503)
 expect((await f.http.post('/api/auth/login').send({username:'admin',password:'fixture-password'})).status).toBe(503)
})
it('A04 missing administrator targets return 404 and cannot alter existing users',async()=>{
 const f=await fixture()
 expect((await f.http.delete('/api/admin/users/999').set('Authorization',`Bearer ${token()}`)).status).toBe(404)
 expect((await get(f.db,'SELECT count(*) AS n FROM users')).n).toBe(4)
})
it('D04 early security statements remain atomic across two real SQLite connections',async()=>{
 const f=await fixture()
 const {createRequire}=await import('node:module')
 const require=createRequire(import.meta.url)
 const sqlite=require('sqlite3')
 const db2=await new Promise((resolve,reject)=>{const db=new sqlite.Database(f.context.dbPath,error=>error?reject(error):resolve(db))})
 try{
  await run(db2,'PRAGMA busy_timeout=5000')
  const other=require('../../src/models/security')({db:db2})
  const versions=await Promise.all(Array.from({length:12},(_,n)=>(n%2?other:f.context.security).incrementVersion()))
  expect([...versions].sort((a,b)=>a-b)).toEqual(Array.from({length:12},(_,n)=>n+1))
  const deleted=await Promise.all([f.context.security.deleteAdmin(3,1),other.deleteAdmin(1,3)])
  expect(deleted.filter(Boolean)).toHaveLength(1)
  expect((await get(f.db,"SELECT count(*) AS n FROM users WHERE role='super_admin'")).n).toBe(1)
 }finally{await new Promise((resolve,reject)=>db2.close(error=>error?reject(error):resolve()))}
})
it('A02 concurrent credential failures count atomically and cap at five',async()=>{
 const f=await fixture()
 const attempts=await Promise.all(Array.from({length:8},()=>f.context.security.recordFailure('203.0.113.10',Date.now())))
 expect(Math.max(...attempts.map(row=>row.count))).toBe(5)
 const stored=await get(f.db,"SELECT count,lock_until FROM login_attempts WHERE ip='203.0.113.10'")
 expect(stored.count).toBe(5)
 expect(stored.lock_until).toBeGreaterThan(Date.now())
})

it('A04 legacy NULL roles do not make a non-super user undeletable',async()=>{
 const f=await fixture()
 await run(f.db,'UPDATE users SET role=NULL WHERE id=4')
 expect((await f.http.delete('/api/admin/users/4').set('Authorization',`Bearer ${token()}`)).status).toBe(200)
 expect(await get(f.db,'SELECT id FROM users WHERE id=4')).toBeUndefined()
})
