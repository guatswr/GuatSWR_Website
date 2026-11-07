import { idBinding } from '../../../database/sql.js'
import { utcTimestamp, lockRow } from '../../../database/sql.js'
import type { Row, SqlExecutor, DatabaseStore } from '../../../database/contracts.js'

export interface Identity { userId: number | null; visitorIp: string | null; botIdentityId?: string }
export interface EventRow extends Row { id: number; type: string; status: string; content: string | null }
export interface SignupInput { common_id: string; machine_sign: string; pilot_source: string; qq: string; avatar: string }
const queries = (db: SqlExecutor) => ({
  executor: db,
  event: (id: number) => db.get<EventRow>(lockRow(db, "SELECT id, type, status, content FROM events WHERE id = $1"), [idBinding(id)]),
  save: (id: number, identity: Identity, input: SignupInput) => identity.botIdentityId ? db.run(`
    INSERT INTO event_participants(event_id,bot_identity_id,common_id,machine_sign,pilot_source,qq,avatar)
    VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(event_id,bot_identity_id) DO UPDATE SET common_id=excluded.common_id,
    machine_sign=excluded.machine_sign,pilot_source=excluded.pilot_source,qq=excluded.qq,avatar=excluded.avatar,updated_at=${utcTimestamp(db)} RETURNING id`,
    [idBinding(id),identity.botIdentityId,input.common_id,input.machine_sign,input.pilot_source,input.qq,input.avatar]) : db.run(`
    INSERT INTO event_participants (event_id, user_id, visitor_ip, common_id, machine_sign, pilot_source, qq, avatar)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    ON CONFLICT(event_id, ${identity.userId ? 'user_id' : 'visitor_ip'}) DO UPDATE SET
      common_id = excluded.common_id, machine_sign = excluded.machine_sign,
      pilot_source = excluded.pilot_source, qq = excluded.qq, avatar = excluded.avatar,
      ${identity.userId ? 'visitor_ip = excluded.visitor_ip,' : ''}
      updated_at = ${utcTimestamp(db)}
  `, [idBinding(id), identity.userId, identity.visitorIp, input.common_id, input.machine_sign, input.pilot_source, input.qq, input.avatar]),
  find: (id: number, identity: Identity) => db.get(`SELECT * FROM event_participants WHERE event_id = $1 AND ${identity.botIdentityId ? 'bot_identity_id' : identity.userId ? 'user_id' : 'visitor_ip'} = $2`, [idBinding(id), identity.botIdentityId || identity.userId || identity.visitorIp]),
  remove: (id: number, identity: Identity) => db.run(`DELETE FROM event_participants WHERE event_id = $1 AND ${identity.botIdentityId ? 'bot_identity_id' : identity.userId ? 'user_id' : 'visitor_ip'} = $2`, [idBinding(id), identity.botIdentityId || identity.userId || identity.visitorIp]),
  list: (id: number) => db.all("SELECT * FROM event_participants WHERE event_id = $1 ORDER BY created_at ASC NULLS FIRST", [idBinding(id)])
})
export function createSignupRepository(db: DatabaseStore) {
  return { ...queries(db), transaction: <T>(work: (repository: ReturnType<typeof queries>) => Promise<T>, executor?: SqlExecutor) => executor ? work(queries(executor)) : db.transaction(tx => work(queries(tx))) }
}
export type SignupRepository = ReturnType<typeof createSignupRepository>
