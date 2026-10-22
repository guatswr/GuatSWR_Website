import { it, expect, onTestFinished } from 'vitest'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import net from 'node:net'
import path from 'node:path'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { fixture, get } from '../helpers/fixture.mjs'

it('I01 scaffold: real Nuxt BFF logs into Express, writes and reads an activity without exposing JWT', async () => {
 const f=await fixture()
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
   NUXT_API_BASE:f.origin,NUXT_SESSION_PASSWORD:'isolated-bff-session-key-at-least-32-characters',
   NUXT_BFF_AUTH_ALLOWED_ORIGINS:JSON.stringify([origin]),NUXT_BFF_AUTH_TRUSTED_PROXY_CIDRS:'[]',
   NUXT_BFF_AUTH_ALLOW_INSECURE_LOOPBACK_COOKIES:'true'
 },stdio:['ignore','pipe','pipe']})
 child.stdout.on('data',data=>{logs+=data});child.stderr.on('data',data=>{logs+=data})
 const exited=once(child,'exit')
 onTestFinished(async()=>{ if(child.exitCode===null){child.kill();await exited} })
 const cookies=new Map()
 const call=async(url,options={})=>{
   const response=await fetch(origin+url,{...options,headers:{...options.headers,cookie:[...cookies].map(([k,v])=>`${k}=${v}`).join('; ')}})
   for(const cookie of response.headers.getSetCookie()){
     const [pair]=cookie.split(';'); const split=pair.indexOf('=');cookies.set(pair.slice(0,split),pair.slice(split+1))
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
})
