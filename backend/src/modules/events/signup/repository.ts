import type { Row, SqlExecutor, SqliteStore } from '../../../database/sqlite.js'

export interface Identity { userId: number | null; visitorIp: string }
export interface EventRow extends Row { id: number; type: string; status: string; content: string | null }
export interface SignupInput { common_id: string; machine_sign: string; pilot_source: string; qq: string; avatar: string }
const queries = (db: SqlExecutor) => ({
  event: (id: number) => db.get<EventRow>('SELECT id, type, status, content FROM events WHERE id = ?', [id]),
  save: (id: number, identity: Identity, input: SignupInput) => db.run(`
    INSERT INTO event_participants (event_id, user_id, visitor_ip, common_id, machine_sign, pilot_source, qq, avatar)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(event_id, ${identity.userId ? 'user_id' : 'visitor_ip'}) DO UPDATE SET
      common_id = excluded.common_id, machine_sign = excluded.machine_sign,
      pilot_source = excluded.pilot_source, qq = excluded.qq, avatar = excluded.avatar,
      ${identity.userId ? 'visitor_ip = excluded.visitor_ip,' : ''}
      updated_at = CURRENT_TIMESTAMP
  `, [id, identity.userId, identity.visitorIp, input.common_id, input.machine_sign, input.pilot_source, input.qq, input.avatar]),
  find: (id: number, identity: Identity) => db.get(`SELECT * FROM event_participants WHERE event_id = ? AND ${identity.userId ? 'user_id' : 'visitor_ip'} = ?`, [id, identity.userId || identity.visitorIp]),
  remove: (id: number, identity: Identity) => db.run(`DELETE FROM event_participants WHERE event_id = ? AND ${identity.userId ? 'user_id' : 'visitor_ip'} = ?`, [id, identity.userId || identity.visitorIp]),
  list: (id: number) => db.all('SELECT * FROM event_participants WHERE event_id = ? ORDER BY created_at ASC', [id])
})
export function createSignupRepository(db: SqliteStore) {
  return { ...queries(db), transaction: <T>(work: (repository: ReturnType<typeof queries>) => Promise<T>, executor?: SqlExecutor) => executor ? work(queries(executor)) : db.transaction(tx => work(queries(tx))) }
}
export type SignupRepository = ReturnType<typeof createSignupRepository>
