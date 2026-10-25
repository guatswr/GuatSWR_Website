import { it,expect } from 'vitest'
import { fixture,get } from '../helpers/fixture.mjs'
import { startNuxt } from '../helpers/nuxt-server.mjs'
it('restores an article through the private BFF and invalidates warmed public article caches',async()=>{
 const f=await fixture(),{origin,call,login}=await startNuxt(f),headers=await login()
 const first={title:'BFF revision A',tag:'STG',date:'2026-10-26',content:'First revision body',images:[]}
 expect((await fetch(origin+'/api/bff/admin/article-revisions?id=1')).status).toBe(401)
 const save=body=>call('/api/bff/admin/activities/1',{method:'PUT',headers,body:JSON.stringify(body)})
 expect((await save(first)).response.status).toBe(200)
 const older=(await call('/api/bff/admin/article-revisions?id=1')).data.items[0]
 expect((await save({...first,title:'BFF revision B',content:'Later body'})).response.status).toBe(200)
 expect((await call('/api/content/activity/1')).data.activity.title).toBe('BFF revision B')
 const list=await call('/api/bff/admin/article-revisions?id=1')
 expect(list.data.total).toBe(3);expect(JSON.stringify(list.data)).not.toContain('First revision body')
 const url=`/api/bff/admin/article-revisions?id=1&revision=${older.id}`,body=JSON.stringify({base_revision:list.data.current_revision})
 expect((await call(url,{method:'POST',headers:{origin,'content-type':'application/json'},body})).response.status).toBe(403)
 expect((await call(url,{method:'POST',headers,body:JSON.stringify({base_revision:list.data.current_revision,actor_id:2})})).response.status).toBe(400)
 const restored=await call(url,{method:'POST',headers,body})
 expect(restored.response.status).toBe(200);expect(restored.data.restored).toBe(true)
 const after=await call('/api/content/activity/1')
 expect(after.data.activity.title).toBe(first.title);expect(JSON.stringify(after.data)).toContain(first.content)
 expect(JSON.stringify(after.data)).not.toMatch(/restored_from|activity_revisions|changed_fields/)
 expect((await call(url,{method:'POST',headers,body})).response.status).toBe(409)
 expect((await get(f.db,'SELECT COUNT(*) AS n FROM activity_revisions WHERE activity_id=1')).n).toBe(4)
 expect((await call(`/api/bff/admin/article-revisions?id=2&revision=${older.id}`)).response.status).toBe(404)
 const publicLogRes=await fetch(origin+'/api/content/activity/1/revisions'),publicLog=await publicLogRes.json()
 expect(publicLogRes.status).toBe(200);expect(publicLog.available).toBe(true);expect(publicLog.total).toBe(4)
 expect(publicLog.items.map(row=>row.sequence)).toEqual([4,3,2,1]);expect(publicLog.items[0].action).toBe('restore')
 expect(JSON.stringify(publicLog)).not.toMatch(/First revision body|Later body|BFF revision|restored_from|current_revision|\"version\"/)
 expect((await fetch(origin+'/api/content/activity/1/revisions?page=0')).status).toBe(400)
 expect((await fetch(origin+'/api/content/activity/999/revisions')).status).toBe(404)
})
