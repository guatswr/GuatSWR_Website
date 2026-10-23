import path from 'node:path'
import fs from 'node:fs/promises'
import http from 'node:http'
import { createRequire } from 'node:module'
import { expect,it,onTestFinished,vi } from 'vitest'
import { fixture,token } from '../helpers/fixture.mjs'
const require=createRequire(import.meta.url)
it('100MiB backup HEAD is bodyless and cancelling download closes its file stream',async()=>{
 const f=await fixture(),filename=path.join(f.root,'backups','full','large-fixture.tar.gz')
 const handle=await fs.open(filename,'w');await handle.truncate(100*1024*1024);await handle.close()
 const route='/api/admin/backups/download?file=large-fixture.tar.gz',auth={Authorization:`Bearer ${token()}`}
 expect((await f.http.head(route)).status).toBe(401)
 expect((await f.http.head(route).set('Authorization',`Bearer ${token(2,'admin')}`)).status).toBe(403)
 const response=await f.http.head(route).set(auth)
 expect(response.status).toBe(200);expect(response.headers['content-length']).toBe(String(100*1024*1024))
 expect(response.headers['content-disposition']).toContain('large-fixture.tar.gz')
 let closed=false
 const native=require('node:fs'),open=native.createReadStream
 const spy=vi.spyOn(native,'createReadStream').mockImplementation((name,options)=>{
  const stream=open(name,options)
  if(path.resolve(String(name)).toLowerCase()===filename.toLowerCase())stream.once('close',()=>closed=true)
  return stream
 })
 onTestFinished(()=>spy.mockRestore())
 await new Promise((resolve,reject)=>{
  const request=http.get(f.origin+route,{headers:auth},response=>{response.once('data',chunk=>{response.destroy();resolve(chunk.length)})})
  request.once('error',reject)
 })
 await expect.poll(()=>closed).toBe(true)
 expect((await f.http.get('/api/version')).status).toBe(200)
})
