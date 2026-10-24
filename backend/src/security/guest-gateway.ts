import { createHash, timingSafeEqual } from 'node:crypto'
import { isIP } from 'node:net'
interface Request {
  user?: { role: string }; headers: Record<string, unknown>; socket: { remoteAddress?: string }
  app: { get(name: string): ((ip: string | undefined, hop: number) => boolean) | undefined }
}
interface Response { setHeader(name: string, value: string): void; status(code: number): Response; json(body: unknown): unknown }
export function createGuestGateway(secret: string) {
  const key = Buffer.from(secret), expected = createHash('sha256').update(key).digest()
  return (request: Request, response: Response, next: () => void) => {
    response.setHeader('Cache-Control', 'private, no-store')
    if (request.user && ['admin', 'super_admin'].includes(request.user.role)) return next()
    if (key.length < 32 || key.length > 256) return response.status(503).json({ message: '访客入口暂时不可用' })
    const supplied = request.headers['x-bff-bridge']
    if (typeof supplied !== 'string' || supplied.length > 1024 || !timingSafeEqual(expected, createHash('sha256').update(supplied).digest())) return response.status(403).json({ message: '请通过站点访客入口操作' })
    const trust = request.app.get('trust proxy fn')
    if (!trust?.(request.socket.remoteAddress, 0)) return response.status(503).json({ message: '访客代理配置暂不可用' })
    const ip = request.headers['x-forwarded-for']
    if (typeof ip !== 'string' || ip.length > 128 || !isIP(ip)) return response.status(400).json({ message: '访客地址无效' })
    return next()
  }
}
