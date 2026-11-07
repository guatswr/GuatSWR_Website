import { AsyncLocalStorage } from 'node:async_hooks'

export type SqlValue = string | number | Buffer | null
export type Row = Record<string, unknown>
export interface RunResult { changes: number; lastID: number }
export interface SqlExecutor {
  readonly dialect?: 'sqlite' | 'postgres'
  readonly schema?: 'main' | 'audit' | 'bff'
  get<T extends Row = Row>(sql: string, params?: readonly SqlValue[]): Promise<T | undefined>
  all<T extends Row = Row>(sql: string, params?: readonly SqlValue[]): Promise<T[]>
  run(sql: string, params?: readonly SqlValue[]): Promise<RunResult>
}
export interface OperationOptions { signal?: AbortSignal }
export interface DatabaseStore extends SqlExecutor {
  transaction<T>(work: (transaction: SqlExecutor) => Promise<T>, options?: OperationOptions): Promise<T>
  close(): Promise<void>
}
export type DatabaseErrorKind = 'busy' | 'constraint' | 'interrupted' | 'unavailable' | 'query' | 'scope'
  | 'serialization' | 'deadlock' | 'data' | 'outcome_unknown'

export class DatabaseError extends Error {
  readonly code: string
  readonly retryable: boolean
  constructor(readonly kind: DatabaseErrorKind, readonly sqliteCode?: string, readonly postgresCode?: string) {
    super(`Database ${kind}`)
    this.name = 'DatabaseError'
    this.code = `database_${kind}`
    this.retryable = ['busy', 'serialization', 'deadlock'].includes(kind)
  }
}
// Shared across drivers: a transaction may only use its supplied executor.
export const transactionScope = new AsyncLocalStorage<{ active: boolean }>()

/** Safe HTTP projection for the future PG route boundary; no native messages. */
export function databaseHttpFailure(error: DatabaseError) {
  const status = ['constraint', 'serialization', 'deadlock'].includes(error.kind) ? 409
    : ['busy', 'unavailable', 'interrupted', 'outcome_unknown'].includes(error.kind) ? 503 : 500
  const message = status === 409 ? '数据已变化，请刷新后重试'
    : error.kind === 'outcome_unknown' ? '操作结果待确认，请先查询操作状态'
      : status === 503 ? '数据库服务暂不可用' : '服务器错误'
  return { status, body: { message, code: error.code } }
}
