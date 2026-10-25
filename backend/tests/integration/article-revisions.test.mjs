import { expect,it } from 'vitest'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fixture,token,get,run,all } from '../helpers/fixture.mjs'
const require=createRequire(import.meta.url)
const admin={Authorization:`Bearer ${token(2,'admin')}`},owner={Authorization:`Bearer ${token()}`}
const body={title:'Revision A',tag:'STG',date:'2026-10-26',description:'first',content:'Original body',cover_image:'',images:[]}
const revisions=(f,id=1)=>f.http.get(`/api/activities/${id}/revisions`).set(admin)
const save=(f,value)=>f.http.put('/api/activities/1').set(admin).send(value)
it('captures a baseline and committed versions, omits identical saves and protects private revision reads',async()=>{
 const f=await fixture()
 expect((await f.http.get('/api/activities/1/revisions')).status).toBe(401)
 expect((await save(f,body)).status).toBe(200)
 let list=await revisions(f)
 expect(list.status).toBe(200);expect(list.headers['cache-control']).toContain('no-store')
 expect(list.body.items.map(item=>item.action)).toEqual(['update','baseline'])
 expect(list.body.items[0].actor_name).toBe('admin')
 expect(list.body.items[0]).not.toHaveProperty('content')
 expect((await save(f,body)).status).toBe(200)
 expect((await revisions(f)).body.total).toBe(2)
 const id=list.body.items[0].id
 expect((await f.http.get(`/api/activities/1/revisions/${id}`).set(admin)).body.content).toBe(body.content)
 expect((await f.http.get(`/api/activities/2/revisions/${id}`).set(admin)).status).toBe(404)
 for(const suffix of ['?page=0','?limit=101','?page[]=1'])expect((await f.http.get('/api/activities/1/revisions'+suffix).set(admin)).status).toBe(400)
 await run(f.db,"UPDATE users SET role='guest' WHERE id=2")
 expect((await revisions(f)).status).toBe(403)
})
it('records new articles and drafts and leaves no snapshot when publishing fails',async()=>{
 const f=await fixture()
 const created=await f.http.post('/api/activities').set(admin).send(body)
 expect(created.status).toBe(200)
 const list=(await revisions(f,created.body.id)).body
 expect(list.items).toHaveLength(1);expect(list.items[0].action).toBe('create');expect(list.items[0].source_status).toBe('published')
 const draft=await f.http.post('/api/activities/draft').set(admin).send({})
 expect((await revisions(f,draft.body.id)).body.items[0].source_status).toBe('draft')
 const staging='/uploads/upload/revision-draft.png'
 await f.fs.writeFile(path.join(f.context.PUBLIC_DIR,'upload/revision-draft.png'),'draft image')
 await run(f.db,'UPDATE activities SET cover_image=?,content=?,images=? WHERE id=2',[staging,`![draft](${staging})`,JSON.stringify([staging])])
 expect((await f.http.put('/api/activities/2').set(admin).send({...body,cover_image:staging,images:[staging],content:`![draft](${staging})`})).status).toBe(200)
 const publishedDraft=(await revisions(f,2)).body
 expect(publishedDraft.items).toHaveLength(1)
 expect((await f.http.get(`/api/activities/2/revisions/${publishedDraft.items[0].id}`).set(admin)).body.cover_image).toMatch(/^\/uploads\/img\/activity\/2\//)
 await run(f.db,"CREATE TRIGGER fail_revision_create BEFORE INSERT ON activity_revisions WHEN NEW.action='create' BEGIN SELECT RAISE(ABORT,'injected'); END")
 const failed=await f.http.post('/api/activities').set(admin).send({...body,title:'must roll back'})
 expect(failed.status).toBe(500)
 expect(await get(f.db,"SELECT id FROM activities WHERE title='must roll back'")).toBeUndefined()
})
it('keeps historical image references alive and restores content as a new version without changing publication state',async()=>{
 const f=await fixture(),url='/uploads/img/activity/1/old.png',filename=path.join(f.context.PUBLIC_DIR,'img/activity/1/old.png')
 await f.fs.mkdir(path.dirname(filename),{recursive:true});await f.fs.writeFile(filename,'historical image')
 expect((await save(f,{...body,cover_image:url,images:[url],content:`![old](${url})`})).status).toBe(200)
 const old=(await revisions(f)).body.items[0]
 expect((await save(f,{...body,title:'Revision B',content:'New body'})).status).toBe(200)
 const latest=(await revisions(f)).body.current_revision
 const {captureCleanupTargets,enqueueCleanup,processCleanupJob}=require('../../dist/src/storage/cleanup.js')
 const targets=await captureCleanupTargets(f.context.PUBLIC_DIR,[url])
 await f.context.sql.main.transaction(tx=>enqueueCleanup(tx,targets))
 expect(await processCleanupJob(f.context.sql.main,f.context.PUBLIC_DIR,path.join(f.root,'quarantine'),targets[0].id)).toBe('retained')
 expect(await f.fs.readFile(filename,'utf8')).toBe('historical image')
 const restored=await f.http.post(`/api/activities/1/revisions/${old.id}/restore`).set(admin).send({base_revision:latest})
 expect(restored.status).toBe(200);expect(restored.body.restored).toBe(true)
 expect(await get(f.db,'SELECT title,content,cover_image,status FROM activities WHERE id=1')).toEqual({title:body.title,content:`![old](${url})`,cover_image:url,status:'published'})
 expect(await get(f.db,'SELECT action,restored_from FROM activity_revisions WHERE id=?',[restored.body.revision_id])).toEqual({action:'restore',restored_from:old.id})
 expect((await f.http.post(`/api/activities/1/revisions/${old.id}/restore`).set(admin).send({base_revision:latest})).status).toBe(409)
 const again=await f.http.post(`/api/activities/1/revisions/${old.id}/restore`).set(admin).send({base_revision:restored.body.revision_id})
 expect(again.body.restored).toBe(false)
 expect((await revisions(f)).body.total).toBe(4)
 expect((await all(f.db,"SELECT * FROM security_audit_outbox WHERE action='RESTORE_ACTIVITY_REVISION'")).length).toBe(1)
})
it('rolls back both the article and revision on snapshot failure and rejects deleted article restores',async()=>{
 const f=await fixture()
 await run(f.db,"CREATE TRIGGER fail_revision_update BEFORE INSERT ON activity_revisions WHEN NEW.action='update' BEGIN SELECT RAISE(ABORT,'injected'); END")
 expect((await save(f,body)).status).toBe(500)
 expect((await get(f.db,'SELECT title FROM activities WHERE id=1')).title).toBe('published')
 expect((await revisions(f)).body.total).toBe(0)
 await run(f.db,'DROP TRIGGER fail_revision_update')
 await save(f,body)
 const list=(await revisions(f)).body,old=list.items[1]
 await run(f.db,"CREATE TRIGGER fail_revision_restore BEFORE INSERT ON activity_revisions WHEN NEW.action='restore' BEGIN SELECT RAISE(ABORT,'injected'); END")
 expect((await f.http.post(`/api/activities/1/revisions/${old.id}/restore`).set(admin).send({base_revision:list.current_revision})).status).toBe(500)
 expect((await get(f.db,'SELECT title FROM activities WHERE id=1')).title).toBe(body.title)
 expect((await revisions(f)).body.total).toBe(2)
 await run(f.db,'DROP TRIGGER fail_revision_restore')
 await f.http.delete('/api/activities/1').set(admin)
 expect((await revisions(f)).status).toBe(404)
  expect((await f.http.post(`/api/activities/1/revisions/${old.id}/restore`).set(admin).send({base_revision:list.current_revision})).status).toBe(404)
 expect((await f.http.get('/api/activities/1/revisions').set(owner)).status).toBe(200)
 expect((await f.http.post(`/api/activities/1/revisions/${old.id}/restore`).set(owner).send({base_revision:list.current_revision})).status).toBe(409)
 await f.http.post('/api/admin/recycle-bin/purge').set(owner).send({})
 expect((await get(f.db,'SELECT COUNT(*) AS n FROM activity_revisions WHERE activity_id=1')).n).toBe(0)
})
it('serializes concurrent saves without losing either committed version',async()=>{
 const f=await fixture()
 const replies=await Promise.all([save(f,{...body,title:'Concurrent A'}),save(f,{...body,title:'Concurrent B'})])
 expect(replies.map(reply=>reply.status)).toEqual([200,200])
 const list=(await revisions(f)).body
 expect(list.items.map(item=>item.version)).toEqual([3,2,1])
 expect(list.items.slice(0,2).map(item=>item.title).sort()).toEqual(['Concurrent A','Concurrent B'])
})
it('does not publish a currently private draft when restoring an older published snapshot',async()=>{
 const f=await fixture()
 await save(f,body)
 const old=(await revisions(f)).body.items[0]
 await save(f,{...body,title:'Later title'})
 const base=(await revisions(f)).body.current_revision
 await run(f.db,"UPDATE activities SET status='draft' WHERE id=1")
 const restored=await f.http.post(`/api/activities/1/revisions/${old.id}/restore`).set(admin).send({base_revision:base})
 expect(restored.status).toBe(200)
 expect(await get(f.db,'SELECT title,status FROM activities WHERE id=1')).toEqual({title:body.title,status:'draft'})
 expect((await f.http.get('/api/activities/1')).status).toBe(404)
})
