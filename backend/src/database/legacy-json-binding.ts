import type { SqlValue } from './sqlite.js'
// Preserve sqlite3's native parameter coercion for legacy JSON/query inputs.
// Objects AND arrays use this fixed text, never JavaScript String(array).
export function legacyJsonBinding(value: unknown): SqlValue {
  if (typeof value === 'boolean') return Number(value)
  if (typeof value === 'string' || typeof value === 'number' || Buffer.isBuffer(value)) return value
  return value && typeof value === 'object' ? '[object Object]' : null
}
