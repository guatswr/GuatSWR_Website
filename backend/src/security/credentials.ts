import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { createRequire } from 'node:module'

const bcrypt = createRequire(__filename)('bcryptjs') as {
  hashSync(value: string, rounds: number): string
  compareSync(value: string, hash: string): boolean
}
export const hashPassword = (password: string) => bcrypt.hashSync(password, 10)
export const comparePassword = (password: string, hash: string) => bcrypt.compareSync(password, hash)

// Preserve the existing IV:base64 CBC format and key derivation during migration,
// while supporting candidate keys for seamless secret rotation and migration.
export function createSecondPasswordCodec(secretInput: string | string[]) {
  const secrets = (Array.isArray(secretInput) ? secretInput : [secretInput])
    .flatMap(s => (typeof s === 'string' ? s.split(',') : []))
    .map(s => s.trim())
    .filter(Boolean)
  const primarySecret = secrets[0] || ''
  const primaryKey = createHash('sha256').update(primarySecret).digest()
  const candidateKeys = secrets.map(s => createHash('sha256').update(s).digest())
  return {
    encrypt(value: string): string {
      const iv = randomBytes(16), cipher = createCipheriv('aes-256-cbc', primaryKey, iv)
      return `${iv.toString('base64')}:${cipher.update(value, 'utf8', 'base64') + cipher.final('base64')}`
    },
    decrypt(payload: unknown): string | null {
      if (!payload || typeof payload !== 'string') return null
      const [iv, encrypted] = payload.split(':')
      if (!iv || !encrypted) return null
      let lastError: unknown = null
      for (const key of candidateKeys) {
        try {
          const decipher = createDecipheriv('aes-256-cbc', key, Buffer.from(iv, 'base64'))
          return decipher.update(encrypted, 'base64', 'utf8') + decipher.final('utf8')
        } catch (error) {
          lastError = error
        }
      }
      if (lastError) throw lastError
      return null
    }
  }
}
