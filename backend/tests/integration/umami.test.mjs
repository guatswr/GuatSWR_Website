import http from 'node:http'
import { expect,it,onTestFinished } from 'vitest'
import { fixture } from '../helpers/fixture.mjs'
it('same range with distinct environment types must not reuse another dimension payload',async()=>{
 const received=[]
 const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://fixture')
  req.resume();req.on('end',()=>{
   res.setHeader('content-type','application/json')
   if(url.pathname.includes('login')) return res.end(JSON.stringify({token:`x.${Buffer.from(JSON.stringify({exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')}.x`}))
   received.push(url.pathname+url.search)
   if(url.pathname.endsWith('metrics')) return res.end(JSON.stringify([{x:url.searchParams.get('type'),y:1}]))
   res.end('{}')
  })
 })
 await new Promise(r=>server.listen(0,'127.0.0.1',r))
 onTestFinished(()=>new Promise(r=>{server.closeAllConnections();server.close(r)}))
 const f=await fixture({env:{UMAMI_BASE_URL:`http://127.0.0.1:${server.address().port}`,UMAMI_USERNAME:'synthetic',UMAMI_PASSWORD:'synthetic-password',UMAMI_WEBSITE_ID:'synthetic-id'}})
 f.context.externalServices=true
 for(const type of ['browser','os','device']){
  const response=await f.http.get(`/api/logs/umami?startAt=1&endAt=1000&envType=${type}`)
  expect(response.status).toBe(200)
  expect.soft(response.body.meta.envType).toBe(type)
  expect.soft(response.body.top.environments).toEqual([{x:type,y:1}])
 }
 expect(received.filter(x=>x.includes('type=os'))).toHaveLength(1)
})

import { createRequire } from 'node:module'
const require=createRequire(import.meta.url)
const {createUmamiClient}=require('../../dist/src/integrations/umami/client.js')
const query=(startAt=1)=>({startAt,endAt:1000,unit:'day',limit:10,envType:'browser'})
async function mockUmami(mode='normal',timeoutMs='2000',ttlMs='60000'){
 let logins=0,reads=0,active=0,peak=0
 const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://fixture');req.resume()
  req.on('end',()=>{
   res.setHeader('content-type','application/json')
   if(url.pathname.includes('login')){
    logins++;return res.end(JSON.stringify({token:`t${logins}.${Buffer.from(JSON.stringify({exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')}.x`}))
   }
   reads++;active++;peak=Math.max(peak,active);res.once('close',()=>active--)
   if(mode==='hang')return
   if(mode==='denied'){res.writeHead(401);return res.end('{}')}
   if(mode==='bad-json')return res.end('synthetic-private-invalid-json')
   if(mode==='large'){res.writeHead(200);res.write('"');return res.end('x'.repeat(1048577)+'"')}
   if(mode==='refresh'&&req.headers.authorization.startsWith('Bearer t1.')){res.writeHead(401);return res.end('{}')}
   const finish=()=>res.end(JSON.stringify(url.pathname.endsWith('metrics')?[]:{}))
   if(mode==='slow')setTimeout(finish,20);else finish()
  })
 })
 await new Promise(r=>server.listen(0,'127.0.0.1',r))
 onTestFinished(()=>new Promise(r=>{server.closeAllConnections();server.close(r)}))
 const baseUrl=`http://127.0.0.1:${server.address().port}`
 const options={baseUrl,username:'synthetic',password:'synthetic-password',websiteId:'synthetic-id',timeoutMs,ttlMs,shutdown:new AbortController().signal}
 return {client:createUmamiClient(options),options,counts:()=>({logins,reads,peak})}
}
it('coalesces identical summaries and login across the four upstream requests',async()=>{
 const f=await mockUmami()
 const results=await Promise.all(Array.from({length:12},()=>f.client.summary(query())))
 expect(results).toHaveLength(12)
 expect(f.counts()).toMatchObject({logins:1,reads:4})
 expect(await f.client.summary(query())).toEqual(results[0])
 expect(f.counts().reads).toBe(4)
})
it('coalesces simultaneous 401 refreshes and retries each request only once',async()=>{
 const f=await mockUmami('refresh')
 await f.client.summary(query())
 expect(f.counts()).toMatchObject({logins:2,reads:8})
})
it('caps distinct in-flight summaries and upstream concurrency',async()=>{
 const f=await mockUmami('slow')
 const running=Array.from({length:8},(_,i)=>f.client.summary(query(i+1)))
 await expect(f.client.summary(query(99))).rejects.toHaveProperty('code','UMAMI_BUSY')
 await Promise.all(running)
 expect(f.counts().peak).toBeLessThanOrEqual(8)
 expect(f.counts().reads).toBe(32)
})
it('evicts least-recent entries at capacity and supports disabling response cache',async()=>{
 const f=await mockUmami()
 for(let i=1;i<=65;i++)await f.client.summary(query(i))
 const before=f.counts().reads
 await f.client.summary(query(1))
 expect(f.counts().reads).toBe(before+4)
 const uncached=await mockUmami('normal','2000','0')
 await uncached.client.summary(query());await uncached.client.summary(query())
 expect(uncached.counts().reads).toBe(8)
})
it('rejects malformed JSON, bounds streamed response bytes and enforces a whole-summary deadline',async()=>{
 const bad=await mockUmami('bad-json')
 await expect(bad.client.summary(query())).rejects.toHaveProperty('code','UMAMI_BAD_JSON')
 const large=await mockUmami('large')
 await expect(large.client.summary(query())).rejects.toHaveProperty('code','UMAMI_RESPONSE_LIMIT')
 const hanging=await mockUmami('hang','100')
 await expect(hanging.client.summary(query())).rejects.toHaveProperty('code','UMAMI_TIMEOUT')
})
it('shutdown aborts in-flight upstream work and validates timeout/cache bounds',async()=>{
 const f=await mockUmami('hang'),shutdown=new AbortController()
 const client=createUmamiClient({...f.options,shutdown:shutdown.signal})
 const pending=expect(client.summary(query())).rejects.toHaveProperty('code','UMAMI_CANCELLED')
 shutdown.abort();await pending
 await expect(client.summary(query())).rejects.toHaveProperty('code','UMAMI_CANCELLED')
 for(const option of [{timeoutMs:'0'},{timeoutMs:'30001'},{ttlMs:'-1'},{ttlMs:'Infinity'},{baseUrl:'file:///private'}]) expect(()=>createUmamiClient({...f.options,...option})).toThrow('UMAMI_CONFIGURATION')
})

it('does not retry indefinitely on persistent 401 and reports only the fixed upstream status',async()=>{
 const f=await mockUmami('denied'),statuses=[]
 const client=createUmamiClient({...f.options,onUpstreamFailure:status=>statuses.push(status)})
 expect(await client.summary(query())).toMatchObject({summary:{},top:{pages:[],environments:[]}})
 expect(f.counts().logins).toBe(2)
 expect(f.counts().reads).toBe(8)
 expect(statuses).toEqual([401,401,401,401])
})