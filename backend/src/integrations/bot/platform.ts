import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { botEventNames, botScopes } from '@guatswr/shared/bot'
import { parseClubTime } from '@guatswr/shared'
import type { Actor } from '../../modules/actor.js'
import type { Row, SqlExecutor, SqliteStore } from '../../database/sqlite.js'
import { AppError } from '../../errors.js'
import { enqueueSecurityAudit } from '../../security/audit-outbox.js'
import { authorizeSecurityActor } from '../../security/authorize.js'
import { publicContent } from '../../utils/public-event.js'
import { createWebhookTransport } from './transport.js'
import { createBotSecretVault } from './secret-vault.js'

export const digest = (value: string) => createHash('sha256').update(value).digest('hex')
export interface Credential extends Row { id: string; name: string; scopes: string; groups_json: string; revoked_at: number | null }
export interface BotIdentity extends Row { id: string; user_id: number | null; qq: string | null; credential_id: string | null }
interface Subscription extends Row { id: string; credential_id: string; group_id: string; event_name: string; event_id: number; lead_minutes: number }
interface Delivery extends Row { id: string; credential_id: string | null; subscription_id: string | null; group_id: string; attempts: number; payload: string; event_name: string;target_type?:string;target_id?:string;recipient_user_id?:number }
export interface DirectedNotification {
  event:'members.sync.request'|'members.profile_required';kind:'command'|'notification';credentialId:string
  targetType:'service'|'private';targetId:string;recipientUserId?:number;data:unknown;key:string
}
export type DirectedEnqueue = (tx:SqlExecutor,input:DirectedNotification)=>Promise<string>
export type Enqueue = (event: string, data: unknown, actor: Actor | null | undefined, tx?: SqlExecutor, key?: string) => Promise<{ id: string; status: 'queued' | 'skipped' }>
export const requireScope = (credential: Credential, scope: string) => {
  if (!JSON.parse(credential.scopes).includes(scope)) throw new AppError('Bot 权限不足', 'bot_scope', 403)
}
export const privateScope = (event: string) => ['event.pending', 'event.rejected'].includes(event) ? 'review:read'
  : ['event.signup', 'event.signup_cancelled'].includes(event) ? 'signup:read' : undefined
export async function assertCredential(tx: SqlExecutor, credential: Credential, scope: string) {
  const current=await tx.get<Credential>('SELECT id,name,scopes,groups_json,revoked_at FROM bot_credentials WHERE id=? AND revoked_at IS NULL',[credential.id])
  if (!current) throw new AppError('Bot 凭据已撤销','bot_unauthorized',401)
  requireScope(current,scope)
}
const legacyEvents = ['activity.published', 'history.updated', 'member.added']
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}

