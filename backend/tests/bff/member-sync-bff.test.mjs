import { it,expect,onTestFinished } from 'vitest'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import net from 'node:net'
import path from 'node:path'
import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import { fixture,token } from '../helpers/fixture.mjs'
const require=createRequire(import.meta.url)
const {botScopes}=require('@guatswr/shared/bot')
it('integrates member-sync BFF writes and refreshes warmed public members after Bot callbacks',async()=>{
  const f=await fixture({env:{BOT_PLATFORM_ENABLED:'true'}})
  const admin={Authorization:`Bearer ${token()}`}
  const credential=(await f.http.post('/api/bot/admin/credentials').set(admin).send({name:'bff-sync',scopes:[...botScopes],groups:['123456']})).body
  const code=(await f.http.post('/api/bot/link-codes').set(admin).send({})).body.code
  expect((await f.http.post('/api/bot/v1/identity/bind').set({Authorization:`Bearer ${credential.token}`}).send({qq:'99999',code})).status).toBe(200)
  const output=path.resolve(process.env.BACKEND_BFF_OUTPUT || '../web/.output'),entry=path.join(output,'server/index.mjs')
  await fs.access(entry)
  const reserve=net.createServer();reserve.listen(0,'127.0.0.1');await once(reserve,'listening')
  const port=reserve.address().port;await new Promise(resolve=>reserve.close(resolve));const origin=`http://127.0.0.1:${port}`
  let logs=''
  const child=spawn(process.execPath,[entry],{cwd:path.dirname(entry),env:{...process.env,NODE_ENV:'test',HOST:'127.0.0.1',NITRO_HOST:'127.0.0.1',PORT:String(port),NITRO_PORT:String(port),
    NUXT_API_BASE:f.origin,NUXT_BFF_BRIDGE_SECRET:f.context.env.BFF_BRIDGE_SECRET,NUXT_SESSION_PASSWORD:'isolated-member-sync-session-secret-at-least-32-characters',
    NUXT_BFF_AUTH_ALLOWED_ORIGINS:JSON.stringify([origin]),NUXT_BFF_AUTH_TRUSTED_PROXY_CIDRS:'[]',NUXT_BFF_AUTH_ALLOW_INSECURE_LOOPBACK_COOKIES:'true'},stdio:['ignore','pipe','pipe']})
  child.stdout.on('data',data=>logs+=data);child.stderr.on('data',data=>logs+=data)
  const exited=once(child,'exit');onTestFinished(async()=>{if(child.exitCode===null){child.kill();await exited}})
  const deadline=Date.now()+15000
  for(;;){try{const response=await fetch(origin+'/api/bff/auth/session',{signal:AbortSignal.timeout(1000)});await response.arrayBuffer();break}catch{if(child.exitCode!==null||Date.now()>deadline)throw new Error(`BFF startup failed: ${logs}`);await new Promise(resolve=>setTimeout(resolve,100))}}
  const cookies=new Map()
  const call=async(url,options={})=>{
    const response=await fetch(origin+url,{...options,headers:{connection:'close',...options.headers,cookie:[...cookies].map(([key,value])=>`${key}=${value}`).join('; ')}})
    for(const cookie of response.headers.getSetCookie()){const pair=cookie.split(';')[0],split=pair.indexOf('=');cookies.set(pair.slice(0,split),pair.slice(split+1))}
    return {response,data:await response.json()}
  }
  const csrf=await call('/api/bff/auth/csrf')
  const login=await call('/api/bff/auth/login',{method:'POST',headers:{origin,'content-type':'application/json','x-csrf-token':csrf.data.csrfToken},body:JSON.stringify({username:'owner',password:'fixture-password'})})
  expect(login.response.status).toBe(200)
  const headers={origin,'content-type':'application/json','x-csrf-token':login.data.csrfToken}
  const settings={enabled:false,credential_id:credential.id,groups:['123456'],interval_minutes:360,admin_user_ids:[1]}
  expect((await call('/api/bff/admin/member-sync/settings',{method:'PUT',headers,body:JSON.stringify(settings)})).response.status).toBe(200)
  expect((await call('/api/bff/admin/member-sync/profile?id=1',{method:'PUT',headers,body:JSON.stringify({qq:'11111',follow_group_name:false,follow_group_avatar:false,sync_protected:false,complete:true})})).response.status).toBe(200)
  const before=await call('/api/content/members');expect(before.data.members).toHaveLength(1)
  const request=await call('/api/bff/admin/member-sync/requests',{method:'POST',headers,body:JSON.stringify({group_id:'123456'})})
  expect(request.response.status,JSON.stringify(request.data)).toBe(200)
  const id=request.data.id,auth={Authorization:`Bearer ${credential.token}`}
  expect((await f.http.put(`/api/bot/v1/member-sync/requests/${id}/batches/1`).set(auth).send({members:[{qq:'11111'},{qq:'22222',group_card:'Bot 同步的新成员'}]})).status).toBe(200)
  expect((await f.http.post(`/api/bot/v1/member-sync/requests/${id}/complete`).set(auth).send({complete:true,batch_count:1,member_count:2})).body.status).toBe('preview')
  expect((await call(`/api/bff/admin/member-sync/job?id=${id}`)).data.status).toBe('preview')
  expect((await call(`/api/bff/admin/member-sync/apply?id=${id}`,{method:'POST',headers,body:JSON.stringify({reason:'reviewed'})})).response.status).toBe(200)
  const after=await call('/api/content/members')
  expect(after.data.members).toHaveLength(2);expect(after.data.revision).toBeGreaterThan(before.data.revision)
  expect(JSON.stringify(after.data)).not.toContain('22222')
  const list=await call('/api/bff/admin/members')
  expect(list.data.find(member=>member.qq==='22222').profile_status).toBe('pending')
  // No BFF mutation hook runs for an established group's next Bot snapshot.
  const next=(await f.http.post('/api/bot/admin/member-sync/requests').set(admin).send({group_id:'123456'})).body.id
  await f.http.put(`/api/bot/v1/member-sync/requests/${next}/batches/1`).set(auth).send({members:[{qq:'11111'},{qq:'22222',group_card:'Bot 同步的新成员'},{qq:'33333',group_card:'自动更新成员'}]})
  expect((await f.http.post(`/api/bot/v1/member-sync/requests/${next}/complete`).set(auth).send({complete:true,batch_count:1,member_count:3})).body.status).toBe('succeeded')
  await expect.poll(async()=> (await call('/api/content/members')).data.members.length,{timeout:8000,interval:500}).toBe(3)
  expect((await call('/api/bff/admin/member-sync/requests',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({group_id:'123456'})})).response.status).toBe(403)
  expect(JSON.stringify([request.data,list.data,after.data])).not.toMatch(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\./)
})
