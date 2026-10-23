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
