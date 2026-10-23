import { createRequire } from 'node:module'
import { expect,it } from 'vitest'
import { fixture,run } from '../helpers/fixture.mjs'
const require=createRequire(import.meta.url)
const {createLogsRepository}=require('../../dist/src/modules/logs/repository.js')
const {createLogsService}=require('../../dist/src/modules/logs/service.js')
it('preserves audit filtering, Beijing timestamps, NULLs and public field projection',async()=>{
 const f=await fixture()
 await run(f.logDb,'INSERT INTO audit_logs(username,action,details,created_at) VALUES(?,?,?,?)',['admin','UPDATE_MEMBER',null,'2026-01-02 01:02:03'])
 const response=await f.http.get('/api/logs?username=admin&action=UPDATE_MEMBER')
 expect(response.status).toBe(200)
 expect(response.body.total).toBe(1)
 expect(response.body.logs[0]).toMatchObject({username:'admin',action:'UPDATE_MEMBER',created_at:'2026-01-02T09:02:03+08:00',user_avatar:'/uploads/avatar.png'})
 expect(response.body.logs[0]).not.toHaveProperty('user_id')
 expect(typeof response.body.logs[0].details).toBe('string')
 const stats=await f.http.get('/api/logs/stats')
 expect(stats.status).toBe(200)
 expect(stats.body.stats.find(row=>row.username==='admin')).toMatchObject({count:2,user_avatar:'/uploads/avatar.png'})
})
it('keeps counts and safe responses when current-user metadata lookup fails',async()=>{
 const f=await fixture()
 const repository=createLogsRepository(f.context.sql.main,f.context.sql.audit)
 const service=createLogsService({...repository,users:async()=>{throw new Error('synthetic metadata outage')}})
 const list=await service.list('','',20,0)
 expect(list.total).toBe(1)
 expect(list.logs[0].user_avatar).toBeNull()
 const stats=await service.stats(10)
 expect(JSON.parse(JSON.stringify(stats))).toEqual({stats:[{username:'admin',count:1}]})
})
it('keeps the legacy empty statistic for only NULL or empty grouped usernames',async()=>{
 const f=await fixture()
 await run(f.logDb,'DELETE FROM audit_logs')
 await run(f.logDb,"INSERT INTO audit_logs(username,action) VALUES(NULL,'UPDATE_MEMBER'),('','UPDATE_MEMBER')")
 expect((await f.http.get('/api/logs/stats')).body).toEqual({stats:[]})
})
it('returns fixed 500 errors on audit failure rather than exposing SQL',async()=>{
 const f=await fixture()
 await run(f.logDb,'ALTER TABLE audit_logs RENAME TO synthetic_unavailable')
 for(const url of ['/api/logs','/api/logs/stats']){
  const response=await f.http.get(url)
  expect(response.status).toBe(500)
  expect(response.body).toEqual({message:'服务器错误'})
 }
})
