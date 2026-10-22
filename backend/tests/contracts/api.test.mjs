import { describe, it, expect } from 'vitest'
import { fixture, token, run, get, png } from '../helpers/fixture.mjs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const frozen = require('../../../docs/backend-modernization/evidence/baseline.json')
const activity = { title: 'new activity', tag: 'STG', date: '2026-01-03', content: 'text', images: [] }
const member = { name: 'new member', role: 'member', tags: ['tag'] }
const history = { title: 'new history', date: '2026-01-03' }
// Explicit successful inputs and envelope keys; no generated snapshots or SQL mocks.
const cases = [
 [1,{},['total','page','limit','items']], [2,{},['id','title','images']],
 [3,{},['id']], [4,activity,['id','message']], [5,activity,['message']], [6,{},['message']], [7,{},['message']],
 [8,{},null], [9,{},['message','target'],{id:4}], [10,{password:'replacement-password'},['message'],{id:4}], [11,{},['message'],{id:4}], [12,{},['message','version']],
 [13,{},['total','logs']], [14,{},['message']], [15,{},['message','result']], [16,{},['bans']], [17,{ip:'203.0.113.99',reason:'test'},['message','ip']], [18,{},['message','ip']],
 [19,{},['enabled','time','lastRun','lastError']], [20,{enabled:false,time:'03:45'},['message','enabled','time']], [21,{},['full']], [22,{},null], [23,{},['message']], [24,{},['message','error'],{status:500}],
 [25,{},['total','items']], [26,{action:'approve'},['message'],{id:3}], [27,{},['message'],{id:3}],
 [28,{username:'admin',password:'fixture-password'},['token','username','role','avatar','id']], [29,{avatar:'/uploads/avatar.png'},['message']], [30,{},['id','username','role','avatar','twofa_enabled']], [31,{username:'new_user',password:'fixture-password'},['message']],
 [32,{id:1,...activity},['message']], [33,{id:1,...history},['message']], [34,{id:1,...member},['message']],
 [35,{},['banner_text']], [36,{key:'banner_text',value:'new text'},['message']], [37,{},['id','message']], [38,{title:'updated'},['message','id'],{id:2}], [39,{},['total','page','limit','items']], [40,{},['id','content','status']],
 [41,{common_id:'new-pilot',qq:'12345',avatar:'/uploads/avatar.png'},['message','eventId']], [42,{},['data']], [43,{},['message']], [44,{},['items']], [45,{},['total','page','limit','items']],
 [46,{type:'STG',title:'created',content:{future:true}},['id','message']], [47,{},['message'],{id:3}], [48,{},['message'],{id:3}], [49,{status:'ongoing'},['message']], [50,{},['message']], [51,{payload:{result:'done'}},['message','id']], [52,{results:[]},['message','id']], [53,{},['items']],
 [54,{},null], [55,history,[]], [56,history,['message']], [57,{},['message']], [58,{},['message']], [59,{},['total','logs']], [60,{},['stats']], [61,{},['message'],{status:503}], [62,{},null], [63,{},null],
 [64,member,['id']], [65,member,['message']], [66,{},['message']], [67,{},['message']], [68,{},['url','thumbUrl']], [69,{},['message','eid','url','thumbUrl']], [70,{},['url']], [71,{},['version','status']]
]
const resolvePath = (operation, id = 1) => operation.split(' ')[1].replace(':id', String(id)).replace(':ip','203.0.113.99')
const send = (f, operation, body, auth, options = {}) => {
 const [method] = operation.split(' ')
 let req = f.http[method.toLowerCase()](resolvePath(operation, options.id))
 if (auth) req = req.set('Authorization', `Bearer ${auth}`)
 if ([22,23].includes(options.number)) req = req.query({ type:'full',file:'fixture.tar.gz' })
 if (options.multipart) {
   if (options.number !== 68) req = req.field('eid', options.number === 69 ? '2' : '1')
   return req.attach('file',png,{filename:'fixture.png',contentType:'image/png'})
 }
 if (!['GET','HEAD','DELETE'].includes(method)) req = req.send(body)
 return req
}
describe('A01 frozen API operations', () => {
 it('covers each of the 71 registered operations exactly once', () => {
   expect(cases.map(([n])=>`API-${String(n).padStart(2,'0')}`).sort()).toEqual(frozen.operations.map(e=>e.id).sort())
 })
 for (const [number, body, keys, options = {}] of cases) {
   const entry = frozen.operations[number-1]
   it(`${entry.id} ${entry.operation}: normal input and authentication boundary`, async () => {
     const f = await fixture()
     if (number === 43) await run(f.db,"INSERT INTO event_participants(event_id,visitor_ip,common_id) VALUES (1,'127.0.0.1','visitor')")
     const auth = number === 43 ? null : token()
     const response = await send(f,entry.operation,body,auth,{...options,number,multipart:[68,69,70].includes(number)})
     expect(response.status).toBe(options.status || 200)
     if (number === 22) {
       expect(Buffer.from(response.body).toString()).toBe('synthetic backup bytes')
     } else {
       expect(response.headers['content-type']).toContain('application/json')
       if (keys === null) expect(Array.isArray(response.body)).toBe(true)
       else for (const key of keys) expect(response.body).toHaveProperty(key)
       if (number === 55) { // EX-06: legacy arrow callback loses lastID; row really exists.
         expect(response.body).toEqual({})
         expect(await get(f.db,"SELECT title FROM history WHERE title='new history'")).toEqual({title:'new history'})
       }
       if ([68,69,70].includes(number)) expect((await f.http.get(response.body.url)).status).toBe(200)
       if (number === 36) expect(await get(f.db,"SELECT value FROM site_config WHERE key='banner_text'")).toEqual({value:'new text'})
       if (number === 41) expect(await get(f.db,"SELECT common_id FROM event_participants WHERE user_id=1")).toEqual({common_id:'new-pilot'})
       if (number === 28) expect(require('jsonwebtoken').verify(response.body.token, f.context.env.JWT_SECRET).role).toBe('admin')
     }
     if (entry.authentication.startsWith('JWT')) {
       const unauthorized = await send(f,entry.operation,{},null,{number})
       expect(unauthorized.status).toBe(401)
       expect(unauthorized.body.message).toBe('未登录')
     }
   })
 }
})

