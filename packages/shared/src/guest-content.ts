export const GUEST_MAX_CONTENT_BYTES = 48 * 1024
export const GUEST_MAX_STRING_LENGTH = 5_000
export const GUEST_MAX_CONTENT_DEPTH = 4
const persons: ReadonlySet<string> = new Set(['initiator', 'a', 'b'])
const protectedKeys: ReadonlySet<string> = new Set([
  'id', 'status', 'results', 'result', 'results_updated_at', 'settlement', 'completion', 'rewarded', 'penalty_result',
  'created_by', 'created_by_name', 'created_by_avatar', 'updated_by', 'updated_by_name', 'updated_by_avatar',
  'created_at', 'updated_at', 'deleted_at', 'visitor_ip', 'user_id'
])
const withinBounds = (value: unknown, depth = 0, personId = false): boolean => {
  if (depth > GUEST_MAX_CONTENT_DEPTH) return false
  if (typeof value === 'string') return value.length <= GUEST_MAX_STRING_LENGTH
  if (Array.isArray(value)) return value.length <= 32 && value.every(item => withinBounds(item, depth + 1))
  if (value && typeof value === 'object') {
    const entries = Object.entries(value)
    if (entries.length > 32) return false
    return entries.every(([key, child]) => (!protectedKeys.has(key) || (key === 'id' && personId)) && withinBounds(child, depth + 1, persons.has(key)))
  }
  return true
}
/** Shared security constraints; catalogue/form completeness remains a separate rule. */
export function validateGuestContent(value: unknown): 'too_large' | 'invalid' | undefined {
  try {
    const serialized = JSON.stringify(value)
    if (serialized && new TextEncoder().encode(serialized).byteLength > GUEST_MAX_CONTENT_BYTES) return 'too_large'
    return withinBounds(value) ? undefined : 'invalid'
  } catch { return 'invalid' }
}
