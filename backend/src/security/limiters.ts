import { createRequire } from 'node:module'
interface Request { path: string; ip: string; socket: { remoteAddress?: string } }
interface Response { status(code: number): Response; json(body: unknown): unknown }
type Handler = (request: Request, response: Response, next: (error?: unknown) => void) => unknown
interface Store { shutdown(): void }
interface Options {
  store: Store; windowMs: number; max: number; standardHeaders: boolean; legacyHeaders: boolean
  skip?(request: Request): boolean
  keyGenerator?(request: Request): string
  handler?(request: Request, response: Response): void
  message?: { message: string }
}
const rateLimit = createRequire(__filename)('express-rate-limit') as {
  (options: Options): Handler; MemoryStore: new () => Store
}
export function createLimiters(options: {
  banMinutes: number; globalRateLimit: number; sharedProxyRateLimit: number
  trustProxy: false | ((address: string) => boolean); dispose(callback: () => void): void
  ban(ip: string, reason: string, operator: string, expires: number): Promise<void>; report(error: unknown): void
}) {
  const store = () => { const value = new rateLimit.MemoryStore(); options.dispose(() => value.shutdown()); return value }
  const limiter = (windowMs: number, max: number, message: string) => rateLimit({ store: store(), windowMs, max, standardHeaders: true, legacyHeaders: false, message: { message } })
  const skip = (request: Request) => request.path.startsWith('/api/bot')
  // Public cache fills and image reads intentionally carry no visitor identity.
  // A trusted peer that still resolves to a trusted proxy is shared traffic:
  // bound its aggregate rate without adding that infrastructure IP to the ban DB.
  const sharedProxyLimiter = rateLimit({ store: store(), windowMs: 60000, max: options.sharedProxyRateLimit,
    keyGenerator: request => request.socket.remoteAddress ?? request.ip,
    standardHeaders: true, legacyHeaders: false, skip, message: { message: '公开服务请求繁忙，请稍后再试' } })
  const visitorLimiter = rateLimit({ store: store(), windowMs: 60000, max: options.globalRateLimit,
    standardHeaders: true, legacyHeaders: false, skip,
    handler: (request, response) => {
      void options.ban(request.ip, 'rate-limit', 'ATRI', Date.now() + options.banMinutes * 60000).catch(options.report)
      response.status(429).json({ message: '请求过于频繁，请稍后再试' })
    }
  })
  return {
    globalLimiter: ((request, response, next) => {
      const peer = request.socket.remoteAddress, trust = options.trustProxy
      const shared = trust && peer && trust(peer) && trust(request.ip)
      return (shared ? sharedProxyLimiter : visitorLimiter)(request, response, next)
    }) satisfies Handler,
    authLimiter: limiter(900000, 120, '请求过于频繁，请稍后再试'),
    loginLimiter: limiter(60000, 10, '登录过于频繁，请稍后再试'),
    uploadLimiter: limiter(60000, 30, '上传过于频繁，请稍后再试')
  }
}
