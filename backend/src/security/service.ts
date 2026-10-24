import type { Row, SqlExecutor } from '../database/sqlite.js'

export function readVersion(value: unknown): number {
  if (value === null || value === undefined) return 0
  if (!/^\d+$/.test(String(value))) throw new Error('Invalid token version')
  const version = Number(value)
  if (!Number.isSafeInteger(version) || version < 0) throw new Error('Invalid token version')
  return version
}
export function createSecurityService(store: Pick<SqlExecutor, 'get'>) {
  return {
    readVersion,
    incrementVersion: async () => {
      const row = await store.get(`INSERT INTO site_config (key,value) VALUES ('token_version','1')
        ON CONFLICT(key) DO UPDATE SET value=CAST(CAST(site_config.value AS INTEGER)+1 AS TEXT)
        WHERE site_config.value != '' AND site_config.value NOT GLOB '*[^0-9]*'
          AND CAST(site_config.value AS INTEGER) BETWEEN 0 AND 9007199254740990
        RETURNING value`)
      if (!row) throw new Error('Invalid token version')
      return readVersion(row.value)
    },
    deleteAdmin: (id: string | number, actorId: number) => store.get<Row & { username: string }>(`DELETE FROM users
      WHERE id=? AND id<>? AND EXISTS(SELECT 1 FROM users WHERE id=? AND role='super_admin')
        AND (COALESCE(role,'')<>'super_admin' OR (SELECT count(*) FROM users WHERE role='super_admin')>1)
      RETURNING username`, [id, actorId, actorId]),
    recordFailure: async (ip: string, now: number) => {
      const attempt = await store.get<Row & { count: number; lock_until: number }>(`INSERT INTO login_attempts(ip,count,lock_until,updated_at) VALUES (?,1,0,?)
        ON CONFLICT(ip) DO UPDATE SET
          count=MIN(CASE WHEN login_attempts.lock_until>0 AND login_attempts.lock_until<=? THEN 1 ELSE login_attempts.count+1 END,5),
          lock_until=CASE WHEN (CASE WHEN login_attempts.lock_until>0 AND login_attempts.lock_until<=? THEN 1 ELSE login_attempts.count+1 END)>=5 THEN ? ELSE 0 END,
          updated_at=?
        RETURNING count,lock_until`, [ip, now, now, now, now + 60000, now])
      if (!attempt) throw new Error('Login attempt unavailable')
      return attempt
    }
  }
}
export type SecurityService = ReturnType<typeof createSecurityService>
