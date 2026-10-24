import { createRequire } from 'node:module'
import type { Row, SqliteStore } from '../database/sqlite.js'
import { readVersion } from './service.js'

interface Actor extends Record<string, unknown> { id: number; username: string; role: string }
interface Request { headers: { authorization?: string }; user?: Actor }
interface Response { status(code: number): Response; json(body: unknown): unknown }
type Next = (error?: unknown) => void
const jwt = createRequire(__filename)('jsonwebtoken') as {
  verify(token: string, key: string, callback: (error: Error | null, claims?: unknown) => void): void
}
export function createIdentityMiddleware(store: SqliteStore, secret: string) {
  if (!secret) throw new Error('JWT_SECRET is required')
  const expired = (res: Response) => res.status(401).json({ message: '会话已失效，请重新登录' })
  const verifyIdentity = async (req: Request, res: Response, next: Next, raw: unknown) => {
    if (!raw || typeof raw !== 'object' || !('id' in raw) || !Number.isSafeInteger(raw.id) || Number(raw.id) <= 0) return expired(res)
    const claims = raw as Record<string, unknown>
    try {
      const user = await store.get<Row & Actor>(`SELECT id,username,role,
        (SELECT value FROM site_config WHERE key='token_version') AS current_token_version FROM users WHERE id=?`, [Number(claims.id)])
      if (!user) return expired(res)
      if (readVersion(user.current_token_version) !== readVersion(claims.token_version)) return expired(res)
      req.user = { ...claims, id: user.id, username: user.username, role: user.role }
    } catch { return res.status(503).json({ message: '认证暂时不可用' }) }
    return next()
  }
  const authenticate = (optional: boolean) => (req: Request, res: Response, next: Next) => {
    const token = req.headers.authorization?.split(' ')[1]
    if (!token) return optional ? next() : res.status(401).json({ message: '未登录' })
    jwt.verify(token, secret, (error, claims) => {
      if (error) return optional ? next() : res.status(403).json({ message: 'Token 无效' })
      void verifyIdentity(req, res, next, claims).catch(next)
    })
  }
  const requireRole = (roles: string[]) => (req: Request, res: Response, next: Next) => req.user && roles.includes(req.user.role)
    ? next() : res.status(403).json({ message: '权限不足' })
  return { authenticateToken: authenticate(false), optionalAuth: authenticate(true), requireSuperAdmin: requireRole(['super_admin']), requireAdmin: requireRole(['super_admin', 'admin']) }
}
