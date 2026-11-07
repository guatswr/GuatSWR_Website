import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { Pool, type PoolClient } from 'pg'
import type { SqlExecutor, DatabaseStore } from '../../database/contracts.js'
import { parseDatabaseConfiguration } from '../../database/config.js'

const fail = (code: string): never => { throw Object.assign(new Error(code), { code }) }
const digest = (value: unknown) => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex')
const definition = async () => {
  const directory = path.join(__dirname, '../../../../src/migrations/postgres')
  const manifest = JSON.parse(await fs.readFile(path.join(directory, 'manifest.json'), 'utf8')) as {
    version: number; file: string; sha256: string; mainVersion: number; auditVersion: number; tables: string[]
  }
  if (manifest.version !== 1 || path.basename(manifest.file) !== manifest.file) fail('PG_MIGRATION_MANIFEST')
  const sql = await fs.readFile(path.join(directory, manifest.file), 'utf8')
  if (digest(sql) !== manifest.sha256) fail('PG_MIGRATION_CHECKSUM')
  return { manifest, sql }
}

async function fingerprint(db: Pick<SqlExecutor, 'all'>) {
  const columns = await db.all(`SELECT n.nspname AS schema,c.relname AS table,a.attname AS column,
    pg_catalog.format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull,a.attidentity,
    pg_catalog.pg_get_expr(d.adbin,d.adrelid) AS default,co.collname AS collation
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
    LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
    LEFT JOIN pg_catalog.pg_collation co ON co.oid=a.attcollation
    WHERE n.nspname IN ('main','audit','bff') AND c.relkind='r' AND c.relname<>'schema_version'
    ORDER BY n.nspname,c.relname,a.attnum`)
  const objects = await db.all(`SELECT n.nspname AS schema,c.relname AS table,x.relname AS name,
    pg_catalog.pg_get_indexdef(i.indexrelid) AS definition FROM pg_catalog.pg_index i
    JOIN pg_catalog.pg_class c ON c.oid=i.indrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_catalog.pg_class x ON x.oid=i.indexrelid
    WHERE n.nspname IN ('main','audit','bff') AND c.relname<>'schema_version' ORDER BY n.nspname,c.relname,x.relname`)
  const constraints = await db.all(`SELECT n.nspname AS schema,c.relname AS table,k.conname AS name,
    pg_catalog.pg_get_constraintdef(k.oid) AS definition FROM pg_catalog.pg_constraint k
    JOIN pg_catalog.pg_class c ON c.oid=k.conrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname IN ('main','audit','bff') AND c.relname<>'schema_version' ORDER BY n.nspname,c.relname,k.conname`)
  const functions = await db.all(`SELECT n.nspname AS schema,p.proname AS name,pg_catalog.pg_get_functiondef(p.oid) AS definition
    FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname IN ('main','audit','bff') ORDER BY n.nspname,p.proname,p.oid`)
  const triggers = await db.all(`SELECT n.nspname AS schema,c.relname AS table,t.tgname AS name,pg_catalog.pg_get_triggerdef(t.oid) AS definition
    FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname IN ('main','audit','bff') AND NOT t.tgisinternal ORDER BY n.nspname,c.relname,t.tgname`)
  const sequences = await db.all(`SELECT schemaname,sequencename,start_value::text,min_value::text,max_value::text,increment_by::text,cycle,cache_size::text
    FROM pg_catalog.pg_sequences WHERE schemaname IN ('main','audit','bff') ORDER BY schemaname,sequencename`)
  return digest({ columns, objects, constraints, functions, triggers, sequences })
}

