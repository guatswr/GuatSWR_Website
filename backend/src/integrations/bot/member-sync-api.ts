import express,{type Request,type Response,type RequestHandler} from 'express'
import { botReceiptSchema,memberSyncQqSchema } from '@guatswr/shared/bot'
import type { Actor } from '../../modules/actor.js'
import type { SqliteStore } from '../../database/sqlite.js'
import type { MemberSync } from './member-sync.js'
import { assertAdmin,assertCredential,type Credential } from './platform.js'
import { AppError } from '../../errors.js'

interface SyncRequest extends Request {user?:Actor;credential?:Credential}
const integer=(value:unknown,max=Number.MAX_SAFE_INTEGER)=>{
  if(typeof value!=='string'|| !/^[1-9]\d*$/.test(value)||!Number.isSafeInteger(Number(value))||Number(value)>max)throw new AppError('参数无效','invalid_parameter',400)
  return Number(value)
}
export function createMemberSyncApi(options:{service:MemberSync;store:SqliteStore;authenticateToken:RequestHandler;requireSuperAdmin:RequestHandler;authorize(scope:string):RequestHandler}) {
  const router=express.Router(),{service,store}=options
  const handle=(fn:(request:SyncRequest,response:Response)=>Promise<unknown>):RequestHandler=>(req,res,next)=>{fn(req as SyncRequest,res).catch(next)}
  const admin=[options.authenticateToken,options.requireSuperAdmin]
  const bot=options.authorize('members:sync')
  router.get('/admin/member-sync/settings',...admin,handle(async(_req,res)=>res.json(await service.settings())))
  router.put('/admin/member-sync/settings',...admin,handle(async(req,res)=>res.json(await service.configure(req.body,req.user!))))
  router.get('/admin/member-sync/requests',...admin,handle(async(_req,res)=>res.json({items:await service.jobs()})))
  router.post('/admin/member-sync/requests',...admin,handle(async(req,res)=>res.json(await service.request(memberSyncQqSchema.parse(req.body?.group_id),req.user!))))
  router.get('/admin/member-sync/requests/:id',...admin,handle(async(req,res)=>{
    if(req.query.search!==undefined && (typeof req.query.search!=='string'||req.query.search.length>50))throw new AppError('搜索参数无效','invalid_parameter',400)
    return res.json(await service.job(String(req.params.id),undefined,{page:integer(req.query.page ?? '1',1000000),search:String(req.query.search || '')}))
  }))
  router.post('/admin/member-sync/requests/:id/apply',...admin,handle(async(req,res)=>res.json(await service.apply(String(req.params.id),req.body,req.user!))))
  router.put('/admin/members/:id/sync-profile',options.authenticateToken,handle(async(req,res)=>res.json(await service.profile(integer(req.params.id),req.body,req.user!))))
  router.get('/admin/member-sync/profiles',options.authenticateToken,handle(async(req,res)=>{
    await store.transaction(tx=>assertAdmin(tx,req.user!))
    return res.json({items:await store.all(`SELECT m.id,m.qq,m.name,m.profile_status,t.created_at,d.status AS notification_status,d.message_status
      FROM member_profile_tasks t JOIN members m ON m.id=t.member_id LEFT JOIN bot_deliveries d ON d.notification_id=t.notification_id
      WHERE t.completed_at IS NULL AND m.deleted_at IS NULL ORDER BY t.created_at,m.id LIMIT 500`)})
  }))
  router.get('/v1/member-sync/requests/:id',bot,handle(async(req,res)=>res.json(await service.job(String(req.params.id),req.credential!))))
  router.put('/v1/member-sync/requests/:id/batches/:batch_no',bot,handle(async(req,res)=>res.json(await service.batch(String(req.params.id),integer(req.params.batch_no,100),req.body,req.credential!))))
  router.post('/v1/member-sync/requests/:id/avatars',bot,express.raw({type:['image/png','image/jpeg','image/webp'],limit:2097152}),handle(async(req,res)=>{
    if(!Buffer.isBuffer(req.body))throw new AppError('请上传PNG/JPEG/WebP图片字节','invalid_parameter',400)
    return res.json(await service.avatar(String(req.params.id),memberSyncQqSchema.parse(req.headers['x-member-qq']),req.body,req.credential!))
  }))
  router.post('/v1/member-sync/requests/:id/complete',bot,handle(async(req,res)=>res.json(await service.complete(String(req.params.id),req.body,req.credential!))))
  router.post('/v1/member-sync/requests/:id/fail',bot,handle(async(req,res)=>res.json(await service.fail(String(req.params.id),req.credential!))))
  router.post('/v1/deliveries/:id/receipt',options.authorize('deliveries:ack'),handle(async(req,res)=>{
    const value=botReceiptSchema.parse(req.body)
    await store.transaction(async tx=>{
      await assertCredential(tx,req.credential!,'deliveries:ack')
      const row=await tx.get('SELECT message_status,receipt_error FROM bot_deliveries WHERE id=? AND credential_id=? AND target_type=\'private\'',[String(req.params.id),req.credential!.id])
      if(!row)throw new AppError('私信投递不存在','not_found',404)
      if(row.message_status!=='pending' && !(row.receipt_error==='timeout' && value.status==='sent')) {
        if(row.message_status!==value.status)throw new AppError('回执冲突','conflict',409)
        return
      }
      await tx.run('UPDATE bot_deliveries SET status=?,message_status=?,receipt_error=?,lease_token=NULL WHERE id=?',[value.status==='sent'?'sent':'failed',value.status,value.status==='failed'?(value.error_code || 'unknown'):null,String(req.params.id)])
    })
    return res.json({received:true})
  }))
  return router
}
