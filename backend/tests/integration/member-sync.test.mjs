import http from 'node:http'
import { createRequire } from 'node:module'
import path from 'node:path'
import { it,expect,onTestFinished } from 'vitest'
import { fixture,token,get,all,run,png } from '../helpers/fixture.mjs'
const require=createRequire(import.meta.url)
const {botScopes}=require('@guatswr/shared/bot')
const {createBotPlatform}=require('../../dist/src/integrations/bot/platform.js')
const {createMemberSync}=require('../../dist/src/integrations/bot/member-sync.js')
const auth=value=>({Authorization:`Bearer ${value}`})
const admin=auth(token())
const prefix='/api/bot'
const setup=async()=>{
  const f=await fixture({env:{BOT_PLATFORM_ENABLED:'true'}})
  const created=await f.http.post(prefix+'/admin/credentials').set(admin).send({name:'member-sync',scopes:[...botScopes],groups:['123456','654321']})
  expect(created.status).toBe(200)
  const client=created.body,bot=auth(client.token)
  const code=await f.http.post(prefix+'/link-codes').set(admin).send({})
  expect((await f.http.post(prefix+'/v1/identity/bind').set(bot).send({qq:'99999',code:code.body.code})).status).toBe(200)
  const value={enabled:false,credential_id:client.id,groups:['123456','654321'],interval_minutes:360,admin_user_ids:[1]}
  expect((await f.http.put(prefix+'/admin/member-sync/settings').set(admin).send(value)).status).toBe(200)
  expect((await f.http.put(prefix+'/admin/members/1/sync-profile').set(admin).send({qq:'11111',follow_group_name:false,follow_group_avatar:false,sync_protected:false,complete:true})).status).toBe(200)
  const request=async(group='123456')=>{
    const res=await f.http.post(prefix+'/admin/member-sync/requests').set(admin).send({group_id:group})
    expect(res.status).toBe(200);return res.body
  }
  const batch=(id,members,no=1)=>f.http.put(`${prefix}/v1/member-sync/requests/${id}/batches/${no}`).set(bot).send({members})
  const complete=(id,count,batches=1)=>f.http.post(`${prefix}/v1/member-sync/requests/${id}/complete`).set(bot).send({complete:true,batch_count:batches,member_count:count})
  const apply=id=>f.http.post(`${prefix}/admin/member-sync/requests/${id}/apply`).set(admin).send({reason:'核对QQ与群名册'})
  return {...f,client,bot,value,request,batch,complete,apply}
}
const rows=[{qq:'11111',group_card:'group card must not overwrite manual name'},{qq:'22222',group_card:'新群友',nickname:'nickname'}]
async function baseline(f){const job=await f.request();expect((await f.batch(job.id,rows)).status).toBe(200);expect((await f.complete(job.id,2)).body.status).toBe('preview');expect((await f.apply(job.id)).status).toBe(200);return job}