async function check(tx: SqlExecutor) {
  const { manifest } = await definition()
  await tx.get("SELECT set_config('search_path','pg_catalog',true)")
  const ledger = await tx.get<{ present: string | null }>("SELECT to_regclass('main.schema_version') AS present")
  if (!ledger?.present) return fail('PG_MIGRATION_REQUIRED')
  const row = await tx.get<{ version: number; checksum: string; fingerprint: string; main_version: number; audit_version: number }>('SELECT * FROM main.schema_version ORDER BY version DESC LIMIT 1')
  if (!row) return fail('PG_MIGRATION_REQUIRED')
  if (Number(row.version) !== manifest.version || row.checksum !== manifest.sha256
    || Number(row.main_version) !== manifest.mainVersion || Number(row.audit_version) !== manifest.auditVersion) fail('PG_MIGRATION_REQUIRED')
  if (await fingerprint(tx) !== row.fingerprint) fail('PG_MIGRATION_SCHEMA_DRIFT')
  return { version: manifest.version, mainVersion: manifest.mainVersion, auditVersion: manifest.auditVersion }
}
export const checkPostgresSchema = (store: DatabaseStore) => store.transaction(check)
export const checkPostgresClient = check

/** Explicit DDL entry point; runtime startup only calls checkPostgresSchema. */
export async function initializePostgres(connectionString: string, expectedDatabase: string, runtimeRole: string) {
  parseDatabaseConfiguration({ DATABASE_DRIVER: 'postgres', POSTGRES_URL: connectionString })
  if (new URL(connectionString).pathname.slice(1) !== expectedDatabase || !/^[a-z][a-z0-9_]{0,62}$/.test(expectedDatabase) || !/^[a-z][a-z0-9_]{0,62}$/.test(runtimeRole)) fail('PG_MIGRATION_TARGET')
  const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 1000, options: '-c search_path=pg_catalog -c timezone=UTC' })
  let acquired: PoolClient | undefined
  try {
    const client = await pool.connect()
    acquired = client
    client.on('error', () => {})
    await client.query('BEGIN')
    const role = (await client.query(`SELECT rolname,rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls AS elevated,
      pg_has_role($1,current_user,'MEMBER') AS owner_member FROM pg_catalog.pg_roles WHERE rolname=$1`, [runtimeRole])).rows[0]
    if (!role || role.elevated || role.owner_member) fail('PG_MIGRATION_ROLE')
    await client.query('SELECT pg_advisory_xact_lock(57124,1)')
    const exists = await client.query("SELECT to_regclass('main.schema_version') AS ledger")
    const tx = { dialect: 'postgres' as const, all: async (sql: string, params: readonly unknown[] = []) => (await client.query(sql, [...params])).rows,
      get: async (sql: string, params: readonly unknown[] = []) => (await client.query(sql, [...params])).rows[0],
      run: async () => { throw new Error('DDL executor is internal') } } as SqlExecutor
    if (exists.rows[0]?.ledger) {
      const result = await check(tx); await client.query('COMMIT'); return { ...result, applied: false }
    }
    const tables = await client.query("SELECT 1 FROM pg_catalog.pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema') LIMIT 1")
    if (tables.rowCount) fail('PG_MIGRATION_REQUIRES_EMPTY')
    const { manifest, sql } = await definition()
    await client.query(sql)
    await client.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC')
    await client.query(`REVOKE TEMP ON DATABASE "${expectedDatabase}" FROM PUBLIC`)
    await client.query(`GRANT CONNECT ON DATABASE "${expectedDatabase}" TO "${runtimeRole}"`)
    const hash = await fingerprint(tx)
    await client.query('INSERT INTO main.schema_version(version,checksum,fingerprint,main_version,audit_version) VALUES($1,$2,$3,$4,$5)',
      [manifest.version, manifest.sha256, hash, manifest.mainVersion, manifest.auditVersion])
    await client.query(`GRANT USAGE ON SCHEMA main,audit,bff TO "${runtimeRole}"`)
    await client.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA main,audit,bff TO "${runtimeRole}"`)
    await client.query(`GRANT USAGE ON ALL SEQUENCES IN SCHEMA main,audit,bff TO "${runtimeRole}"`)
    await client.query(`REVOKE INSERT,UPDATE,DELETE ON main.schema_version FROM "${runtimeRole}"`)
    await check(tx)
    await client.query('COMMIT')
    return { version: manifest.version, mainVersion: manifest.mainVersion, auditVersion: manifest.auditVersion, applied: true }
  } catch (error) { await acquired?.query('ROLLBACK').catch(() => {}); throw error }
  finally { acquired?.release(); await pool.end() }
}
