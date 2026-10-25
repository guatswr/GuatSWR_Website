import { spawn } from 'node:child_process'
import { once } from 'node:events'
import net from 'node:net'
import path from 'node:path'
import fs from 'node:fs/promises'
import { onTestFinished } from 'vitest'
export async function startNuxt(f){
 const entry=path.join(path.resolve(process.env.BACKEND_BFF_OUTPUT||'../web/.output'),'server/index.mjs')
 await fs.access(entry)
 const reserve=net.createServer();reserve.listen(0,'127.0.0.1');await once(reserve,'listening')
 const port=reserve.address().port;await new Promise(resolve=>reserve.close(resolve));const origin=`http://127.0.0.1:${port}`
 const child=spawn(process.execPath,[entry],{cwd:path.dirname(entry),env:{...process.env,NODE_ENV:'test',HOST:'127.0.0.1',NITRO_HOST:'127.0.0.1',PORT:String(port),NITRO_PORT:String(port),
  NUXT_API_BASE:f.origin,NUXT_BFF_BRIDGE_SECRET:f.context.env.BFF_BRIDGE_SECRET,NUXT_SESSION_PASSWORD:'isolated-article-revision-session-key-longer-than-32-characters',NUXT_BFF_AUTH_ALLOWED_ORIGINS:JSON.stringify([origin]),NUXT_BFF_AUTH_TRUSTED_PROXY_CIDRS:'[]',NUXT_BFF_AUTH_ALLOW_INSECURE_LOOPBACK_COOKIES:'true'},stdio:['ignore','pipe','pipe']})
 let logs='';child.stdout.on('data',data=>logs+=data);child.stderr.on('data',data=>logs+=data)
 const exited=once(child,'exit');onTestFinished(async()=>{if(child.exitCode===null){child.kill();await exited}})
 const deadline=Date.now()+15000
 for(;;){try{const r=await fetch(origin+'/api/bff/auth/session',{signal:AbortSignal.timeout(1000)});await r.arrayBuffer();break}catch{if(child.exitCode!==null||Date.now()>deadline)throw new Error('Nuxt startup failed: '+logs);await new Promise(resolve=>setTimeout(resolve,100))}}
 const cookies=new Map()
 const call=async(url,options={})=>{
  const response=await fetch(origin+url,{...options,headers:{connection:'close',...options.headers,cookie:[...cookies].map(([key,value])=>`${key}=${value}`).join('; ')}})
  for(const cookie of response.headers.getSetCookie()){const pair=cookie.split(';')[0],at=pair.indexOf('=');cookies.set(pair.slice(0,at),pair.slice(at+1))}
  return {response,data:await response.json()}
 }
 const login=async()=>{
  const csrf=await call('/api/bff/auth/csrf')
  const result=await call('/api/bff/auth/login',{method:'POST',headers:{origin,'content-type':'application/json','x-csrf-token':csrf.data.csrfToken},body:JSON.stringify({username:'owner',password:'fixture-password'})})
  if(result.response.status!==200)throw new Error('Fixture login failed')
  return {origin,'content-type':'application/json','x-csrf-token':result.data.csrfToken}
 }
 return {origin,call,login}
}
