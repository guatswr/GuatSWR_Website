import { configSchema, backendV1Error } from '@guatswr/shared/backend-v1'
import { AppError } from '../../errors.js'
import type { ConfigActor, ConfigService } from './service.js'

// The Express shim supplies only these HTTP capabilities; no framework casts or any.
interface Request { body?: unknown; user?: ConfigActor }
interface Response { status(code: number): Response; json(body: unknown): unknown }
export function createConfigController(service: ConfigService, reportFailure: (error: unknown) => void) {
  const fail = (response: Response, error: unknown) => {
    if (error instanceof AppError) return response.status(error.status).json({ message: error.message })
    reportFailure(error)
    return response.status(500).json({ message: '服务器错误' })
  }
  return {
    read: async (request: Request, response: Response): Promise<unknown> => {
      try { return response.json(await service.read(request.user?.role)) }
      catch (error) { return fail(response, error) }
    },
    write: async (request: Request, response: Response): Promise<unknown> => {
      if (!request.user) return response.status(401).json({ message: '未登录' })
      const parsed = configSchema.safeParse(request.body, { error: backendV1Error })
      if (!parsed.success) return response.status(400).json({ message: parsed.error.issues[0]?.message || '参数错误' })
      try {
        await service.write(parsed.data, request.user)
        return response.json({ message: '已保存' })
      } catch (error) { return fail(response, error) }
    }
  }
}
