import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { AppError } from '../../errors.js'

export function createBotSecretVault(raw: string | undefined, schemaReady: boolean) {
  if (raw && (!/^[a-f0-9]{64}$/i.test(raw) || !schemaReady)) throw Object.assign(new Error('BOT_VAULT_CONFIGURATION'), { code: 'BOT_VAULT_CONFIGURATION' })
  const key = raw ? Buffer.from(raw, 'hex') : null
  return {
    available: Boolean(key),
    seal(id: string, token: string) {
      if (!key) return null
      const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv)
      cipher.setAAD(Buffer.from(id))
      const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()])
      return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ciphertext.toString('base64url')].join('.')
    },
    open(id: string, envelope: string) {
      try {
        if (!key) throw new Error()
        const [version, iv, tag, ciphertext, extra] = envelope.split('.')
        if (version !== 'v1' || !iv || !tag || !ciphertext || extra !== undefined) throw new Error()
        const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'))
        decipher.setAAD(Buffer.from(id)); decipher.setAuthTag(Buffer.from(tag, 'base64url'))
        const token = Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]).toString('utf8')
        if (!/^gwb_[a-f0-9]{64}$/.test(token)) throw new Error()
        return token
      } catch { throw new AppError('密钥无法读取，请检查加密配置或重新创建凭据', 'bot_secret_unavailable', 503) }
    },
  }
}
