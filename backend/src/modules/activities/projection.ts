export function normalizeActivityImages(value: unknown): unknown {
  if (!value) return []
  if (Array.isArray(value)) return value
  if (typeof value === 'string') {
    try { return JSON.parse(value) } catch { return [] }
  }
  return []
}
export function pagination(query: Record<string, unknown>) {
  const page = Math.max(1, Number.parseInt(String(query.page), 10) || 1)
  const limit = Math.min(100, Math.max(1, Number.parseInt(String(query.limit), 10) || 20))
  return { page, limit, offset: (page - 1) * limit }
}
