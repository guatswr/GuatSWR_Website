import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
import pino, { type DestinationStream } from 'pino'

type Event = 'http.completed' | 'http.failed' | 'task.started' | 'task.completed' | 'task.failed'
  | 'audit.failed' | 'backup.failed' | 'upload.failed' | 'storage.failed' | 'storage.cleanup.retry' | 'application.ready' | 'application.failed'
type Level = 'info' | 'warn' | 'error'
interface Correlation { requestId?: string; taskId?: string }
interface Fields { method?: string; route?: string; status?: number; durationMs?: number; error?: unknown; port?: number }
const errors = new Set(['SQLITE_BUSY', 'SQLITE_LOCKED', 'SQLITE_ERROR', 'SQLITE_CANTOPEN', 'SQLITE_CONSTRAINT', 'SQLITE_READONLY', 'SQLITE_FULL',
  'database_busy', 'database_constraint', 'database_interrupted', 'database_unavailable', 'database_query', 'database_scope',
  'SQLITE_CORRUPT', 'SQLITE_MISUSE', 'ENOENT', 'ENOTDIR', 'EACCES', 'EPERM', 'ENOSPC', 'EADDRINUSE', 'ECONNRESET',
  'SHUTDOWN_TIMEOUT', 'invalid_configuration', 'LIMIT_FILE_SIZE', 'LIMIT_PART_COUNT', 'LIMIT_FILE_COUNT', 'LIMIT_FIELD_COUNT'])
const classify = (error: unknown): string => {
  if (typeof error !== 'object' || error === null) return 'unexpected_error'
  if ('code' in error && typeof error.code === 'string' && errors.has(error.code)) return error.code
  if ('name' in error && error.name === 'AbortError') return 'operation_aborted'
  return 'unexpected_error'
}
export function createDiagnosticLogger(options: { destination?: DestinationStream; silent?: boolean } = {}) {
  const context = new AsyncLocalStorage<Correlation>()
  const logger = pino({ level: options.silent ? 'silent' : 'info', base: null, timestamp: pino.stdTimeFunctions.isoTime,
    redact: ['password', 'token', 'authorization', 'cookie', 'headers', 'body', 'qq', 'ip', 'twofa_secret'] }, options.destination)
  const write = (level: Level, event: Event, fields: Fields = {}): void => {
    const record: Record<string, unknown> = { ...context.getStore(), event }
    if (fields.method && /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(fields.method)) record.method = fields.method
    // Callers provide a matched route template, never a URL/query/identifier.
    if (fields.route && fields.route.length <= 160 && /^\/[a-zA-Z/:_*-]*$/.test(fields.route)) record.route = fields.route
    if (fields.status !== undefined && Number.isInteger(fields.status)) record.status = fields.status
    if (fields.durationMs !== undefined && Number.isFinite(fields.durationMs)) record.durationMs = Math.max(0, Math.round(fields.durationMs * 100) / 100)
    if (fields.port !== undefined && Number.isInteger(fields.port)) record.port = fields.port
    if (fields.error !== undefined) record.code = classify(fields.error)
    // Diagnostic delivery must not turn a completed mutation into a retryable failure.
    try { logger[level](record, event) } catch { /* The operator owns the output stream. */ }
  }
  return {
    info: (event: Event, fields?: Fields) => write('info', event, fields),
    warn: (event: Event, fields?: Fields) => write('warn', event, fields),
    error: (event: Event, fields?: Fields) => write('error', event, fields),
    bind<Args extends unknown[]>(operation: (...args: Args) => void): (...args: Args) => void {
      const captured = context.getStore() || {}
      return (...args) => context.run(captured, () => operation(...args))
    },
    request<T>(operation: (requestId: string) => T): T {
      const requestId = randomUUID()
      return context.run({ requestId }, () => operation(requestId))
    },
    task<T>(operation: () => T): T {
      return context.run({ ...context.getStore(), taskId: randomUUID() }, operation)
    },
  }
}
