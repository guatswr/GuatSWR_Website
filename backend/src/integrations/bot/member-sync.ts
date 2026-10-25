import { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import {
  memberSyncSettingsSchema, memberSyncBatchSchema, memberSyncCompleteSchema, memberSyncApplySchema, memberSyncProfileSchema,
} from '@guatswr/shared/bot'
import type { SqlExecutor, SqliteStore, Row } from '../../database/sqlite.js'
import type { Actor } from '../../modules/actor.js'
import { AppError } from '../../errors.js'
import { assertAdmin, assertCredential, requireScope, type Credential, type DirectedEnqueue } from './platform.js'
import { enqueueSecurityAudit } from '../../security/audit-outbox.js'
import { publishAssets, type AssetPublication } from '../../storage/publication.js'

type Entry = ReturnType<typeof memberSyncBatchSchema.parse>['members'][number]
interface Job extends Row { id:string;group_id:string;credential_id:string;config_revision:number;generation:number;status:string;expires_at:number;batch_count:number|null;member_count:number|null;summary:string|null }
interface Group extends Row { group_id:string;generation:number;last_applied_generation:number;initialized:number;last_count:number }
interface Member extends Row { id:number;qq:string|null;name:string;avatar:string|null;follow_group_name:number;follow_group_avatar:number;deleted_at:string|null }
const fail = (message:string, status=409):never => { throw new AppError(message,'member_sync_error',status) }
const hash = (value:string|Buffer) => createHash('sha256').update(value).digest('hex')

export function createMemberSync(options:{
  store:SqliteStore;notify:DirectedEnqueue;publicRoot:string;imageRoot:string;publication:AssetPublication
  moveStagedFile(url:string,directory:string):Promise<string|null|undefined>
  resolveUploadsPath(url:string):string|null;now?:()=>number;report(error:unknown):void
}) {
  const {store}=options, now=options.now ?? Date.now
  const settings = async (tx:SqlExecutor=store) => {
    const row=await tx.get<{revision:number;value:string}>('SELECT revision,value FROM member_sync_settings WHERE id=1')
    if (!row) return fail('请先升级成员同步数据库',503)
    return {revision:row.revision,settings:memberSyncSettingsSchema.parse(JSON.parse(row.value))}
  }
  const owned = async (tx:SqlExecutor,id:string,client?:Credential,editable=false,current=true) => {
    if (client) await assertCredential(tx,client,'members:sync')
    const job=await tx.get<Job>('SELECT * FROM member_sync_requests WHERE id=?',[id])
    if (!job || (client && client.id!==job.credential_id)) return fail('同步任务不存在',404)
    const config=await settings(tx)
    if (current && (job.config_revision!==config.revision || config.settings.credential_id!==job.credential_id || !config.settings.groups.includes(job.group_id))) return fail('同步配置已变化，请重新发起')
    if (editable && (!['queued','collecting'].includes(job.status) || job.expires_at<=now())) return fail('同步任务已过期或不可写入',410)
    return job
  }
  const entries = async (tx:SqlExecutor,job:Job,complete?:ReturnType<typeof memberSyncCompleteSchema.parse>) => {
    const count=complete?.batch_count ?? job.batch_count, expected=complete?.member_count ?? job.member_count
    const batches=await tx.all<{batch_no:number;members_json:string}>('SELECT batch_no,members_json FROM member_sync_batches WHERE request_id=? ORDER BY batch_no',[job.id])
    if (count===null || expected===null || batches.length!==count || batches.some((batch,index)=>batch.batch_no!==index+1)) return fail('同步批次不完整',400)
    const rows=batches.flatMap(batch=>memberSyncBatchSchema.parse({members:JSON.parse(batch.members_json)}).members)
    if (rows.length!==expected || rows.length>10000 || new Set(rows.map(row=>row.qq)).size!==rows.length) return fail('人数不一致或QQ重复',400)
    return rows
  }
  const summary = async (tx:SqlExecutor,rows:Entry[]) => {
    const known=new Set((await tx.all<{qq:string|null}>('SELECT qq FROM members WHERE qq IS NOT NULL')).map(row=>row.qq))
    return {count:rows.length,new_count:rows.filter(row=>!known.has(row.qq)).length,
      unlinked_count:(await tx.get<{n:number}>('SELECT COUNT(*) AS n FROM members WHERE qq IS NULL AND deleted_at IS NULL'))?.n || 0}
  }
  const createRequest = async (tx:SqlExecutor,groupId:string) => {
    const config=await settings(tx), value=config.settings
    if (!value.credential_id || !value.groups.includes(groupId)) return fail('请先配置同步Bot和受管群',400)
    const client=await tx.get<Credential>('SELECT id,name,scopes,groups_json,revoked_at FROM bot_credentials WHERE id=? AND revoked_at IS NULL',[value.credential_id])
    if (!client) return fail('同步Bot凭据不可用',403)
    requireScope(client,'members:sync')
    if (!JSON.parse(client.groups_json).includes(groupId)) return fail('Bot未获此群授权',403)
    const existing=await tx.get<Job>(`SELECT * FROM member_sync_requests WHERE group_id=? AND status IN ('queued','collecting','preview','blocked','applying')`,[groupId])
    if (existing && existing.expires_at>now()) return existing
    if(existing)await tx.run("UPDATE member_sync_requests SET status='expired',error_code='DEADLINE_EXCEEDED' WHERE id=?",[existing.id])
    await tx.run('INSERT OR IGNORE INTO member_sync_groups(group_id) VALUES(?)',[groupId])
    await tx.run('UPDATE member_sync_groups SET generation=generation+1,next_due_at=? WHERE group_id=?',[now()+value.interval_minutes*60000,groupId])
    const group=(await tx.get<Group>('SELECT * FROM member_sync_groups WHERE group_id=?',[groupId]))!
    const id=randomUUID()
    await tx.run("INSERT INTO member_sync_requests(id,group_id,credential_id,config_revision,generation,status,created_at,expires_at) VALUES(?,?,?,?,?,'queued',?,?)",
      [id,groupId,client.id,config.revision,group.generation,now(),now()+10*60000])
    await options.notify(tx,{event:'members.sync.request',kind:'command',credentialId:client.id,targetType:'service',targetId:groupId,
      data:{request_id:id,group_id:groupId,expires_at:now()+10*60000,limits:{members:10000,batch:500,batches:100,avatar_bytes:2097152}},key:`member-sync:${id}`})
    return (await tx.get<Job>('SELECT * FROM member_sync_requests WHERE id=?',[id]))!
  }
  const apply = async (id:string,client:Credential|undefined,actor:Actor|undefined,input:ReturnType<typeof memberSyncApplySchema.parse>|undefined) => store.transaction(async tx=>{
    if (actor) await assertAdmin(tx,actor,true)
    const job=await owned(tx,id,client,false,false)
    if (job.status==='succeeded') return JSON.parse(job.summary || '{}') as Record<string,unknown>
    await owned(tx,id,client)
    if (!['queued','collecting','preview','blocked'].includes(job.status) || job.expires_at<=now()) return fail('任务不可提交',410)
    const group=(await tx.get<Group>('SELECT * FROM member_sync_groups WHERE group_id=?',[job.group_id]))!
    if (group.last_applied_generation>=job.generation) return fail('已有更新的群快照')
    const rows=await entries(tx,job), changes=await summary(tx,rows)
    const drop=rows.length===0 || (group.last_count>0 && rows.length<group.last_count/2)
    if ((!group.initialized || drop) && !actor) {
      const state=drop ? 'blocked' : 'preview'
      await tx.run('UPDATE member_sync_requests SET status=?,summary=?,expires_at=? WHERE id=?',[state,JSON.stringify(changes),now()+24*3600000,id])
      return {...changes,status:state}
    }
    if (drop && !input?.allow_large_drop) return fail('空列表或人数骤降，需要明确确认')
    if (!group.initialized && changes.unlinked_count && !input?.allow_unlinked) return fail('请先关联旧成员QQ，或明确确认保留未关联档案')
    // Only a verified complete snapshot increments absence counters. No source
    // can remove a manual record or restore a manually deleted member.
    await tx.run('UPDATE member_group_memberships SET misses=MIN(misses+1,2) WHERE group_id=?',[job.group_id])
    const created:{id:number;qq:string;name:string}[]=[]
    const config=(await settings(tx)).settings
    let order=(await tx.get<{n:number}>('SELECT COALESCE(MAX(sort_order),0) AS n FROM members'))?.n || 0
    for (const entry of rows) {
      await tx.run(`INSERT INTO member_group_memberships(qq,group_id,group_card,nickname,group_role,active,misses,last_seen_generation)
        VALUES(?,?,?,?,?,1,0,?) ON CONFLICT(qq,group_id) DO UPDATE SET group_card=excluded.group_card,nickname=excluded.nickname,
        group_role=excluded.group_role,active=1,misses=0,last_seen_generation=excluded.last_seen_generation`,
      [entry.qq,job.group_id,entry.group_card,entry.nickname,entry.group_role,job.generation])
      let member=await tx.get<Member>('SELECT * FROM members WHERE qq=?',[entry.qq])
      if (!member) {
        const name=entry.group_card || entry.nickname || '未命名群友'
        const inserted=await tx.run(`INSERT INTO members(qq,name,role,avatar,school,tags,sort_order,profile_status,sync_managed,follow_group_name,follow_group_avatar)
          VALUES(?,?,'社群成员','','','[]',?,'pending',1,1,1)`,[entry.qq,name,++order])
        await tx.run('INSERT INTO member_profile_tasks(member_id,created_at) VALUES(?,?)',[inserted.lastID,now()])
        created.push({id:inserted.lastID,qq:entry.qq,name})
        member=(await tx.get<Member>('SELECT * FROM members WHERE id=?',[inserted.lastID]))!
      }
      // A configured primary-group order makes names stable across multiple groups.
      const memberships=await tx.all<{group_id:string;group_card:string;nickname:string}>('SELECT group_id,group_card,nickname FROM member_group_memberships WHERE qq=? AND active=1',[entry.qq])
      memberships.sort((a,b)=>config.groups.indexOf(a.group_id)-config.groups.indexOf(b.group_id))
      const preferred=memberships.find(item=>config.groups.includes(item.group_id))
      const name=preferred?.group_card || preferred?.nickname || '未命名群友'
      if (member.follow_group_name && !member.deleted_at) await tx.run('UPDATE members SET name=? WHERE id=? AND name IS NOT ?',[name,member.id,name])
    }
    await tx.run('UPDATE member_group_memberships SET active=0 WHERE group_id=? AND misses>=2',[job.group_id])
    const groups=config.groups.map(()=>'?').join(',')
    await tx.run(`UPDATE members SET sync_hidden=CASE WHEN EXISTS(SELECT 1 FROM member_group_memberships g WHERE g.qq=members.qq AND g.active=1 AND g.group_id IN (${groups})) THEN 0 ELSE 1 END
      WHERE sync_managed=1 AND sync_protected=0 AND deleted_at IS NULL`,config.groups)
    if (created.length) {
      for (const userId of config.admin_user_ids) {
        const recipient=await tx.get<{qq:string}>('SELECT b.qq FROM bot_identities b JOIN users u ON u.id=b.user_id WHERE b.user_id=? AND b.credential_id=? AND b.qq IS NOT NULL AND u.role IN (\'admin\',\'super_admin\')',[userId,job.credential_id])
        if (!recipient) continue // The persistent website tasks remain visible.
        const notificationId=await options.notify(tx,{event:'members.profile_required',kind:'notification',credentialId:job.credential_id,targetType:'private',targetId:recipient.qq,recipientUserId:userId,
          data:{request_id:id,group_id:job.group_id,initial:!group.initialized,count:created.length,members:created.slice(0,50),truncated:created.length>50,admin_path:'/admin/bot?section=profiles'},key:`member-profiles:${id}:${userId}`})
        for(const member of created)await tx.run('UPDATE member_profile_tasks SET notified_at=?,notification_id=? WHERE member_id=?',[now(),notificationId,member.id])
      }
    }
    const result={...changes,created:created.length,status:'succeeded'}
    await tx.run("UPDATE member_sync_requests SET status='succeeded',summary=? WHERE id=?",[JSON.stringify(result),id])
    await tx.run('UPDATE member_sync_groups SET initialized=1,last_applied_generation=?,last_count=? WHERE group_id=?',[job.generation,rows.length,job.group_id])
    await enqueueSecurityAudit(tx,actor?.username || `bot:${job.credential_id}`,'MEMBER_SYNC_APPLY',JSON.stringify({request_id:id,count:rows.length,created:created.length,reason:input?.reason || 'complete snapshot'}))
    return result
  })
  let ticking:Promise<void>|undefined
  const drainAvatars=async()=>{
    const pictures=await store.all<{id:string;request_id:string;qq:string;url:string;checksum:string}>(`SELECT a.* FROM member_sync_avatars a JOIN member_sync_requests r ON r.id=a.request_id WHERE a.status='pending' AND r.status='succeeded' ORDER BY r.created_at,a.id LIMIT 20`)
    for (const picture of pictures) {
      try {
        await publishAssets(options.publication,[picture.url],async()=>{
          const url=await options.moveStagedFile(picture.url,path.join(options.imageRoot,'user'))
          const absolute=url ? options.resolveUploadsPath(url) : null
          const exists=absolute ? await fs.stat(absolute).then(stat=>stat.isFile()).catch(()=>false) : false
          return {url,exists}
        },async({url,exists},tx)=>{
          if (!tx) return fail('文件事务不可用',503)
          const job=await owned(tx,picture.request_id)
          const group=await tx.get<Group>('SELECT * FROM member_sync_groups WHERE group_id=?',[job.group_id])
          const allowed=await tx.get('SELECT id FROM bot_credentials WHERE id=? AND revoked_at IS NULL',[job.credential_id])
          if (job.status!=='succeeded' || group?.last_applied_generation!==job.generation || !allowed) return fail('头像来源已过期')
          const member=await tx.get<Member>('SELECT * FROM members WHERE qq=?',[picture.qq])
          const applied=Boolean(member && member.follow_group_avatar && !member.deleted_at && url && exists)
          if (applied && member && url) {
            await tx.run('UPDATE members SET avatar=? WHERE id=?',[url,member.id])
            await tx.run('UPDATE member_group_memberships SET avatar_checksum=? WHERE qq=? AND group_id=?',[picture.checksum,picture.qq,job.group_id])
          }
          await tx.run("UPDATE member_sync_avatars SET status=? WHERE id=?",[!exists ? 'failed' : applied ? 'applied' : 'skipped',picture.id])
        })
      } catch(error) { options.report(error); await store.run("UPDATE member_sync_avatars SET status='failed' WHERE id=?",[picture.id]) }
    }
  }
  return {
    settings,
    configure:async(raw:unknown,actor:Actor)=>{
      const value=memberSyncSettingsSchema.parse(raw)
      await store.transaction(async tx=>{
        await assertAdmin(tx,actor,true)
        if (value.credential_id) {
          const client=await tx.get<Credential>('SELECT * FROM bot_credentials WHERE id=? AND revoked_at IS NULL',[value.credential_id])
          if (!client) return fail('Bot不存在',400)
          requireScope(client,'members:sync');requireScope(client,'deliveries:ack')
          if (value.groups.some(group=>!JSON.parse(client.groups_json).includes(group))) return fail('群未授权',403)
          for (const id of value.admin_user_ids) {
            if (!await tx.get("SELECT b.id FROM bot_identities b JOIN users u ON u.id=b.user_id WHERE b.user_id=? AND b.credential_id=? AND b.qq IS NOT NULL AND u.role IN ('admin','super_admin')",[id,client.id])) return fail('提醒接收人须为已绑定此Bot的管理员',400)
          }
        }
        await tx.run("UPDATE member_sync_requests SET status='failed',error_code='CONFIG_CHANGED' WHERE status IN ('queued','collecting','preview','blocked','applying')")
        await tx.run('UPDATE member_sync_settings SET revision=revision+1,value=? WHERE id=1',[JSON.stringify(value)])
        for (const group of value.groups) await tx.run('INSERT OR IGNORE INTO member_sync_groups(group_id) VALUES(?)',[group])
        await enqueueSecurityAudit(tx,actor.username,'MEMBER_SYNC_SETTINGS','Changed member synchronization settings')
      })
      return settings()
    },
    request:(group:string,actor:Actor)=>store.transaction(async tx=>{await assertAdmin(tx,actor,true);return createRequest(tx,group)}),
    async job(id:string,client?:Credential,query:{page:number;search:string}={page:1,search:''}) {
      const job=await owned(store,id,client,false,false)
      let details={summary:job.summary ? JSON.parse(job.summary) : null} as {summary:unknown;preview?:unknown}
      if(!client && ['preview','blocked'].includes(job.status)) {
        const snapshot=await entries(store,job)
        const members=await store.all<Member>('SELECT id,qq,name FROM members WHERE qq IS NOT NULL')
        const byQq=new Map(members.map(member=>[member.qq,member]))
        const search=query.search.trim().toLocaleLowerCase()
        const selected=snapshot.filter(member=>[member.qq,member.group_card,member.nickname].join(' ').toLocaleLowerCase().includes(search))
        details={summary:await summary(store,snapshot),preview:{page:query.page,total:selected.length,has_more:query.page*50<selected.length,
          items:selected.slice((query.page-1)*50,query.page*50).map(member=>({qq:member.qq,group_card:member.group_card,nickname:member.nickname,matched_member_id:byQq.get(member.qq)?.id || null,website_name:byQq.get(member.qq)?.name || null}))}}
      }
      return {...job,...details,
        ...(client?{known_avatars:await store.all('SELECT qq,avatar_checksum AS checksum FROM member_group_memberships WHERE group_id=? AND avatar_checksum IS NOT NULL',[job.group_id])}:{})}
    },
    jobs:()=>store.all('SELECT * FROM member_sync_requests ORDER BY created_at DESC,id LIMIT 50'),
    batch:(id:string,no:number,raw:unknown,client:Credential)=>{
      const body=memberSyncBatchSchema.parse(raw),json=JSON.stringify(body.members),checksum=hash(json)
      if (new Set(body.members.map(member=>member.qq)).size!==body.members.length) return Promise.reject(new AppError('批次QQ重复','invalid_parameter',400))
      return store.transaction(async tx=>{
        await owned(tx,id,client,true)
        const existing=await tx.get('SELECT checksum FROM member_sync_batches WHERE request_id=? AND batch_no=?',[id,no])
        if (existing) { if(existing.checksum!==checksum) return fail('同一批次内容不可变');return {accepted:true} }
        const total=await tx.get<{n:number}>('SELECT COALESCE(SUM(member_count),0) AS n FROM member_sync_batches WHERE request_id=?',[id])
        if ((total?.n || 0)+body.members.length>10000) return fail('同步成员超过上限',413)
        await tx.run('INSERT INTO member_sync_batches(request_id,batch_no,checksum,members_json,member_count) VALUES(?,?,?,?,?)',[id,no,checksum,json,body.members.length])
        await tx.run("UPDATE member_sync_requests SET status='collecting' WHERE id=?",[id])
        return {accepted:true}
      })
    },
    async avatar(id:string,qq:string,bytes:Buffer,client:Credential) {
      if (!bytes.length || bytes.length>2097152) return fail('头像过大或为空',413)
      const raster=bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))
        || bytes.subarray(0,3).equals(Buffer.from('ffd8ff','hex'))
        || (bytes.subarray(0,4).toString()==='RIFF' && bytes.subarray(8,12).toString()==='WEBP')
      if(!raster)return fail('头像必须为PNG/JPEG/WebP栅格图片',400)
      const check=async(tx:SqlExecutor)=>{
        await owned(tx,id,client,true)
        const rows=await tx.all<{members_json:string}>('SELECT members_json FROM member_sync_batches WHERE request_id=?',[id])
        if (!rows.some(row=>(JSON.parse(row.members_json) as Entry[]).some(member=>member.qq===qq))) return fail('请先回传该QQ的成员批次',400)
      }
      await check(store)
      let output:Buffer
      try {
        const image=sharp(bytes,{limitInputPixels:16000000,failOn:'error'})
        if(!['png','jpeg','webp'].includes((await image.metadata()).format || ''))return fail('无效头像格式',400)
        output=await image.rotate().resize(256,256,{fit:'cover',withoutEnlargement:true}).webp({quality:80}).toBuffer()
      }
      catch { return fail('无效头像图片',400) }
      const checksum=hash(bytes),existing=await store.get<{id:string;checksum:string}>('SELECT id,checksum FROM member_sync_avatars WHERE request_id=? AND qq=?',[id,qq])
      if (existing?.checksum===checksum) return {avatar_ref:existing.id}
      const job=await owned(store,id,client,true)
      const prior=await store.get<{avatar_checksum:string|null;avatar:string|null}>('SELECT g.avatar_checksum,m.avatar FROM member_group_memberships g JOIN members m ON m.qq=g.qq WHERE g.group_id=? AND g.qq=?',[job.group_id,qq])
      const currentPath=prior?.avatar ? options.resolveUploadsPath(prior.avatar) : null
      if(prior?.avatar_checksum===checksum && currentPath && await fs.stat(currentPath).then(stat=>stat.isFile()).catch(()=>false))return {avatar_ref:null,unchanged:true}
      const ref=randomUUID(),name=`bot-sync-${ref}.webp`,url=`/uploads/upload/${name}`
      const destination=options.resolveUploadsPath(url)
      if(!destination)return fail('头像暂存目录不可用',503)
      await fs.writeFile(destination,output,{flag:'wx'})
      await store.transaction(async tx=>{
        await check(tx)
        await tx.run(`INSERT INTO member_sync_avatars(id,request_id,qq,url,checksum) VALUES(?,?,?,?,?)
          ON CONFLICT(request_id,qq) DO UPDATE SET id=excluded.id,url=excluded.url,checksum=excluded.checksum,status='pending'`,[ref,id,qq,url,checksum])
      })
      return {avatar_ref:ref}
    },
    async complete(id:string,raw:unknown,client:Credential) {
      const body=memberSyncCompleteSchema.parse(raw)
      const done=await store.transaction(async tx=>{
        const job=await owned(tx,id,client,false,false)
        if(job.batch_count!==null && (job.batch_count!==body.batch_count || job.member_count!==body.member_count))return fail('完成清单不可更改')
        if (job.status==='succeeded') return JSON.parse(job.summary || '{}') as Record<string,unknown>
        await owned(tx,id,client)
        if (['preview','blocked'].includes(job.status)) return {...JSON.parse(job.summary || '{}'),status:job.status} as Record<string,unknown>
        if (!['queued','collecting'].includes(job.status) || job.expires_at<=now()) return fail('任务不可提交',410)
        await entries(tx,job,body)
        await tx.run('UPDATE member_sync_requests SET batch_count=?,member_count=? WHERE id=?',[body.batch_count,body.member_count,id])
        return null
      })
      return done || apply(id,client,undefined,undefined)
    },
    apply:(id:string,raw:unknown,actor:Actor)=>apply(id,undefined,actor,memberSyncApplySchema.parse(raw)),
    fail:(id:string,client:Credential)=>store.transaction(async tx=>{await owned(tx,id,client,true);await tx.run("UPDATE member_sync_requests SET status='failed',error_code='BOT_COLLECTION_FAILED' WHERE id=?",[id]);return {failed:true}}),
    profile:(id:number,raw:unknown,actor:Actor)=>{
      const value=memberSyncProfileSchema.parse(raw)
      return store.transaction(async tx=>{
        await assertAdmin(tx,actor)
        const member=await tx.get<Member>('SELECT * FROM members WHERE id=?',[id]);if(!member)return fail('成员不存在',404)
        const conflict=value.qq ? await tx.get('SELECT id FROM members WHERE qq=? AND id<>?',[value.qq,id]) : undefined
        if(conflict)return fail('此QQ已关联其他成员')
        if(member.qq && member.qq!==value.qq)return fail('已关联QQ不可直接更换，请先处理身份合并')
        await tx.run('UPDATE members SET qq=?,follow_group_name=?,follow_group_avatar=?,sync_protected=?,sync_hidden=CASE WHEN ?=1 THEN 0 ELSE sync_hidden END,profile_status=? WHERE id=?',
          [value.qq,Number(value.follow_group_name),Number(value.follow_group_avatar),Number(value.sync_protected),Number(value.sync_protected),value.complete ? 'complete' : 'pending',id])
        if(value.complete)await tx.run('UPDATE member_profile_tasks SET completed_at=? WHERE member_id=?',[now(),id])
        else await tx.run('INSERT INTO member_profile_tasks(member_id,created_at) VALUES(?,?) ON CONFLICT(member_id) DO UPDATE SET completed_at=NULL',[id,now()])
        await enqueueSecurityAudit(tx,actor.username,'MEMBER_PROFILE_UPDATE',`member=${id}`)
        return {updated:true}
      })
    },
    tick() {
      if(!ticking)ticking=(async()=>{
        await store.transaction(async tx=>{
          await tx.run("UPDATE member_sync_requests SET status='expired',error_code='DEADLINE_EXCEEDED' WHERE status IN ('queued','collecting','preview','blocked','applying') AND expires_at<=?",[now()])
          const config=await settings(tx)
          if(!config.settings.enabled)return
          for(const group of config.settings.groups) {
            const row=await tx.get<{next_due_at:number}>('SELECT next_due_at FROM member_sync_groups WHERE group_id=?',[group])
            if(!row || row.next_due_at<=now())await createRequest(tx,group)
          }
          const pending=await tx.all<{id:number;qq:string;name:string}>(`SELECT m.id,m.qq,m.name FROM member_profile_tasks t JOIN members m ON m.id=t.member_id
            WHERE t.notified_at IS NULL AND t.completed_at IS NULL AND m.deleted_at IS NULL AND m.qq IS NOT NULL ORDER BY t.created_at,m.id LIMIT 50`)
          if(pending.length && config.settings.credential_id)for(const userId of config.settings.admin_user_ids) {
            const recipient=await tx.get<{qq:string}>("SELECT b.qq FROM bot_identities b JOIN users u ON u.id=b.user_id WHERE b.user_id=? AND b.credential_id=? AND b.qq IS NOT NULL AND u.role IN ('admin','super_admin')",[userId,config.settings.credential_id])
            if(!recipient)continue
            const notificationId=await options.notify(tx,{event:'members.profile_required',kind:'notification',credentialId:config.settings.credential_id,targetType:'private',targetId:recipient.qq,recipientUserId:userId,
              data:{count:pending.length,members:pending,admin_path:'/admin/bot?section=profiles'},key:`member-backlog:${pending.map(member=>member.id).join(',')}:${userId}`})
            for(const member of pending)await tx.run('UPDATE member_profile_tasks SET notified_at=?,notification_id=? WHERE member_id=?',[now(),notificationId,member.id])
          }
        })
        await drainAvatars()
      })().finally(()=>{ticking=undefined})
      return ticking
    },
  }
}
export type MemberSync = ReturnType<typeof createMemberSync>
