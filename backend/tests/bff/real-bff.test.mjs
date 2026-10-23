import { it, expect, onTestFinished } from 'vitest'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import net from 'node:net'
import path from 'node:path'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { fixture, get, png } from '../helpers/fixture.mjs'

it('I01 scaffold: real Nuxt BFF logs into Express, writes and reads an activity without exposing JWT', async () => {
 const f=await fixture({env:{TRUST_PROXY_CIDRS:"127.0.0.1/32",GUEST_DRAFT_PROOF_MODE:process.env.BACKEND_BFF_PROOF_MODE === 'optional' ? 'optional' : 'required'}})
 const root=fileURLToPath(new URL('../../../',import.meta.url))
 const output=path.resolve(process.env.BACKEND_BFF_OUTPUT || path.join(root,'web/.output'))
 const entry=path.join(output,'server/index.mjs')
 await fs.access(entry) // Missing output must fail; never silently skip integration.
 const reserve=net.createServer()
 reserve.listen(0,'127.0.0.1'); await once(reserve,'listening')
 const port=reserve.address().port
 await new Promise(resolve=>reserve.close(resolve))
 const origin=`http://127.0.0.1:${port}`
 let logs=''
 const child=spawn(process.execPath,[entry],{cwd:path.dirname(entry),env:{...process.env,
   NODE_ENV:'test',NITRO_HOST:'127.0.0.1',HOST:'127.0.0.1',PORT:String(port),NITRO_PORT:String(port),
   NUXT_API_BASE:f.origin,NUXT_BFF_BRIDGE_SECRET:f.context.env.BFF_BRIDGE_SECRET,NUXT_SESSION_PASSWORD:'isolated-bff-session-key-at-least-32-characters',
   NUXT_BFF_AUTH_ALLOWED_ORIGINS:JSON.stringify([origin]),NUXT_BFF_AUTH_TRUSTED_PROXY_CIDRS:'[]',
   NUXT_BFF_AUTH_ALLOW_INSECURE_LOOPBACK_COOKIES:'true'
 },stdio:['ignore','pipe','pipe']})
 child.stdout.on('data',data=>{logs+=data});child.stderr.on('data',data=>{logs+=data})
 const exited=once(child,'exit')
 onTestFinished(async()=>{ if(child.exitCode===null){child.kill();await exited} })
 const cookies=new Map()
 const call=async(url,options={},jar=cookies)=>{
   const response=await fetch(origin+url,{...options,headers:{...options.headers,cookie:[...jar].map(([k,v])=>`${k}=${v}`).join('; ')}})
   for(const cookie of response.headers.getSetCookie()){
     const [pair]=cookie.split(';'); const split=pair.indexOf('=');jar.set(pair.slice(0,split),pair.slice(split+1))
   }
   const data=await response.json()
   return {response,data}
 }
 const deadline=Date.now()+15000
 while(true){
   try { await fetch(origin+'/api/bff/auth/session');break } catch(error){
     if(child.exitCode!==null||Date.now()>deadline)throw new Error(`Nuxt did not become ready: ${logs}`)
     await new Promise(resolve=>setTimeout(resolve,100))
   }
 }
 const csrf=await call('/api/bff/auth/csrf')
 expect(csrf.response.status).toBe(200)
 const login=await call('/api/bff/auth/login',{method:'POST',headers:{origin,'content-type':'application/json','x-csrf-token':csrf.data.csrfToken},body:JSON.stringify({username:'admin',password:'fixture-password'})})
 expect(login.response.status,JSON.stringify(login.data)).toBe(200)
 expect(login.data.user.username).toBe('admin')
 expect(JSON.stringify(login.data)).not.toMatch(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\./)
 const session=await call('/api/bff/auth/session')
 expect(session.data.authenticated).toBe(true)
 const created=await call('/api/bff/admin/activities',{method:'POST',headers:{origin,'content-type':'application/json','x-csrf-token':login.data.csrfToken},body:JSON.stringify({title:'real BFF integration',tag:'STG',date:'2026-01-03',content:'body',images:[]})})
 expect(created.response.status,JSON.stringify(created.data)).toBe(200)
 expect((await get(f.db,"SELECT title FROM activities WHERE title='real BFF integration'")).title).toBe('real BFF integration')
 const list=await call('/api/bff/admin/activities')
 expect(list.response.status,JSON.stringify(list.data)).toBe(200)
 expect(JSON.stringify(list.data)).toContain('real BFF integration')

 // Warm both real public caches before the BFF write, then prove invalidation.
 expect((await call('/api/config')).data.banner_text).toBe('fixture')
 const beforeLogs = await call('/api/logs?action=UPDATE_CONFIG')
 expect(beforeLogs.response.status).toBe(200)
 expect(JSON.stringify(beforeLogs.data)).not.toContain('修改配置: banner_text')
 const configWrite = await call('/api/bff/admin/config', { method: 'PUT', headers: { origin, 'content-type': 'application/json', 'x-csrf-token': login.data.csrfToken }, body: JSON.stringify({ key: 'banner_text', value: 'BFF cache invalidation' }) })
 expect(configWrite.response.status, JSON.stringify(configWrite.data)).toBe(200)
 expect(configWrite.data).toEqual({ message: '已保存' })
 await expect.poll(() => get(f.logDb, "SELECT count(*) AS n FROM audit_logs WHERE action='UPDATE_CONFIG'")).toEqual({ n: 1 })
 expect((await call('/api/config')).data.banner_text).toBe('BFF cache invalidation')
 const afterLogs = await call('/api/logs?action=UPDATE_CONFIG')
 expect(afterLogs.response.status).toBe(200)
 expect(JSON.stringify(afterLogs.data)).toContain('修改配置: banner_text')

 const historyCreated = await call('/api/bff/admin/history', { method: 'POST', headers: { origin, 'content-type': 'application/json', 'x-csrf-token': login.data.csrfToken }, body: JSON.stringify({ date: '2026-10-23', title: 'BFF history ID regression' }) })
 expect(historyCreated.response.status, JSON.stringify(historyCreated.data)).toBe(200)
 expect(historyCreated.data.id).toEqual(expect.any(Number))
 expect(await get(f.db, 'SELECT id FROM history WHERE title=?', ['BFF history ID regression'])).toEqual({ id: historyCreated.data.id })

 expect((await call('/api/members')).data).toHaveLength(1)
 const memberCreated = await call('/api/bff/admin/members', { method: 'POST', headers: { origin, 'content-type': 'application/json', 'x-csrf-token': login.data.csrfToken }, body: JSON.stringify({ name: 'BFF member cache regression', role: 'member', tags: ['tag', 'tag'] }) })
 expect(memberCreated.response.status, JSON.stringify(memberCreated.data)).toBe(200)
 expect(memberCreated.data.id).toEqual(expect.any(Number))
 const members = await call('/api/members')
 expect(members.response.status).toBe(200)
 expect(members.data.find(row => row.id === memberCreated.data.id)).toMatchObject({ name: 'BFF member cache regression', tags: ['tag'] })

 // Two anonymous visitors share one loopback/NAT address but have distinct intent cookies.
 const visitor=async()=>{
   const jar=new Map()
   const csrf=await call('/api/bff/auth/csrf',{},jar)
   const draft=await call('/api/bff/guest/events/draft',{method:'POST',headers:{origin,'content-type':'application/json','x-csrf-token':csrf.data.csrfToken,'x-bff-bridge':'browser-forged','x-bff-draft-proof':'browser-forged','x-forwarded-for':'203.0.113.222'},body:'{}'},jar)
   expect(draft.response.status,JSON.stringify(draft.data)).toBe(200)
   return {jar,csrf:csrf.data.csrfToken,id:draft.data.id,data:draft.data}
 }
 const a=await visitor(),b=await visitor()
 expect(a.id).not.toBe(b.id)
 expect((await get(f.db,'SELECT visitor_ip FROM events WHERE id=?',[a.id])).visitor_ip).toBe('127.0.0.1')
 const uploadBody = new FormData()
 uploadBody.append('eid', String(a.id))
 uploadBody.append('file', new Blob([png], { type: 'image/png' }), 'guest-proof.png')
 const uploaded = await call('/api/bff/guest/upload/content', { method: 'POST', headers: { origin, 'x-csrf-token': a.csrf, 'x-bff-draft-proof': 'browser-forged' }, body: uploadBody }, a.jar)
 expect(uploaded.response.status, JSON.stringify(uploaded.data)).toBe(200)
 expect(uploaded.data.url).toContain(`/uploads/img/events/${a.id}/`)
 expect(JSON.stringify(uploaded.data)).not.toMatch(/v1\.\d+\.(draft|save|upload)\./)
 const body=JSON.stringify({type:'STG',title:'guest bridge integration',content:{copy:'fixture',rules:'fixture rules'},submit:true})
 const submit=(visitor,id)=>call(`/api/bff/guest/events/${id}`,{method:'PUT',headers:{origin,'content-type':'application/json','x-csrf-token':visitor.csrf},body},visitor.jar)
 expect((await submit(b,a.id)).response.status).toBe(404)
 expect((await get(f.db,'SELECT title FROM events WHERE id=?',[a.id])).title).toBeNull()
 const saved=await submit(a,a.id)
 expect(saved.response.status,JSON.stringify(saved.data)).toBe(200)
 expect((await get(f.db,'SELECT status FROM events WHERE id=?',[a.id])).status).toBe('pending')
 expect((await submit(a,a.id)).response.status).toBe(200)
 expect((await get(f.logDb,"SELECT count(*) AS n FROM audit_logs WHERE action='SUBMIT_EVENT'")).n).toBe(1)
 expect(JSON.stringify([a.data,b.data,saved.data])).not.toContain(f.context.env.BFF_BRIDGE_SECRET)
 const home=await fetch(origin+'/')
 expect(home.status).toBe(200)
 expect(await home.text()).not.toContain(f.context.env.BFF_BRIDGE_SECRET)
})
