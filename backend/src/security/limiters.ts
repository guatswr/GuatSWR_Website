import { createRequire } from 'node:module'
interface Request { path: string; ip: string }
interface Response { status(code: number): Response; json(body: unknown): unknown }
type Handler = (request: Request, response: Response, next: (error?: unknown) => void) => unknown
interface Store { shutdown(): void }
interface Options {
  store: Store; windowMs: number; max: number; standardHeaders: boolean; legacyHeaders: boolean
  skip?(request: Request): boolean
  handler?(request: Request, response: Response): void
  message?: { message: string }
}
const rateLimit = createRequire(__filename)('express-rate-limit') as {
  (options: Options): Handler; MemoryStore: new () => Store
}
export function createLimiters(options: {
  banMinutes: number; globalRateLimit: number; dispose(callback: () => void): void
  ban(ip: string, reason: string, operator: string, expires: number): Promise<void>; report(error: unknown): void
}) {
  const store = () => { const value = new rateLimit.MemoryStore(); options.dispose(() => value.shutdown()); return value }
  const limiter = (windowMs: number, max: number, message: string) => rateLimit({ store: store(), windowMs, max, standardHeaders: true, legacyHeaders: false, message: { message } })
  return {
    globalLimiter: rateLimit({ store: store(), windowMs: 60000, max: options.globalRateLimit, standardHeaders: true, legacyHeaders: false,
      skip: request => request.path.startsWith('/api/bot'),
      handler: (request, response) => {
        void options.ban(request.ip, 'rate-limit', 'ATRI', Date.now() + options.banMinutes * 60000).catch(options.report)
        response.status(429).json({ message: '请求过于频繁，请稍后再试' })
      }
    }),
    authLimiter: limiter(900000, 120, '请求过于频繁，请稍后再试'),
    loginLimiter: limiter(60000, 10, '登录过于频繁，请稍后再试'),
    uploadLimiter: limiter(60000, 30, '上传过于频繁，请稍后再试')
  }
}
