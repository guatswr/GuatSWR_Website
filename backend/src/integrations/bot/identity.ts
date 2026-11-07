import { randomBytes, randomUUID } from 'node:crypto'
import type { SqlExecutor, DatabaseStore } from '../../database/contracts.js'
import type { Actor } from '../../modules/actor.js'
import { AppError } from '../../errors.js'
import { assertCredential, digest, type BotIdentity, type Credential } from './platform.js'
import { enqueueSecurityAudit } from '../../security/audit-outbox.js'

export const ownerHash = (owner: unknown) => {
  if (typeof owner !== 'string' || !/^[a-f0-9]{64}$/.test(owner)) throw new AppError('缺少网站会话的随机 Bot owner 标识', 'bot_owner_required', 400)
  return digest(owner)
}
export function createBotIdentityService(store: DatabaseStore, now: () => number = Date.now) {
  return {
    issue: (actor: Actor | undefined, owner: unknown) => store.transaction(async tx => {
      const hash = actor ? null : ownerHash(owner)
      let identity = await tx.get<BotIdentity>(`SELECT * FROM bot_identities WHERE ${actor ? 'user_id=$1' : 'owner_hash=$1'}`, [actor ? actor.id : hash])
      if (!identity) {
        const id = randomUUID()
        await tx.run("INSERT INTO bot_identities(id,owner_hash,user_id,created_at) VALUES($1,$2,$3,$4)", [id,hash,actor?.id ?? null,now()])
        identity = { id, user_id: actor?.id ?? null, qq: null, credential_id: null }
      }
      await tx.run("DELETE FROM bot_link_codes WHERE identity_id=$1 OR expires_at<=$2", [identity.id,now()])
      const code = randomBytes(16).toString('hex'), expires = now()+5*60000
      await tx.run("INSERT INTO bot_link_codes(code_hash,identity_id,expires_at) VALUES($1,$2,$3)", [digest(code),identity.id,expires])
      return { code, expires_at: expires }
    }),
    consume: (credential: Credential, code: string, qq: string) => store.transaction(async tx => {
      await assertCredential(tx,credential,'identity:write')
      const row = await tx.get<{ identity_id: string }>("SELECT identity_id FROM bot_link_codes WHERE code_hash=$1 AND expires_at>$2", [digest(code),now()])
      if (!row) throw new AppError('绑定码无效或已过期', 'bot_code_invalid', 400)
      const existing = await tx.get("SELECT id FROM bot_identities WHERE (credential_id=$1 AND qq=$2) OR (id=$3 AND qq IS NOT NULL)", [credential.id,qq,row.identity_id])
      if (existing) throw new AppError('身份已绑定，请先在网站解除绑定', 'bot_binding_conflict', 409)
      await tx.run("UPDATE bot_identities SET credential_id=$1,qq=$2 WHERE id=$3", [credential.id,qq,row.identity_id])
      await tx.run("DELETE FROM bot_link_codes WHERE identity_id=$1", [row.identity_id])
      await enqueueSecurityAudit(tx, `bot:${credential.id}`, 'BOT_IDENTITY_BIND', `identity=${row.identity_id}`)
      return { bound: true }
    }),
    unbind: (actor: Actor | undefined, owner: unknown) => store.transaction(async tx => {
      const row = await tx.get<BotIdentity>(`SELECT * FROM bot_identities WHERE ${actor ? 'user_id=$1' : 'owner_hash=$1'}`, [actor ? actor.id : ownerHash(owner)])
      if (!row) throw new AppError('绑定不存在', 'not_found', 404)
      await tx.run("UPDATE bot_identities SET qq=NULL,credential_id=NULL WHERE id=$1", [row.id])
      await tx.run("DELETE FROM bot_link_codes WHERE identity_id=$1", [row.id])
      await enqueueSecurityAudit(tx, actor?.username || 'Website visitor', 'BOT_IDENTITY_UNBIND', `identity=${row.id}`)
      return { bound: false }
    }),
    websiteIdentity: async (owner: unknown, executor: SqlExecutor = store) => {
      const row = await executor.get<BotIdentity>("SELECT id,user_id,qq,credential_id FROM bot_identities WHERE owner_hash=$1", [ownerHash(owner)])
      if (!row) throw new AppError('请先初始化网站 Bot 绑定身份','bot_owner_unknown',400)
      return row.id
    },
  }
}
