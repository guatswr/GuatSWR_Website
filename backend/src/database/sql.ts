import type { SqlExecutor } from './contracts.js'

export const utcTimestamp = (_db?: Pick<SqlExecutor, 'dialect'>) =>
  "to_char(statement_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS')"
export const lockRow = (_db: SqlExecutor, sql: string) => sql + ' FOR UPDATE'
export const placeholders = (count: number, offset = 0) => Array.from({ length: count }, (_, i) => `$${i + offset + 1}`).join(',')
export function idBinding(value: unknown): number | null {
  if (typeof value === 'number') return Number.isSafeInteger(value) ? value : null
  if (typeof value !== 'string' || !/^\s*[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?\s*$/.test(value)) return null
  const id = Number(value)
  return Number.isSafeInteger(id) ? id : null
}
export function likeExpression(_db: SqlExecutor, column: string, index: number) {
  const value = `$${index}`
  return `translate(${column},'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz') LIKE translate(${value},'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz') ESCAPE ''`
}
export function tableNames(db: SqlExecutor) {
  return db.all<{ name: string }>('SELECT tablename AS name FROM pg_catalog.pg_tables WHERE schemaname=$1', [db.schema || 'main'])
}
export function findTable(db: SqlExecutor, name: string) {
  return db.get<{ name: string }>('SELECT tablename AS name FROM pg_catalog.pg_tables WHERE schemaname=$1 AND tablename=$2', [db.schema || 'main', name])
}