// Inputs that are rejected or explicitly retain legacy no-op/default semantics.
const rejected = new Map([
 [2,{id:999,status:404}], [4,{status:400}], [5,{status:400}], [9,{id:1,status:400}], [10,{body:{password:'x'},status:400}],
 [17,{body:{ip:'invalid'},status:400}], [18,{path:'/api/admin/bans/invalid',status:400}], [20,{body:{time:'25:99'},status:400}],
 [22,{query:{type:'db',file:'fixture.tar.gz'},status:400}], [23,{query:{type:'db',file:'fixture.tar.gz'},status:400}], [24,{status:500}],
 [26,{body:{action:'invalid'},id:3,status:400}], [27,{id:999,status:404}], [28,{status:400}], [29,{body:{twofa_enabled:true},status:400}], [31,{status:400}],
 [32,{status:400}], [33,{status:400}], [34,{status:400}], [36,{body:{key:'',value:''},status:400}], [38,{id:2,status:400}], [40,{id:999,status:404}], [41,{status:400}],
 [42,{id:0,status:400}], [43,{id:0,status:400}], [44,{id:0,status:400}], [46,{status:400}], [47,{id:0,status:400}], [48,{id:0,status:400}], [49,{body:{status:'invalid'},status:400}],
 [50,{id:999,status:404}], [51,{id:999,status:404}], [52,{body:{results:'invalid'},status:400}], [53,{id:0,status:400}], [55,{status:400}], [56,{status:400}], [61,{status:503}],
 [64,{status:400}], [65,{status:400}], [68,{status:400}], [69,{status:400}], [70,{status:400}]
])
describe('A01 invalid input and optional-auth baseline', () => {
 for (const [number] of cases) {
   const entry = frozen.operations[number-1]
   it(`${entry.id}: invalid or unsupported input is characterized`, async () => {
     const f = await fixture()
     const invalid = rejected.get(number) || {query:{page:'bad',limit:'0',unsupported:'ignored'}}
     const [method] = entry.operation.split(' ')
     let req = f.http[method.toLowerCase()](invalid.path || resolvePath(entry.operation,invalid.id))
       .set('Authorization',`Bearer ${token()}`)
     if (invalid.query) req=req.query(invalid.query)
     if (!['GET','HEAD','DELETE'].includes(method)) req=req.send(invalid.body || {})
     const response=await req
     expect(response.status).toBe(invalid.status || 200)
     expect(response.headers['content-type']).toContain('application/json')
     if (invalid.status && invalid.status>=400) expect(typeof (response.body.message || response.body.error)).toBe('string')
     if (entry.authentication.startsWith('JWT')) {
       const denied=await send(f,entry.operation,{},'invalid-token',{number})
       expect(denied.status).toBe(403)
       expect(denied.body).toEqual({message:'Token 无效'})
     }
   })
 }
})
