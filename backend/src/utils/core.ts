import { backendV1Error } from '@guatswr/shared/backend-v1'

export function safeJsonParse(value: unknown): unknown {
  if (!value) return []
  try { return JSON.parse(String(value)) } catch { return [] }
}
export function normalizeImages(value: unknown): unknown {
  if (!value) return []
  if (Array.isArray(value)) return value
  return typeof value === 'string' ? safeJsonParse(value) : []
}
interface Schema<T> {
  safeParse(value: unknown, options: { error: typeof backendV1Error }):
    { success: true; data: T } | { success: false; error: { issues?: readonly { message?: string }[] } }
}
export function validate<T>(schema: Schema<T>, value: unknown): { ok: true; data: T } | { ok: false; error: string } {
  const parsed = schema.safeParse(value, { error: backendV1Error })
  return parsed.success ? { ok: true, data: parsed.data } : { ok: false, error: parsed.error.issues?.[0]?.message || '参数错误' }
}
