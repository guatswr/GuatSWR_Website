import { DatabaseSync } from 'node:sqlite'
import { mkdirSync, chmodSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

/** Single-process durable capabilities. No raw cookies or plaintext tokens on disk. */
export function durableRecords<T>(namespace: string, secret: Buffer): Map<string, T> {
  const root = process.env.BFF_STATE_DIR
  if (!root) return new Map<string, T>()
  mkdirSync(root, { recursive: true, mode: 0o700 })
  chmodSync(root, 0o700)
  const filename = join(resolve(root), createHash('sha256').update(namespace).update(secret).digest('hex') + '.sqlite')
  const db = new DatabaseSync(filename)
  chmodSync(filename, 0o600)
  db.exec('PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS records (key TEXT PRIMARY KEY, value BLOB NOT NULL)')
  const key = createHash('sha256').update('guatswr:durable-records:v1').update(namespace).update(secret).digest()
  const seal = (id: string, value: T) => {
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', key, iv)
    cipher.setAAD(Buffer.from(id))
    return Buffer.concat([iv, cipher.update(JSON.stringify(value)), cipher.final(), cipher.getAuthTag()])
  }
  const open = (id: string, raw: Uint8Array): T => {
    const data = Buffer.from(raw)
    const cipher = createDecipheriv('aes-256-gcm', key, data.subarray(0, 12))
    cipher.setAAD(Buffer.from(id))
    cipher.setAuthTag(data.subarray(-16))
    return JSON.parse(Buffer.concat([cipher.update(data.subarray(12, -16)), cipher.final()]).toString()) as T
  }
  class Records extends Map<string, T> {
    override set(id: string, value: T): this {
      db.prepare('INSERT OR REPLACE INTO records VALUES (?,?)').run(id, seal(id, value))
      return super.set(id, value)
    }
    override delete(id: string): boolean {
      db.prepare('DELETE FROM records WHERE key=?').run(id)
      return super.delete(id)
    }
    override clear(): void {
      db.exec('DELETE FROM records')
      super.clear()
    }
  }
  const records = new Records()
  for (const row of db.prepare('SELECT key,value FROM records').all()) {
    // Authentication/corruption errors fail closed; never silently reset capabilities.
    Map.prototype.set.call(records, String(row.key), open(String(row.key), row.value as Uint8Array))
  }
  return records
}
