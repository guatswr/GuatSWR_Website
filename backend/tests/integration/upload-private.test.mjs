import { it, expect, onTestFinished } from 'vitest'
import { createRequire } from 'node:module'
import { once } from 'node:events'
import path from 'node:path'
import { fixture, token, png } from '../helpers/fixture.mjs'
const require=createRequire(import.meta.url)
it('F01 unvalidated Multer bytes are stored privately and cannot be fetched',async()=>{
 const f=await fixture()
 expect(f.context.PRIVATE_UPLOADS_DIR).toBeTypeOf('string')
 const app=require('express')()
 app.post('/hold',f.context.upload.upload.single('file'),(req,res)=>res.json({filename:req.file.filename,path:req.file.path}))
 const server=app.listen(0,'127.0.0.1');await once(server,'listening')
 onTestFinished(()=>new Promise(resolve=>server.close(resolve)))
 const response=await require('supertest')(server).post('/hold').attach('file',png,{filename:'fixture.png',contentType:'image/png'})
 expect(response.body.path).toBe(path.join(f.context.PRIVATE_UPLOADS_DIR,response.body.filename))
 expect((await f.http.get(`/uploads/upload/${response.body.filename}`)).status).toBe(404)
 expect(await f.fs.readFile(response.body.path)).toEqual(png)
})
it('F01 malformed pixels and multiple files fail without publishing or retaining private files',async()=>{
 const f=await fixture()
 const corrupt=Buffer.concat([png.subarray(0,30),Buffer.from('invalid')])
 expect((await f.http.post('/api/upload').set('Authorization',`Bearer ${token()}`).attach('file',corrupt,{filename:'bad.png',contentType:'image/png'})).status).toBe(400)
 const multiple=await f.http.post('/api/upload').set('Authorization',`Bearer ${token()}`).attach('file',png,'one.png').attach('file',png,'two.png')
 expect(multiple.status).toBe(400)
 expect(await f.fs.readdir(f.context.UPLOADS_DIR)).toEqual([])
 expect(await f.fs.readdir(f.context.PRIVATE_UPLOADS_DIR)).toEqual([])
})
it('F01 SVG stays compatible with sandbox/nosniff and private files disappear after success',async()=>{
 const f=await fixture()
 const svg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="red"/></svg>')
 const response=await f.http.post('/api/upload').set('Authorization',`Bearer ${token()}`).attach('file',svg,{filename:'icon.svg',contentType:'image/svg+xml'})
 expect(response.status).toBe(200)
 const served=await f.http.get(response.body.url)
 expect(served.headers['content-security-policy']).toContain('sandbox')
 expect(served.headers['x-content-type-options']).toBe('nosniff')
 expect(await f.fs.readdir(f.context.PRIVATE_UPLOADS_DIR)).toEqual([])
 expect((await f.http.head(response.body.url)).status).toBe(200)
})

