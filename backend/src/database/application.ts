import fs from 'node:fs/promises'
import { createPostgresStore } from './postgres.js'
import { checkPostgresSchema } from '../migrations/postgres/engine.js'
import { redactSecrets } from '../security/redact-secrets.js'
import { DatabaseError, databaseHttpFailure, type DatabaseStore, type SqlExecutor } from './contracts.js'
import { AppError } from '../errors.js'

function publicErrors<T>(work: Promise<T>): Promise<T> {
  return work.catch(error => {
    if (!(error instanceof DatabaseError)) throw error
    const failure = databaseHttpFailure(error)
    // Preserve each frozen route's generic server-error envelope and reporting.
    if (failure.status === 500) throw error
    throw new AppError(failure.body.message, error.code, failure.status, { cause: error })
  })
}
function httpExecutor(raw: SqlExecutor): SqlExecutor {
  return { ...raw, get: (sql, params) => publicErrors(raw.get(sql, params)), all: (sql, params) => publicErrors(raw.all(sql, params)),
    run: (sql, params) => publicErrors(raw.run(sql, params)) }
}
function httpStore(raw: DatabaseStore): DatabaseStore {
  return { ...raw, ...httpExecutor(raw), transaction: (work, options) => publicErrors(raw.transaction(tx => work(httpExecutor(tx)), options)) }
}

interface Logger { error(event: 'audit.failed', fields: { error: unknown }): void }
export async function createPostgresDatabase(connectionString: string, resolved: Record<string, string>, logger?: Logger) {
  // The backend owns at most four PG sessions across business and audit stores.
  const main = createPostgresStore({ connectionString, schema: 'main', maxConnections: 3, maxWaiting: 96 })
  const audit = createPostgresStore({ connectionString, schema: 'audit', maxConnections: 1, maxWaiting: 32 })
  const pending = new Set<Promise<unknown>>()
  let closed: Promise<void> | undefined
  const close = () => closed ??= (async () => {
    const stopping = Promise.all([main.close(), audit.close()])
    void stopping.catch(() => {})
    await Promise.allSettled([...pending])
    await stopping
  })()
  try {
    // No directory creation, SQLite open, fallback or DDL before real schema validation.
    const role = await main.get<{ elevated: boolean }>(`SELECT rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls
      OR has_schema_privilege(current_user,'main','CREATE') OR has_schema_privilege(current_user,'audit','CREATE') OR has_schema_privilege(current_user,'bff','CREATE')
      OR has_schema_privilege(current_user,'public','CREATE') OR has_database_privilege(current_user,current_database(),'TEMP') AS elevated
      FROM pg_catalog.pg_roles WHERE rolname=current_user`)
    if (!role || role.elevated) throw Object.assign(new Error('PostgreSQL runtime role must not have DDL privileges'), { code: 'PG_RUNTIME_ROLE' })
    const version = await checkPostgresSchema(main)
    await audit.ready()
    for (const key of ['DATA_DIR', 'PUBLIC_DIR', 'UPLOADS_DIR', 'IMG_ROOT_DIR', 'HISTORY_ROOT_DIR', 'ICON_SVG_DIR', 'PRIVATE_UPLOADS_DIR']) {
      await fs.mkdir(resolved[key]!, { recursive: true, mode: key === 'PRIVATE_UPLOADS_DIR' ? 0o700 : 0o755 })
    }
    const addLog = (username: unknown, action: unknown, details: unknown) => {
      if (closed) return
      const work = audit.run('INSERT INTO audit_logs(username,action,details) VALUES($1,$2,$3)',
        [String(username || 'System'), String(action || ''), redactSecrets(String(details || ''))]).catch(error => { logger?.error('audit.failed', { error }) })
      pending.add(work)
      void work.then(() => pending.delete(work), () => pending.delete(work))
    }
    return { ...resolved, databaseDriver: 'postgres', sql: { main: httpStore(main), audit: httpStore(audit) }, addLog,
      mainSchemaVersion: version.mainVersion, auditSchemaVersion: version.auditVersion, close }
  } catch (error) { await close(); throw error }
}