export function createBotPlatform(options: {
  store: SqliteStore; env: Record<string, string | undefined>; enabled: boolean; shutdown: AbortSignal
  now?: () => number; report(error: unknown): void
  syncSchema?:boolean
  vaultSchema?:boolean
}) {
  const { store } = options, now = options.now ?? Date.now
  const vault = createBotSecretVault(options.env.BOT_CREDENTIAL_ENCRYPTION_KEY, Boolean(options.vaultSchema))
  const enqueue: Enqueue = async (event, input, actor, executor, key = randomUUID()) => {
    if (!(botEventNames as readonly string[]).includes(event)) throw new AppError('未知 Bot 事件', 'bot_event', 400)
    const write = async (tx: SqlExecutor) => {
      const existing = await tx.get<{ id: string; active: number }>(`SELECT n.id,EXISTS(SELECT 1 FROM bot_deliveries d WHERE d.notification_id=n.id AND d.status!='skipped') AS active
        FROM bot_notifications n WHERE n.dedupe_key=?`, [key])
      if (existing) return { id: existing.id, status: existing.active ? 'queued' as const : 'skipped' as const }
      const id = randomUUID(), data = publicContent(input), eventId = Number(object(data).eventId || 0)
      const payload = JSON.stringify({ event_id: id, event, data, actor: actor ? { id: actor.id, username: actor.username, role: actor.role } : null,
        source: 'guatswr_web', timestamp: new Date(now()).toISOString() })
      if (Buffer.byteLength(payload) > 256 * 1024) throw new AppError('通知内容过大', 'bot_payload_limit', 413)
      await tx.run('INSERT INTO bot_notifications(id,dedupe_key,event_name,payload,created_at) VALUES(?,?,?,?,?)', [id,key,event,payload,now()])
      const subscriptions = await tx.all<Subscription & { scopes: string }>(`SELECT s.*,c.scopes FROM bot_subscriptions s JOIN bot_credentials c ON c.id=s.credential_id
        WHERE c.revoked_at IS NULL AND s.event_name=? AND (s.event_id=0 OR s.event_id=?)`, [event,eventId])
      let count = 0
      for (const sub of subscriptions) {
        const scope = privateScope(event)
        if (scope && !JSON.parse(sub.scopes).includes(scope)) continue
        // Reminder scans target exactly one subscription and lead time.
        if (object(input).subscription_id && object(input).subscription_id !== sub.id) continue
        await tx.run(`INSERT OR IGNORE INTO bot_deliveries(id,notification_id,credential_id,subscription_id,group_id,next_attempt_at)
          VALUES(?,?,?,?,?,?)`, [randomUUID(),id,sub.credential_id,sub.id,sub.group_id,now()])
        count++
      }
      if (!count) {
        const legacy = legacyEvents.includes(event)
        const pending = legacy && Boolean(options.env.ASTRBOT_WEBHOOK_URL) && options.enabled
        await tx.run(`INSERT INTO bot_deliveries(id,notification_id,status,next_attempt_at,last_error) VALUES(?,?,?,?,?)`,
          [randomUUID(),id,pending ? 'pending' : 'skipped',now(),pending ? null : legacy ? 'BOT_UNCONFIGURED_OR_DISABLED' : 'BOT_NO_SUBSCRIBERS'])
        return { id, status: pending ? 'queued' as const : 'skipped' as const }
      }
      return { id, status: 'queued' as const }
    }
    return executor ? write(executor) : store.transaction(write)
  }
  const authenticate = async (token: string) => {
    if (!/^gwb_[a-f0-9]{64}$/.test(token)) throw new AppError('Bot 凭据无效', 'bot_unauthorized', 401)
    const credential = await store.get<Credential>('SELECT id,name,scopes,groups_json,revoked_at FROM bot_credentials WHERE secret_hash=? AND revoked_at IS NULL', [digest(token)])
    if (!credential) throw new AppError('Bot 凭据无效或已撤销', 'bot_unauthorized', 401)
    return credential
  }
  const enqueueDirected:DirectedEnqueue=async(tx,input)=>{
    if(!options.syncSchema)throw new AppError('请先升级成员同步数据库','member_sync_migration',503)
    const old=await tx.get<{id:string}>('SELECT id FROM bot_notifications WHERE dedupe_key=?',[input.key])
    if(old)return old.id
    const id=randomUUID(),payload=JSON.stringify({event_id:id,kind:input.kind,event:input.event,data:input.data,source:'guatswr_web',timestamp:new Date(now()).toISOString()})
    if(Buffer.byteLength(payload)>256*1024)throw new AppError('通知内容过大','bot_payload_limit',413)
    await tx.run('INSERT INTO bot_notifications(id,dedupe_key,event_name,payload,created_at) VALUES(?,?,?,?,?)',[id,input.key,input.event,payload,now()])
    await tx.run(`INSERT INTO bot_deliveries(id,notification_id,credential_id,target_type,target_id,recipient_user_id,message_status,next_attempt_at)
      VALUES(?,?,?,?,?,?,?,?)`,[randomUUID(),id,input.credentialId,input.targetType,input.targetId,input.recipientUserId ?? null,input.targetType==='private' ? 'pending' : null,now()])
    return id
  }
  const createCredential = async (input: { name: string; scopes: string[]; groups: string[] }, actor: Actor) => {
    if (!input.scopes.every(scope => (botScopes as readonly string[]).includes(scope))) throw new AppError('未知权限', 'bot_scope', 400)
    const token = `gwb_${randomBytes(32).toString('hex')}`, id = randomUUID()
    await store.transaction(async tx => {
      await assertAdmin(tx, actor, true)
      await tx.run('INSERT INTO bot_credentials(id,name,secret_hash,scopes,groups_json,created_by,created_at) VALUES(?,?,?,?,?,?,?)',
        [id,input.name,digest(token),JSON.stringify([...new Set(input.scopes)]),JSON.stringify([...new Set(input.groups)]),actor.id,now()])
      const encrypted = vault.seal(id, token)
      if (encrypted) await tx.run('INSERT INTO bot_credential_secrets(credential_id,encrypted_token) VALUES(?,?)', [id,encrypted])
      await enqueueSecurityAudit(tx, actor.username, 'BOT_CREDENTIAL_CREATE', `Bot ${id}; scopes=${input.scopes.join(',')}`)
    })
    return { id, token, name: input.name, scopes: input.scopes, groups: input.groups }
  }
  const listCredentials = async () => ({ vault_enabled: vault.available, items: await store.all(`SELECT c.id,c.name,c.scopes,c.groups_json,c.created_at,c.revoked_at,
    ${options.vaultSchema && vault.available ? "EXISTS(SELECT 1 FROM bot_credential_secrets s WHERE s.credential_id=c.id) AND c.revoked_at IS NULL" : '0'} AS secret_available
    FROM bot_credentials c ORDER BY c.created_at DESC,c.id LIMIT 100`) })
  const revealCredential = (id: string, actor: Actor) => store.transaction(async tx => {
    await assertAdmin(tx, actor, true)
    if (!options.vaultSchema || !vault.available) throw new AppError('请先配置密钥加密存储', 'bot_secret_unavailable', 503)
    const row = await tx.get<{ encrypted_token: string }>(`SELECT s.encrypted_token FROM bot_credential_secrets s JOIN bot_credentials c ON c.id=s.credential_id WHERE c.id=? AND c.revoked_at IS NULL`, [id])
    if (!row) throw new AppError('该凭据未保存可恢复密钥或已撤销，请重新创建', 'bot_secret_missing', 409)
    const token = vault.open(id,row.encrypted_token)
    await enqueueSecurityAudit(tx,actor.username,'BOT_CREDENTIAL_REVEAL',`Bot ${id}`)
    return { id,token }
  })
  const revoke = (id: string, actor: Actor) => store.transaction(async tx => {
    await assertAdmin(tx, actor, true)
    if (!(await tx.run('UPDATE bot_credentials SET revoked_at=? WHERE id=? AND revoked_at IS NULL', [now(),id])).changes) throw new AppError('凭据不存在或已撤销', 'not_found', 404)
    if (options.vaultSchema) await tx.run('DELETE FROM bot_credential_secrets WHERE credential_id=?', [id])
    await tx.run("UPDATE bot_deliveries SET status='cancelled',lease_token=NULL WHERE credential_id=? AND status IN ('pending','failed','sending')", [id])
    await enqueueSecurityAudit(tx, actor.username, 'BOT_CREDENTIAL_REVOKE', `Bot ${id}`)
  })
  let flushing: Promise<{ sent: number; failed: number; skipped: number }> | undefined
  const dispatch = async () => {
    const result = { sent: 0, failed: 0, skipped: 0 }
    if (!options.enabled || options.shutdown.aborted) return result
    await store.run("UPDATE bot_deliveries SET status='failed',last_error='BOT_LEASE_EXHAUSTED',lease_token=NULL WHERE status='sending' AND lease_until<=? AND attempts>=5",[now()])
    if(options.syncSchema)await store.run("UPDATE bot_deliveries SET status='failed',message_status='failed',receipt_error='timeout',last_error='BOT_RECEIPT_TIMEOUT' WHERE target_type='private' AND status='sent' AND message_status='pending' AND delivered_at<=?",[now()-10*60000])
    // A lease survives process death. The receiver must deduplicate delivery_id,
    // since a lost HTTP acknowledgement can still produce at-least-once delivery.
    for (let index = 0; index < 20 && !options.shutdown.aborted; index++) {
      const lease = randomUUID()
      const job = await store.transaction(async tx => {
        const row = await tx.get<Delivery>(`SELECT d.*,n.payload,n.event_name FROM bot_deliveries d JOIN bot_notifications n ON n.id=d.notification_id
          WHERE ((d.status='pending' AND d.next_attempt_at<=?) OR (d.status='sending' AND d.lease_until<=?))
          AND d.attempts<5 ORDER BY d.next_attempt_at,d.id LIMIT 1`, [now(),now()])
        if (!row) return undefined
        await tx.run("UPDATE bot_deliveries SET status='sending',lease_token=?,lease_until=?,attempts=attempts+1 WHERE id=?", [lease,now()+60000,row.id])
        return row
      })
      if (!job) break
      try {
        if (job.credential_id) {
          if(job.target_type==='service' || job.target_type==='private') {
            const client=await store.get<Credential>('SELECT * FROM bot_credentials WHERE id=? AND revoked_at IS NULL',[job.credential_id])
            let allowed=Boolean(client && JSON.parse(client.scopes).includes('members:sync'))
            if(job.target_type==='private') {
              const config=await store.get<{value:string}>('SELECT value FROM member_sync_settings WHERE id=1')
              const settings=config ? JSON.parse(config.value) as {credential_id:string;admin_user_ids:number[]} : undefined
              allowed=allowed && settings?.credential_id===job.credential_id && Boolean(settings?.admin_user_ids.includes(job.recipient_user_id || 0))
                && Boolean(await store.get(`SELECT b.id FROM bot_identities b JOIN users u ON u.id=b.user_id
                  WHERE b.credential_id=? AND b.user_id=? AND b.qq=? AND u.role IN ('admin','super_admin')`,[job.credential_id,job.recipient_user_id ?? null,job.target_id || '']))
            }
            else {
              const data=object(object(JSON.parse(job.payload)).data)
              allowed=allowed && Boolean(await store.get("SELECT id FROM member_sync_requests WHERE id=? AND credential_id=? AND status IN ('queued','collecting') AND expires_at>?",[String(data.request_id),job.credential_id,now()]))
            }
            if(!allowed){await store.run("UPDATE bot_deliveries SET status='cancelled',lease_token=NULL WHERE id=? AND lease_token=?",[job.id,lease]);continue}
          } else {
          const sub = await store.get('SELECT s.id,s.lead_minutes FROM bot_subscriptions s JOIN bot_credentials c ON c.id=s.credential_id WHERE s.id=? AND c.revoked_at IS NULL', [job.subscription_id])
          if (!sub) {
            await store.run("UPDATE bot_deliveries SET status='cancelled',lease_token=NULL WHERE id=? AND lease_token=?", [job.id,lease]); continue
          }
          if (job.event_name.startsWith('reminder.')) {
            const data=object(object(JSON.parse(job.payload)).data)
            const event=await store.get('SELECT status,content FROM events WHERE id=?',[Number(data.eventId)])
            let content: Record<string,unknown> = {}
            try { content=object(JSON.parse(String(event?.content || '{}'))) } catch { /* invalid schedule cancels the job */ }
            const time=parseClubTime(job.event_name==='reminder.deadline' ? content.deadline : content.time)
            if (!event || !['published','ongoing'].includes(String(event.status)) || !Number.isFinite(time) || time<=now()
              || time!==Date.parse(String(data.scheduled_at)) || sub.lead_minutes!==data.lead_minutes) {
              await store.run("UPDATE bot_deliveries SET status='cancelled',lease_token=NULL,last_error='BOT_STALE_REMINDER' WHERE id=? AND lease_token=?",[job.id,lease]); continue
            }
          }
          }
        }
        const transport = createWebhookTransport({ url: options.env.ASTRBOT_WEBHOOK_URL || '', token: options.env.ASTRBOT_TOKEN || '',
          timeoutMs: options.env.ASTRBOT_TIMEOUT_MS, enabled: options.enabled, shutdown: options.shutdown })
        const response = await transport({ ...object(JSON.parse(job.payload)), delivery_id: job.id,
          ...(job.credential_id ? { target: job.target_type==='private' ? {type:'private',bot_id:job.credential_id,qq:job.target_id}
            : job.target_type==='service' ? {type:'service',bot_id:job.credential_id} : { bot_id: job.credential_id, group_id: job.group_id } } : {}) })
        const skipped = 'skipped' in response
        await store.run('UPDATE bot_deliveries SET status=?,delivered_at=?,last_error=?,lease_token=NULL WHERE id=? AND lease_token=?',
          [skipped ? 'skipped' : 'sent',skipped ? null : now(),skipped ? 'BOT_UNCONFIGURED_OR_DISABLED' : null,job.id,lease])
        if (skipped) result.skipped++; else result.sent++
      } catch (error) {
        const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' && /^BOT_[A-Z_]+$/.test(error.code) ? error.code : 'BOT_DELIVERY_FAILED'
        const exhausted = job.attempts + 1 >= 5
        await store.run('UPDATE bot_deliveries SET status=?,next_attempt_at=?,last_error=?,lease_token=NULL WHERE id=? AND lease_token=?',
          [exhausted ? 'failed' : 'pending',now()+Math.min(3600000,1000*2**job.attempts),code,job.id,lease])
        options.report(Object.assign(new Error(code), { code })); result.failed++
      }
    }
    return result
  }
  let reminderCursor = 0
  const reminders = async () => {
    const events = await store.all<{ id: number; type: string; title: string; content: string }>("SELECT id,type,title,content FROM events WHERE id>? AND status IN ('published','ongoing') ORDER BY id LIMIT 100", [reminderCursor])
    reminderCursor = events.length === 100 ? events[events.length-1]!.id : 0
    let queued = 0
    for (const event of events) {
      if (options.shutdown.aborted) break
      let content: Record<string, unknown>
      try { content = object(JSON.parse(event.content || '{}')) } catch { continue }
      const subs = await store.all<Subscription>(`SELECT s.* FROM bot_subscriptions s JOIN bot_credentials c ON c.id=s.credential_id
        WHERE c.revoked_at IS NULL AND s.event_name IN ('reminder.deadline','reminder.start') AND (s.event_id=0 OR s.event_id=?)`, [event.id])
      for (const sub of subs) {
        const time = parseClubTime(sub.event_name === 'reminder.deadline' ? content.deadline : content.time)
        if (!Number.isFinite(time) || now() < time-sub.lead_minutes*60000 || now() >= time) continue
        await enqueue(sub.event_name, { eventId: event.id, type: event.type, title: event.title, scheduled_at: new Date(time).toISOString(), subscription_id: sub.id,lead_minutes:sub.lead_minutes }, null, undefined,
          `reminder:${event.id}:${sub.event_name}:${time}:${sub.id}:${sub.lead_minutes}`)
        queued++
      }
    }
    return { queued }
  }
  const identity = async (credential: Credential, qq: string, executor: SqlExecutor = store) => {
    const bound = await executor.get<BotIdentity>('SELECT id,user_id,qq,credential_id FROM bot_identities WHERE credential_id=? AND qq=?', [credential.id,qq])
    if (!bound) throw new AppError('请先在网站生成绑定码并完成绑定', 'bot_not_bound', 403)
    return bound
  }
  return { enqueue,enqueueDirected, authenticate, createCredential, listCredentials, revealCredential, revoke, identity, reminders,
    flush() { if (!flushing) flushing = dispatch().finally(() => { flushing = undefined }); return flushing },
    async retry(id: string, credential?: Credential, tx: SqlExecutor = store) {
      if (credential) await assertCredential(tx,credential,'deliveries:retry')
      const result = await tx.run(`UPDATE bot_deliveries SET status='pending',attempts=0,next_attempt_at=?,last_error=NULL,lease_token=NULL${options.syncSchema ? ",message_status=CASE WHEN target_type='private' THEN 'pending' ELSE message_status END,receipt_error=NULL" : ''}
        WHERE id=? AND status IN ('failed','skipped') ${credential ? 'AND credential_id=?' : ''}`, credential ? [now(),id,credential.id] : [now(),id])
      if (!result.changes) throw new AppError('记录不存在或当前状态不允许重发', 'bot_retry_conflict', 409)
    },
  }
}
export async function assertAdmin(tx: SqlExecutor, actor: Actor, superOnly = false) {
  if (actor.token_version !== undefined || actor.user_token_version !== undefined) await authorizeSecurityActor(tx,actor,superOnly)
  const row = await tx.get('SELECT role,auth_version FROM users WHERE id=?', [actor.id])
  if (!row || !(superOnly ? ['super_admin'] : ['admin','super_admin']).includes(String(row.role))
    || (actor.user_token_version !== undefined && Number(actor.user_token_version) !== row.auth_version)) throw new AppError('管理员权限已失效', 'bot_admin_revoked', 403)
}
export type BotPlatform = ReturnType<typeof createBotPlatform>