it('F01 actual JPEG GIF WebP and PNG files keep their upload contract',async()=>{
 const f=await fixture()
 const sharp=require('sharp')
 for(const [format,mime] of [['jpeg','image/jpeg'],['gif','image/gif'],['webp','image/webp'],['png','image/png']]){
   const bytes=await sharp({create:{width:2,height:2,channels:3,background:'red'}}).toFormat(format).toBuffer()
   const response=await f.http.post('/api/upload').set('Authorization',`Bearer ${token()}`).attach('file',bytes,{filename:`fixture.${format}`,contentType:mime})
   expect(response.status).toBe(200)
   expect((await f.http.get(response.body.url)).status).toBe(200)
 }
 expect(await f.fs.readdir(f.context.PRIVATE_UPLOADS_DIR)).toEqual([])
})
it('F01 rejects MIME mismatch and excessive SVG dimensions without leaving files',async()=>{
 const f=await fixture()
 for(const [bytes,mime,name] of [[png,'image/jpeg','wrong.jpg'],[Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100000" height="100000"/>'),'image/svg+xml','large.svg']]){
   expect((await f.http.post('/api/upload').set('Authorization',`Bearer ${token()}`).attach('file',bytes,{filename:name,contentType:mime})).status).toBe(400)
 }
 expect(await f.fs.readdir(f.context.PRIVATE_UPLOADS_DIR)).toEqual([])
 expect(await f.fs.readdir(f.context.UPLOADS_DIR)).toEqual([])
})
it('F03 EXDEV during publication copies verified bytes and removes private input',async()=>{
 const {vi}=await import('vitest')
 const f=await fixture()
 const rename=vi.spyOn(f.fs,'rename').mockRejectedValueOnce(Object.assign(new Error('cross-device'),{code:'EXDEV'}))
 try{
  const response=await f.http.post('/api/upload').set('Authorization',`Bearer ${token()}`).attach('file',png,{filename:'fixture.png',contentType:'image/png'})
  expect(response.status).toBe(200)
  expect(await f.fs.readFile(path.join(f.context.PUBLIC_DIR,response.body.url.slice('/uploads/'.length)))).toEqual(png)
  expect(await f.fs.readdir(f.context.PRIVATE_UPLOADS_DIR)).toEqual([])
 }finally{rename.mockRestore()}
})

it('F01 a request larger than 50 MiB returns 413 and removes private bytes',async()=>{
 const f=await fixture()
 const bytes=Buffer.alloc(50*1024*1024+1)
 png.copy(bytes)
 const response=await f.http.post('/api/upload').set('Authorization',`Bearer ${token()}`).attach('file',bytes,{filename:'large.png',contentType:'image/png'})
 expect(response.status).toBe(413)
 expect(await f.fs.readdir(f.context.PRIVATE_UPLOADS_DIR)).toEqual([])
 expect(await f.fs.readdir(f.context.UPLOADS_DIR)).toEqual([])
})
it('F01 a disconnected multipart client does not retain an unverified file',async()=>{
 const f=await fixture()
 const http=await import('node:http')
 await new Promise(resolve=>{
   const req=http.request(f.origin+'/api/upload/visitor?eid=2',{method:'POST',headers:{authorization:`Bearer ${token()}`,'content-type':'multipart/form-data; boundary=fixture-abort','content-length':100000}})
   req.on('error',()=>resolve())
   req.write('--fixture-abort\r\nContent-Disposition: form-data; name="file"; filename="aborted.png"\r\nContent-Type: image/png\r\n\r\n')
   req.write(Buffer.concat([png,Buffer.alloc(1000)]),()=>setTimeout(()=>req.destroy(new Error('intentional disconnect')),50))
 })
 const deadline=Date.now()+3000
 while((await f.fs.readdir(f.context.PRIVATE_UPLOADS_DIR)).length && Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,25))
 expect(await f.fs.readdir(f.context.PRIVATE_UPLOADS_DIR)).toEqual([])
 expect(await f.fs.readdir(f.context.UPLOADS_DIR)).toEqual([])
})

it('F01 a file immediately below the 50 MiB limit remains accepted',async()=>{
 const f=await fixture()
 const bytes=Buffer.alloc(50*1024*1024-1)
 png.copy(bytes)
 const response=await f.http.post('/api/upload').set('Authorization',`Bearer ${token()}`).attach('file',bytes,{filename:'within-limit.png',contentType:'image/png'})
 expect(response.status).toBe(200)
 expect(await f.fs.readdir(f.context.PRIVATE_UPLOADS_DIR)).toEqual([])
})

it('F01 admits at most eight active file requests and releases their slots',async()=>{
 const f=await fixture()
 const app=require('express')()
 const waiting=[]
 let ready
 const barrier=new Promise(resolve=>{ready=resolve})
 app.post('/hold',f.context.upload.upload.single('file'),(req,res)=>{waiting.push(res);if(waiting.length===8)ready()})
 const server=app.listen(0,'127.0.0.1');await once(server,'listening')
 onTestFinished(()=>new Promise(resolve=>server.close(resolve)))
 const upload=()=>require('supertest')(server).post('/hold').attach('file',png,{filename:'fixture.png',contentType:'image/png'})
 const held=Array.from({length:8},()=>upload().then(response=>response))
 try{
  await barrier
  expect((await upload()).status).toBe(429)
 }finally{
  for(const response of waiting)response.json({ok:true})
  await Promise.all(held)
 }
 const names=await f.fs.readdir(f.context.PRIVATE_UPLOADS_DIR)
 expect(names).toHaveLength(8)
 for(const name of names)await f.fs.utimes(path.join(f.context.PRIVATE_UPLOADS_DIR,name),new Date(0),new Date(0))
 await f.context.storage.cleanupStaging(1000)
 expect(await f.fs.readdir(f.context.PRIVATE_UPLOADS_DIR)).toEqual([])
})
