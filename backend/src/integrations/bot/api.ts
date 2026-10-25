import express, { type Request, type Response, type NextFunction, type RequestHandler } from 'express'
import { botCredentialSchema, botSubscriptionSchema, botLinkSchema, botSignupSchema, botReviewSchema, botQqSchema } from '@guatswr/shared/bot'
import type { Actor } from '../../modules/actor.js'
import type { SqliteStore } from '../../database/sqlite.js'
import { AppError } from '../../errors.js'
import { randomUUID } from 'node:crypto'
import { assertAdmin, assertCredential, privateScope, requireScope, type BotPlatform, type Credential } from './platform.js'
import { createBotIdentityService } from './identity.js'
import { createBotQueries } from './queries.js'
import { createOnThisDayQuery } from './on-this-day.js'
import { createSignupService, SignupError } from '../../modules/events/signup/service.js'
import { createSignupRepository } from '../../modules/events/signup/repository.js'
import { enqueueSecurityAudit } from '../../security/audit-outbox.js'
import type { AssetPublication } from '../../storage/publication.js'
import type { BotImageOptions } from './images.js'
import type { MemberSync } from './member-sync.js'
import { createMemberSyncApi } from './member-sync-api.js'

interface BotRequest extends Request { user?: Actor; credential?: Credential }
const integer = (raw: unknown, fallback?: number, max = Number.MAX_SAFE_INTEGER) => {
  if (raw === undefined && fallback !== undefined) return fallback
  if (typeof raw !== 'string' || !/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(Number(raw)) || Number(raw)>max) throw new AppError('无效的正整数参数', 'invalid_parameter', 400)
  return Number(raw)
}
// This module owns additive APIs; the 71 v1 operations keep their original routes.
export function createBotApi(options: {
  platform: BotPlatform; store: SqliteStore; publication?: AssetPublication
  authenticateToken: RequestHandler; optionalAuth: RequestHandler; guestGateway: RequestHandler
  requireSuperAdmin: RequestHandler; report(error: unknown): void
  images: BotImageOptions
  memberSync?:MemberSync
}) {
  const router = express.Router(), { platform, store } = options
  const identities = createBotIdentityService(store), queries = createBotQueries(store,Boolean(options.memberSync))
  const onThisDay = createOnThisDayQuery(store,Date.now,options.images)
  const handle = (work: (req: BotRequest, res: Response) => Promise<unknown>): RequestHandler => (req, res, next) => { work(req as BotRequest, res).catch(next) }
  const credential = (req: BotRequest) => req.credential!
  const authorize = (name: string): RequestHandler => (req, _res, next) => {
    platform.authenticate((req.headers.authorization || '').replace(/^Bearer /, '')).then(value => {
      requireScope(value, name); (req as BotRequest).credential = value; next()
    }).catch(next)
  }
  router.use((_req, res, next) => { res.setHeader('Cache-Control','private, no-store'); next() })
  router.post('/admin/credentials', options.authenticateToken, options.requireSuperAdmin, handle(async (req,res) => {
    const input = botCredentialSchema.parse(req.body)
    return res.json(await platform.createCredential(input,req.user!))
  }))
  router.get('/admin/credentials', options.authenticateToken, options.requireSuperAdmin, handle(async (_req,res) => res.json({ items: await store.all('SELECT id,name,scopes,groups_json,created_at,revoked_at FROM bot_credentials ORDER BY created_at DESC LIMIT 100') })))
  router.delete('/admin/credentials/:id', options.authenticateToken, options.requireSuperAdmin, handle(async (req,res) => { await platform.revoke(String(req.params.id),req.user!); return res.json({ revoked:true }) }))
  router.get('/admin/deliveries', options.authenticateToken, options.requireSuperAdmin, handle(async (req,res) => {
    const limit=integer(req.query.limit,20,100), page=integer(req.query.page,1,1000000)
    return res.json({ page,limit,items:await store.all('SELECT d.*,n.event_name FROM bot_deliveries d JOIN bot_notifications n ON n.id=d.notification_id ORDER BY n.created_at DESC,d.id LIMIT ? OFFSET ?', [limit,(page-1)*limit]) })
  }))
  router.post('/admin/deliveries/:id/retry', options.authenticateToken, options.requireSuperAdmin, handle(async (req,res) => {
    await store.transaction(async tx => {
      await assertAdmin(tx,req.user!,true)
      await platform.retry(String(req.params.id),undefined,tx)
      await enqueueSecurityAudit(tx,req.user!.username,'BOT_DELIVERY_RETRY',`delivery=${String(req.params.id)}`)
    })
    return res.json({ status:'queued' })
  }))
  router.post('/link-codes', options.optionalAuth, options.guestGateway, handle(async (req,res) => res.json(await identities.issue(req.user,req.headers['x-bot-owner']))))
  router.delete('/binding', options.optionalAuth, options.guestGateway, handle(async (req,res) => res.json(await identities.unbind(req.user,req.headers['x-bot-owner']))))
  router.post('/v1/identity/bind', authorize('identity:write'), handle(async (req,res) => {
    const input=botLinkSchema.parse(req.body)
    return res.json(await identities.consume(credential(req),input.code,input.qq))
  }))
  for (const name of ['events','articles','members','history'] as const) router.get(`/v1/${name}`, authorize('query:read'), handle(async (req,res) => {
    const page=integer(req.query.page,1,1000000),limit=integer(req.query.limit,20,100)
    if (req.query.type !== undefined && (typeof req.query.type !== 'string' || req.query.type.length>50)) throw new AppError('活动类型无效','invalid_parameter',400)
    return res.json(await queries[name](page,limit,req.query.type as string | undefined))
  }))
  router.get('/v1/events/:id', authorize('query:read'), handle(async (req,res) => res.json(await queries.event(integer(req.params.id)))))
  router.get('/v1/on-this-day', authorize('query:read'), handle(async (req,res) => res.json(await onThisDay(req.query))))
  router.get('/v1/subscriptions', authorize('subscriptions:write'), handle(async (req,res) => res.json({ items:await store.all('SELECT id,group_id,event_name,event_id,lead_minutes FROM bot_subscriptions WHERE credential_id=?', [credential(req).id]) })))
  router.post('/v1/subscriptions', authorize('subscriptions:write'), handle(async (req,res) => {
    const input=botSubscriptionSchema.parse(req.body), client=credential(req)
    if (!JSON.parse(client.groups_json).includes(input.group_id)) throw new AppError('此群未获授权','bot_group',403)
    const needed=privateScope(input.event); if (needed) requireScope(client,needed)
    const id=randomUUID()
    await store.run(`INSERT INTO bot_subscriptions(id,credential_id,group_id,event_name,event_id,lead_minutes) VALUES(?,?,?,?,?,?)
      ON CONFLICT(credential_id,group_id,event_name,event_id) DO UPDATE SET lead_minutes=excluded.lead_minutes`, [id,client.id,input.group_id,input.event,input.event_id || 0,input.lead_minutes])
    return res.json(await store.get('SELECT id,group_id,event_name,event_id,lead_minutes FROM bot_subscriptions WHERE credential_id=? AND group_id=? AND event_name=? AND event_id=?', [client.id,input.group_id,input.event,input.event_id || 0]))
  }))
  router.delete('/v1/subscriptions/:id', authorize('subscriptions:write'), handle(async (req,res) => {
    if (!(await store.run('DELETE FROM bot_subscriptions WHERE id=? AND credential_id=?',[String(req.params.id),credential(req).id])).changes) throw new AppError('订阅不存在','not_found',404)
    return res.json({ deleted:true })
  }))
  router.get('/v1/deliveries', authorize('deliveries:read'), handle(async (req,res) => {
    const limit=integer(req.query.limit,20,100),page=integer(req.query.page,1,1000000)
    return res.json({ page,limit,items:await store.all('SELECT d.id,d.notification_id,d.group_id,d.status,d.attempts,d.last_error,d.delivered_at,n.event_name FROM bot_deliveries d JOIN bot_notifications n ON n.id=d.notification_id WHERE d.credential_id=? ORDER BY n.created_at DESC,d.id LIMIT ? OFFSET ?', [credential(req).id,limit,(page-1)*limit]) })
  }))
  router.post('/v1/deliveries/:id/retry', authorize('deliveries:retry'), handle(async (req,res) => { await platform.retry(String(req.params.id),credential(req)); return res.json({ status:'queued' }) }))
  for (const method of ['get','post','delete'] as const) router[method]('/v1/events/:id/signup', authorize(method==='get' ? 'signup:read' : 'signup:write'), handle(async (req,res) => {
    const qq=botQqSchema.parse(method==='post' ? req.body?.qq : req.query.qq), bound=await platform.identity(credential(req),qq)
    const id=integer(req.params.id), identity={ userId:bound.user_id,visitorIp:null,...(bound.user_id ? {} : { botIdentityId:bound.id }) }
    const signup=createSignupService({ repository:createSignupRepository(store), notify:async () => {}, ...(options.publication ? { publication:options.publication } : {}), enqueue:platform.enqueue,
      authorize:async tx => {
        await assertCredential(tx,credential(req),'signup:write')
        const current=await platform.identity(credential(req),qq,tx)
        if (current.id!==bound.id) throw new AppError('绑定已变化，请重试','bot_binding_conflict',409)
      } })
    if (method==='get') return res.json({ data:await signup.find(id,identity) })
    if (method==='delete') { await signup.remove(id,identity); return res.json({ message:'已取消报名' }) }
    const input=botSignupSchema.parse(req.body)
    await signup.signup(id,identity,input,null)
    return res.json({ message:'报名成功',eventId:id })
  }))
  router.get('/v1/reviews', authorize('review:read'), handle(async (req,res) => {
    const bound=await platform.identity(credential(req),botQqSchema.parse(req.query.qq))
    if (!bound.user_id) throw new AppError('需要绑定网站管理员','bot_admin_required',403)
    const page=integer(req.query.page,1,1000000),limit=integer(req.query.limit,20,100)
    const items=await store.transaction(async tx => {
      await assertAdmin(tx,{ id:bound.user_id!,username:'',role:'' })
      return tx.all("SELECT id,type,title,status,created_at FROM events WHERE status='pending' ORDER BY created_at,id LIMIT ? OFFSET ?",[limit,(page-1)*limit])
    })
    return res.json({ page,limit,items })
  }))
  router.post('/v1/events/:id/review', authorize('review:write'), handle(async (req,res) => {
    const input=botReviewSchema.parse(req.body),id=integer(req.params.id),client=credential(req)
    await store.transaction(async tx => {
      await assertCredential(tx,client,'review:write')
      const bound=await platform.identity(client,input.qq,tx)
      if (!bound.user_id) throw new AppError('需要绑定网站管理员','bot_admin_required',403)
      const user=await tx.get<{ id:number;username:string;role:string }>('SELECT id,username,role FROM users WHERE id=?',[bound.user_id])
      if (!user) throw new AppError('管理员不存在','bot_admin_required',403)
      await assertAdmin(tx,user)
      const status=input.action==='approve' ? 'published' : 'rejected'
      if (!(await tx.run("UPDATE events SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='pending'",[status,id])).changes) throw new AppError('活动不存在或已被审核','bot_review_conflict',409)
      await enqueueSecurityAudit(tx,user.username,'BOT_REVIEW_EVENT',JSON.stringify({ bot:client.id,event_id:id,action:input.action,reason:input.reason }))
      await platform.enqueue(input.action==='approve' ? 'event.approved' : 'event.rejected',{ eventId:id,status },user,tx)
    })
    return res.json({ reviewed:true,action:input.action })
  }))
  if(options.memberSync)router.use(createMemberSyncApi({service:options.memberSync,store,authenticateToken:options.authenticateToken,requireSuperAdmin:options.requireSuperAdmin,authorize}))
  else router.use(['/admin/member-sync','/admin/members','/v1/member-sync'],(_req,res)=>res.status(503).json({message:'请先升级成员同步数据库'}))
  router.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
    void next // Express identifies error middleware by its four-argument signature.
    if (error instanceof AppError || error instanceof SignupError) return res.status(error.status).json({ message:error.message })
    if (error && typeof error==='object' && 'name' in error && error.name==='ZodError') return res.status(400).json({ message:'请求参数无效' })
    if(error && typeof error==='object' && 'type' in error && error.type==='entity.too.large')return res.status(413).json({message:'头像过大'})
    options.report(error); return res.status(500).json({ message:'Bot 操作失败' })
  })
  return router
}
