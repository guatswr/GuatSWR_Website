import { it,expect } from 'vitest'
import { fixture,token,run } from '../helpers/fixture.mjs'
const admin={Authorization:`Bearer ${token()}`}
it('publishes summaries only, hides draft snapshots and does not expose private version IDs or content',async()=>{
 const f=await fixture(),body={title:'Public current title',tag:'STG',date:'2026-10-26',content:'Public current body',images:[]}
 await f.http.put('/api/activities/1').set(admin).send(body)
 await run(f.db,"INSERT INTO activity_revisions(activity_id,version,action,actor_name,created_at,title,content,source_status,changed_fields) VALUES(1,3,'update','hidden-draft-editor',1,'SECRET DRAFT TITLE','SECRET DRAFT BODY','draft','[\"content\"]')")
 const result=await f.http.get('/api/activities/1/revision-log')
 expect(result.status).toBe(200);expect(result.body.available).toBe(true)
 expect(result.body.total).toBe(2);expect(result.body.items.map(row=>row.sequence)).toEqual([2,1])
 const encoded=JSON.stringify(result.body)
 expect(encoded).not.toMatch(/SECRET|hidden-draft|content\":|title\":|actor_id|activity_id|restored_from|source_status|\"version\"/)
 expect(Object.keys(result.body.items[0]).sort()).toEqual(['action','actor_name','changed_fields','created_at','sequence'])
 expect((await f.http.get('/api/activities/1/revisions')).status).toBe(401)
 await run(f.db,"UPDATE activities SET status='draft' WHERE id=1")
 expect((await f.http.get('/api/activities/1/revision-log')).status).toBe(404)
 await run(f.db,"UPDATE activities SET status='published',deleted_at=CURRENT_TIMESTAMP WHERE id=1")
 expect((await f.http.get('/api/activities/1/revision-log')).status).toBe(404)
})
it('paginates published sequence numbers and rejects invalid parameters',async()=>{
 const f=await fixture(),body={title:'Public',tag:'STG',date:'2026-10-26',content:'body',images:[]}
 await f.http.put('/api/activities/1').set(admin).send(body)
 expect((await f.http.get('/api/activities/1/revision-log?limit=1&page=2')).body.items[0].sequence).toBe(1)
 for(const query of ['page=0','limit=101','page[]=1'])expect((await f.http.get('/api/activities/1/revision-log?'+query)).status).toBe(400)
 expect((await f.http.get('/api/activities/2/revision-log')).status).toBe(404)
})
