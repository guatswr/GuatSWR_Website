import { createRequire } from 'node:module'
import type { DatabaseStore } from '../database/contracts.js'

const bcrypt = createRequire(__filename)('bcryptjs') as { hash(value: string, rounds: number): Promise<string> }
export async function bootstrapAdministrator(store: DatabaseStore, username: unknown, password: unknown) {
  if (typeof username !== 'string' || !/^[a-zA-Z0-9_-]{1,50}$/.test(username)
    || typeof password !== 'string' || password.length < 6 || password.length > 100 || Buffer.byteLength(password, 'utf8') > 72) {
    throw new Error('BOOTSTRAP_CREDENTIALS')
  }
  // Hash outside the write transaction; never reset credentials or promote an existing user.
  const hash = await bcrypt.hash(password, 10)
  return store.transaction(async tx => {
    if (tx.dialect === 'postgres') await tx.get('SELECT pg_advisory_xact_lock(57123,1)')
    const existing = await tx.get("SELECT role FROM users WHERE username = $1", [username])
    if (existing) {
      if (existing.role === 'super_admin') return 'unchanged' as const
      throw new Error('BOOTSTRAP_USER_EXISTS')
    }
    if (await tx.get("SELECT id FROM users WHERE role = 'super_admin' LIMIT 1")) throw new Error('BOOTSTRAP_ADMIN_EXISTS')
    await tx.run("INSERT INTO users (username, password, role) VALUES ($1, $2, $3) RETURNING id", [username, hash, 'super_admin'])
    return 'created' as const
  })
}
