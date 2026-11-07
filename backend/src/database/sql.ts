import type { SqlExecutor, SqlValue } from './contracts.js'
import { DatabaseError } from './contracts.js'

export const utcTimestamp = (db: Pick<SqlExecutor, 'dialect'>) => db.dialect === 'postgres'
  ? "to_char(statement_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS')" : 'CURRENT_TIMESTAMP'
export const lockRow = (db: SqlExecutor, sql: string) => db.dialect === 'postgres' ? sql + ' FOR UPDATE' : sql
export const placeholders = (count: number, offset = 0) => Array.from({ length: count }, (_, i) => `$${i + offset + 1}`).join(',')
export function idBinding(value: unknown): number | null {
  if (typeof value === 'number') return Number.isSafeInteger(value) ? value : null
  if (typeof value !== 'string' || !/^\s*[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?\s*$/.test(value)) return null
  const id = Number(value)
  return Number.isSafeInteger(id) ? id : null
}
export function likeExpression(db: SqlExecutor, column: string, index: number) {
  const value = `$${index}`
  return db.dialect === 'postgres'
    ? `translate(${column},'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz') LIKE translate(${value},'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz') ESCAPE ''`
    : `${column} LIKE ${value}`
}
export function tableNames(db: SqlExecutor) {
  return db.dialect === 'postgres'
    ? db.all<{ name: string }>('SELECT tablename AS name FROM pg_catalog.pg_tables WHERE schemaname=$1', [db.schema || 'main'])
    : db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table'")
}
export function findTable(db: SqlExecutor, name: string) {
  return db.dialect === 'postgres'
    ? db.get<{ name: string }>('SELECT tablename AS name FROM pg_catalog.pg_tables WHERE schemaname=$1 AND tablename=$2', [db.schema || 'main', name])
    : db.get<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' AND name=?", [name])
}

/** SQLite supports native $n names, but array binds follow appearance order.
 * Bind by name so $2 before $1 and repeated parameters have PostgreSQL semantics.
 * This scans tokens only; SQL text is never rewritten or translated. */
export function sqliteBindings(sql: string, params: readonly SqlValue[]): SqlValue[] | Record<string, SqlValue> {
  const names = new Set<number>()
  for (let i = 0; i < sql.length;) {
    const char = sql[i]!
    if (char === "'" || char === '"' || char === '`' || char === '[') {
      const end = char === '[' ? ']' : char
      i++
      while (i < sql.length) {
        if (sql[i++] === end) { if (sql[i] === end) i++; else break }
      }
    } else if (sql.startsWith('--', i)) {
      const end = sql.indexOf('\n', i + 2); i = end < 0 ? sql.length : end + 1
    } else if (sql.startsWith('/*', i)) {
      const end = sql.indexOf('*/', i + 2); i = end < 0 ? sql.length : end + 2
    } else if (char === '$' && /[1-9]/.test(sql[i + 1] || '')) {
      const start = ++i
      while (/[0-9]/.test(sql[i] || '')) i++
      names.add(Number(sql.slice(start, i)))
    } else i++
  }
  if (!names.size) return [...params]
  if (Math.max(...names) > params.length) throw new DatabaseError('scope')
  return Object.fromEntries([...names].map(index => [`$${index}`, params[index - 1]!]))
}
