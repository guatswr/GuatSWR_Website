import http from 'node:http'
import { createRequire } from 'node:module'
import { expect, it, onTestFinished } from 'vitest'
const require=createRequire(import.meta.url)
const {createWebhookTransport}=require('../../dist/src/integrations/bot/transport.js')
const {createBotNotifier}=require('../../dist/src/integrations/bot/notifier.js')
async function receiver(handler){
 const server=http.createServer(handler)
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
 onTestFinished(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve)}))
 return {server,url:`http://127.0.0.1:${server.address().port}`}
}
const send=(url,options={})=>createWebhookTransport({url,token:'synthetic-bot-token',timeoutMs:'1000',enabled:true,shutdown:new AbortController().signal,...options})
it('preserves all three wire payloads and sends only the configured Bearer header',async()=>{
 const received=[]
 const target=await receiver((req,res)=>{let body='';req.on('data',b=>body+=b);req.on('end',()=>{received.push({headers:req.headers,body:JSON.parse(body)});res.writeHead(204).end()})})
 const bot=createBotNotifier(send(target.url)),actor={id:2,username:'admin',role:'admin',jwt:'must-not-send'}
 await bot.notifyActivityPublished({id:1,title:'activity',tag:'STG',date:'2026-10-24'},actor)
 await bot.notifyHistoryUpdated({id:2,date:'2026-10-24',title:'history'},actor,'add')
 await bot.notifyMemberAdded({id:3,name:'member',role:'member'},null)
 expect(received.map(r=>r.body.event)).toEqual(['activity.published','history.updated','member.added'])
 expect(received[0].body.data).toEqual({id:1,title:'activity',tag:'STG',date:'2026-10-24',description:'',cover_image:''})
 expect(received[1].body.data).toEqual({id:2,date:'2026-10-24',title:'history',description:'',image:'',sort_order:0,action:'add'})
 expect(received[2].body.data).toEqual({id:3,name:'member',role:'member',school:'',avatar:''})
 expect(received[0].body.actor).toEqual({id:2,username:'admin',role:'admin'})
 expect(received[2].body.actor).toBeNull()
 for(const item of received){expect(item.headers.authorization).toBe('Bearer synthetic-bot-token');expect(item.body.source).toBe('guatswr_web');expect(new Date(item.body.timestamp).toISOString()).toBe(item.body.timestamp)}
})
it('bounds non-2xx bodies and never includes upstream private text in errors',async()=>{
 const target=await receiver((req,res)=>{req.resume();res.writeHead(500);res.write('synthetic-private-');res.end('x'.repeat(131072))})
 await expect(send(target.url)({})).rejects.toMatchObject({code:'BOT_RESPONSE_LIMIT',message:'BOT_RESPONSE_LIMIT'})
 const declared=await receiver((req,res)=>{req.resume();res.writeHead(500,{'content-length':'1000000'});res.write('x')})
 await expect(send(declared.url)({})).rejects.toHaveProperty('code','BOT_RESPONSE_LIMIT')
 const small=await receiver((req,res)=>{req.resume();res.writeHead(400);res.end('synthetic-private-text')})
 await expect(send(small.url)({})).rejects.toMatchObject({code:'BOT_HTTP_FAILURE',message:'BOT_HTTP_FAILURE'})
})
it('cancels an unbounded success body instead of leaving a connection and task open',async()=>{
 let closed=false
 const target=await receiver((req,res)=>{req.resume();res.writeHead(200);res.write('accepted');res.on('close',()=>closed=true)})
 expect(await send(target.url)({})).toEqual({ok:true})
 await expect.poll(()=>closed).toBe(true)
})
it('times out before headers, observes shutdown and does not retry a notification',async()=>{
 let calls=0
 const target=await receiver(req=>{calls++;req.resume()})
 await expect(send(target.url,{timeoutMs:'50'})({})).rejects.toMatchObject({code:'BOT_TIMEOUT'})
 expect(calls).toBeLessThanOrEqual(1)
 const shutdown=new AbortController();shutdown.abort()
 await expect(send(target.url,{shutdown:shutdown.signal})({})).rejects.toMatchObject({code:'BOT_CANCELLED'})
 expect(calls).toBeLessThanOrEqual(1)
})
it('does not forward notifications through redirects',async()=>{
 let forwarded=0
 const other=await receiver((req,res)=>{forwarded++;res.end('unexpected')})
 const target=await receiver((req,res)=>{req.resume();res.writeHead(307,{location:other.url});res.end()})
 await expect(send(target.url)({})).rejects.toMatchObject({code:'BOT_REQUEST_FAILED'})
 expect(forwarded).toBe(0)
})
it('keeps disabled/unconfigured outcomes and rejects unusable timeout or URL configuration',async()=>{
 expect(await send('',{enabled:false})({})).toEqual({skipped:true,reason:'External services disabled'})
 expect(await send('')({})).toEqual({skipped:true,reason:'ASTRBOT_WEBHOOK_URL 未配置'})
 for(const timeoutMs of ['NaN','0','30001','1.5']) expect(()=>send('',{timeoutMs})).toThrow('BOT_CONFIGURATION')
 expect(()=>send('file:///private')).toThrow('BOT_CONFIGURATION')
})