it('stages complete snapshots, previews the baseline, uses unique QQ and preserves manual profiles',async()=>{
  const f=await setup(),before=(await f.http.get('/api/members/revision')).body.revision
  const job=await f.request()
  expect((await f.request()).id).toBe(job.id)
  expect((await f.batch(job.id,rows)).status).toBe(200)
  expect((await f.batch(job.id,rows)).status).toBe(200)
  expect((await f.batch(job.id,[{qq:'33333'}])).status).toBe(409)
  expect((await get(f.db,'SELECT COUNT(*) AS n FROM members')).n).toBe(1)
  const done=await f.complete(job.id,2)
  expect(done.body).toMatchObject({status:'preview',count:2,new_count:1})
  const preview=await f.http.get(`${prefix}/admin/member-sync/requests/${job.id}?search=22222`).set(admin)
  expect(preview.body.preview.items).toEqual([expect.objectContaining({qq:'22222',matched_member_id:null})])
  expect(preview.body.preview.total).toBe(1)
  expect((await f.apply(job.id)).body.status).toBe('succeeded')
  expect((await f.complete(job.id,2)).body.status).toBe('succeeded')
  expect((await f.complete(job.id,3)).status).toBe(409)
  expect((await get(f.db,'SELECT name,school,tags FROM members WHERE id=1'))).toEqual({name:'member',school:'school',tags:'["tag"]'})
  const imported=await get(f.db,"SELECT * FROM members WHERE qq='22222'")
  expect(imported).toMatchObject({name:'新群友',profile_status:'pending',sync_managed:1})
  expect((await f.http.get('/api/members/revision')).body.revision).toBeGreaterThan(before)
  const publicList=await f.http.get('/api/members')
  for(const member of publicList.body){expect(member).not.toHaveProperty('qq');expect(member).not.toHaveProperty('profile_status')}
  expect((await f.http.get('/api/members').set(admin)).body.find(member=>member.id===imported.id).qq).toBe('22222')
  expect((await get(f.db,'SELECT COUNT(*) AS n FROM member_profile_tasks')).n).toBe(1)
  expect((await get(f.db,"SELECT COUNT(*) AS n FROM bot_notifications WHERE event_name='members.profile_required'")).n).toBe(1)
})
it('requires all batches, unique QQ and explicit baseline legacy mapping; empty snapshots do not remove records',async()=>{
  const f=await setup(),job=await f.request()
  expect((await f.batch(job.id,[{qq:'11111'},{qq:'11111'}])).status).toBe(400)
  expect((await f.batch(job.id,rows)).status).toBe(200)
  expect((await f.complete(job.id,2,2)).status).toBe(400)
  const empty=await f.request('654321')
  expect((await f.batch(empty.id,[])).status).toBe(200)
  expect((await f.complete(empty.id,0)).body.status).toBe('blocked')
  expect((await f.apply(empty.id)).status).toBe(409)
  expect((await get(f.db,'SELECT COUNT(*) AS n FROM members')).n).toBe(1)
  await run(f.db,"INSERT INTO members(name,role) VALUES('old without QQ','member')")
  expect((await f.complete(job.id,2)).body.status).toBe('preview')
  expect((await f.apply(job.id)).status).toBe(409)
})
it('isolates Bot assignments, scopes and configuration generations, and rejects arbitrary avatar URLs',async()=>{
  const f=await setup(),job=await f.request()
  const other=await f.http.post(prefix+'/admin/credentials').set(admin).send({name:'other',scopes:[...botScopes],groups:['123456']})
  expect((await f.http.put(`${prefix}/v1/member-sync/requests/${job.id}/batches/1`).set(auth(other.body.token)).send({members:rows})).status).toBe(404)
  expect((await f.batch(job.id,[{qq:'22222',avatar_url:'http://127.0.0.1/private'}])).status).toBe(400)
  expect((await f.http.post(prefix+'/admin/member-sync/requests').set(admin).send({group_id:'777777'})).status).toBe(400)
  expect((await f.http.put(prefix+'/admin/member-sync/settings').set(auth(token(2))).send(f.value)).status).toBe(403)
  expect((await f.http.put(prefix+'/admin/member-sync/settings').set(admin).send(f.value)).status).toBe(200)
  expect((await f.batch(job.id,rows)).status).toBe(409)
})
it('publishes validated avatar bytes asynchronously and never overwrites a manually chosen avatar',async()=>{
  const f=await setup(),job=await f.request()
  await f.batch(job.id,rows)
  expect((await f.http.post(`${prefix}/v1/member-sync/requests/${job.id}/avatars`).set(f.bot).set('X-Member-QQ','22222').set('Content-Type','image/png').send(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).status).toBe(400)
  const upload=await f.http.post(`${prefix}/v1/member-sync/requests/${job.id}/avatars`).set(f.bot).set('X-Member-QQ','22222').set('Content-Type','image/png').send(png)
  expect(upload.status).toBe(200);expect(upload.body.avatar_ref).toMatch(/^[a-f0-9-]{36}$/)
  expect((await f.http.post(`${prefix}/v1/member-sync/requests/${job.id}/avatars`).set(f.bot).set('X-Member-QQ','33333').set('Content-Type','image/png').send(png)).status).toBe(400)
  await f.complete(job.id,2);await f.apply(job.id)
  await f.context.memberSync.tick()
  const member=await get(f.db,"SELECT avatar FROM members WHERE qq='22222'")
  expect(member.avatar).toMatch(/^\/uploads\/img\/user\/bot-sync-.*\.webp$/)
  expect((await f.http.get(member.avatar)).status).toBe(200)
  const metadata=await f.http.get(`${prefix}/v1/member-sync/requests/${job.id}`).set(f.bot)
  expect(metadata.body.known_avatars).toEqual([expect.objectContaining({qq:'22222',checksum:expect.stringMatching(/^[a-f0-9]{64}$/)})])
  const next=await f.request();await f.batch(next.id,rows)
  expect((await f.http.post(`${prefix}/v1/member-sync/requests/${next.id}/avatars`).set(f.bot).set('X-Member-QQ','22222').set('Content-Type','image/png').send(png)).status).toBe(200)
  await run(f.db,"UPDATE members SET avatar='/uploads/manual.png',follow_group_avatar=0 WHERE qq='22222'")
  await f.complete(next.id,2);await f.context.memberSync.tick()
  expect((await get(f.db,"SELECT avatar FROM members WHERE qq='22222'")).avatar).toBe('/uploads/manual.png')
})
it('deduplicates across groups and needs two complete absences before hiding an imported member',async()=>{
  const f=await setup();await baseline(f)
  const other=await f.request('654321');await f.batch(other.id,rows);await f.complete(other.id,2);await f.apply(other.id)
  expect((await get(f.db,"SELECT COUNT(*) AS n FROM members WHERE qq='22222'")).n).toBe(1)
  for(let attempt=0;attempt<2;attempt++)for(const group of ['123456','654321']) {
    const job=await f.request(group);await f.batch(job.id,[rows[0]]);expect((await f.complete(job.id,1)).status).toBe(200)
  }
  expect((await get(f.db,"SELECT sync_hidden FROM members WHERE qq='22222'")).sync_hidden).toBe(1)
  expect((await f.http.get('/api/members')).body.map(member=>member.name)).toEqual(['member'])
  expect((await get(f.db,"SELECT COUNT(*) AS n FROM bot_notifications WHERE event_name='members.profile_required'")).n).toBe(1)
})
it('schedules persistent single-flight requests, expires incomplete jobs and leaves the current roster untouched',async()=>{
  const f=await setup();let clock=Date.now()
  const sync=createMemberSync({store:f.context.sql.main,notify:f.context.botPlatform.enqueueDirected,publicRoot:f.context.PUBLIC_DIR,imageRoot:f.context.IMG_ROOT_DIR,
    publication:f.context.storage.publication,moveStagedFile:f.context.storage.moveStagedFile,resolveUploadsPath:f.context.storage.resolveUploadsPath,now:()=>clock,report:()=>{}})
  await sync.configure({...f.value,enabled:true}, {id:1,username:'owner',role:'super_admin'})
  await Promise.all([sync.tick(),sync.tick()])
  expect((await get(f.db,'SELECT COUNT(*) AS n FROM member_sync_requests')).n).toBe(2)
  const job=(await all(f.db,'SELECT id FROM member_sync_requests'))[0]
  clock+=11*60000;await sync.tick()
  expect((await get(f.db,'SELECT status FROM member_sync_requests WHERE id=?',[job.id])).status).toBe('expired')
  expect((await get(f.db,'SELECT COUNT(*) AS n FROM members')).n).toBe(1)
})
it('sends service commands separately from private profile reminders and records real DM receipts',async()=>{
  const f=await setup(),job=await f.request(),received=[]
  const receiver=http.createServer((req,res)=>{let body='';req.on('data',chunk=>body+=chunk);req.on('end',()=>{received.push(JSON.parse(body));res.writeHead(204).end()})})
  await new Promise(resolve=>receiver.listen(0,'127.0.0.1',resolve));onTestFinished(()=>new Promise(resolve=>{receiver.closeAllConnections();receiver.close(resolve)}))
  const worker=createBotPlatform({store:f.context.sql.main,env:{ASTRBOT_WEBHOOK_URL:`http://127.0.0.1:${receiver.address().port}`},enabled:true,syncSchema:true,shutdown:new AbortController().signal,report:()=>{}})
  await worker.flush()
  expect(received[0]).toMatchObject({kind:'command',event:'members.sync.request',target:{type:'service',bot_id:f.client.id},data:{request_id:job.id,group_id:'123456'}})
  await f.batch(job.id,rows);await f.complete(job.id,2);await f.apply(job.id);await worker.flush()
  const dm=received.find(item=>item.event==='members.profile_required')
  expect(dm.data.admin_path).toBe('/admin/bot?section=profiles')
  expect(dm.target).toMatchObject({type:'private',qq:'99999'});expect(dm.data.members).toEqual([expect.objectContaining({qq:'22222'})])
  expect((await get(f.db,'SELECT message_status FROM bot_deliveries WHERE id=?',[dm.delivery_id])).message_status).toBe('pending')
  const receipt=()=>f.http.post(`${prefix}/v1/deliveries/${dm.delivery_id}/receipt`).set(f.bot).send({status:'sent'})
  expect((await receipt()).status).toBe(200);expect((await receipt()).status).toBe(200)
  expect((await get(f.db,'SELECT message_status FROM bot_deliveries WHERE id=?',[dm.delivery_id])).message_status).toBe('sent')
  await f.context.securityAudit.flush()
  expect(JSON.stringify((await f.http.get('/api/logs')).body)).not.toContain('22222')
})
it('enforces QQ uniqueness and completes the durable website task without destroying profile data',async()=>{
  const f=await setup();await baseline(f)
  const member=await get(f.db,"SELECT id FROM members WHERE qq='22222'")
  const change={qq:'22222',follow_group_name:false,follow_group_avatar:false,sync_protected:true,complete:true}
  expect((await f.http.put(`${prefix}/admin/members/1/sync-profile`).set(admin).send(change)).status).toBe(409)
  expect((await f.http.put(`${prefix}/admin/members/${member.id}/sync-profile`).set(auth(token(2))).send(change)).status).toBe(200)
  expect((await get(f.db,'SELECT completed_at FROM member_profile_tasks WHERE member_id=?',[member.id])).completed_at).toEqual(expect.any(Number))
})
it('rolls back members, version and tasks if the private notification intent cannot be committed',async()=>{
  const f=await setup(),job=await f.request()
  await f.batch(job.id,rows);await f.complete(job.id,2)
  const version=(await f.http.get('/api/members/revision')).body.revision
  await run(f.db,"CREATE TRIGGER synthetic_notification_failure BEFORE INSERT ON bot_notifications WHEN NEW.event_name='members.profile_required' BEGIN SELECT RAISE(ABORT,'synthetic'); END")
  expect((await f.apply(job.id)).status).toBe(500)
  expect((await get(f.db,'SELECT COUNT(*) AS n FROM members')).n).toBe(1)
  expect((await get(f.db,'SELECT COUNT(*) AS n FROM member_profile_tasks')).n).toBe(0)
  expect((await f.http.get('/api/members/revision')).body.revision).toBe(version)
  expect((await get(f.db,'SELECT status FROM member_sync_requests WHERE id=?',[job.id])).status).toBe('preview')
})
it('cancels private messages when administrator privileges are withdrawn and rejects revoked callbacks',async()=>{
  const f=await setup();await baseline(f)
  await run(f.db,"UPDATE users SET role='member' WHERE id=1")
  const worker=createBotPlatform({store:f.context.sql.main,env:{ASTRBOT_WEBHOOK_URL:'http://127.0.0.1:1'},enabled:true,syncSchema:true,shutdown:new AbortController().signal,report:()=>{}})
  expect((await worker.flush()).failed).toBe(0)
  expect((await get(f.db,"SELECT status FROM bot_deliveries WHERE target_type='private'")).status).toBe('cancelled')
  await f.context.botPlatform.revoke(f.client.id,{id:3,username:'second',role:'super_admin'})
  expect((await f.http.get(prefix+'/v1/member-sync/requests/00000000-0000-4000-8000-000000000000').set(f.bot)).status).toBe(401)
})
it('does not stage avatar bytes through a public directory junction into private state',async()=>{
  const f=await setup(),job=await f.request();await f.batch(job.id,rows)
  const privateDir=path.join(f.root,'private-target'),link=path.join(f.context.PUBLIC_DIR,'sync-staging-link')
  await f.fs.mkdir(privateDir)
  await f.fs.symlink(privateDir,link,'junction')
  // Keep the application's already-open upload directory intact on Windows.
  // Inject only the staging resolver, still using the real storage boundary.
  const sync=createMemberSync({store:f.context.sql.main,notify:f.context.botPlatform.enqueueDirected,publicRoot:f.context.PUBLIC_DIR,imageRoot:f.context.IMG_ROOT_DIR,
    publication:f.context.storage.publication,moveStagedFile:f.context.storage.moveStagedFile,
    resolveUploadsPath:url=>f.context.storage.resolveUploadsPath(url.replace('/uploads/upload/','/uploads/sync-staging-link/')),report:()=>{}})
  try {
    await expect(sync.avatar(job.id,'22222',png,await f.context.botPlatform.authenticate(f.client.token))).rejects.toMatchObject({status:503})
    expect(await f.fs.readdir(privateDir)).toEqual([])
  } finally {
    await f.close()
    // This is the exact link created above, not a discovered/computed target.
    // Windows async lstat may report a junction as a directory in a worker.
    if(process.platform==='win32')await f.fs.rmdir(link)
    else await f.fs.unlink(link)
  }
})
