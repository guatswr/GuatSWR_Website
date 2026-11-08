// Test-only SQLite callback protocol for fixture setup. Production queries are
// executed unchanged by the native PG stores; no runtime SQL translation exists.
import { createRequire } from 'node:module'
import { randomBytes } from 'node:crypto'
const require = createRequire(import.meta.url)
const { Pool } = require('pg')
if (process.env.PG_TEST_DEBUG === '1') {
  const pg = require('pg'), original = pg.Client.prototype.query
  pg.Client.prototype.query = function (sql, ...args) {
    const result = original.call(this, sql, ...args)
    return result?.catch ? result.catch(error => {
      console.error('PG_TEST_QUERY', error.code, error.position, String(sql.text || sql).slice(0, 160))
      throw error
    }) : result
  }
}
const { createApplication } = require('../../src/app.js')
const { legacyJsonBinding } = require('../../dist/src/database/legacy-json-binding.js')

function fixtureSql(input) {
  let sql = '', index = 0
  for (let i = 0; i < input.length;) {
    const char = input[i]
    if (char === "'" || char === '"') {
      const quote = char; sql += char; i++
      while (i < input.length) { const next = input[i++]; sql += next; if (next === quote) { if (input[i] === quote) sql += input[i++]; else break } }
    } else if (char === '?') { sql += `$${++index}`; i++ }
    else { sql += char; i++ }
  }
  if (/^INSERT OR REPLACE INTO site_config/i.test(sql)) sql = sql.replace(/INSERT OR REPLACE/i, 'INSERT') + ' ON CONFLICT(key) DO UPDATE SET value=excluded.value'
  return sql
}
function callbacks(store, ddl) {
  const triggers = new Map()
  const definition = async input => {
    if (/^BEGIN IMMEDIATE$/i.test(input)) {
      await ddl.query('BEGIN')
      return ddl.query('SELECT pg_advisory_xact_lock(57125,1)')
    }
    const trigger = /^CREATE TRIGGER (\w+) BEFORE (INSERT|DELETE|UPDATE(?: OF \w+)?) ON (\w+)\s*(?:WHEN (.*?)\s*)?BEGIN SELECT RAISE\(ABORT,\s*'[^']*'\);?\s*END\s*;?$/is.exec(input)
    if (trigger) {
      const [, name, event, table, condition] = trigger
      triggers.set(name, table)
      await ddl.query(`CREATE FUNCTION ${name}_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION USING ERRCODE='XX000',MESSAGE='synthetic write failure'; END $$`)
      return ddl.query(`CREATE TRIGGER ${name} BEFORE ${event} ON ${table} FOR EACH ROW${condition ? ` WHEN (${condition})` : ''} EXECUTE FUNCTION ${name}_fail()`)
    }
    const drop = /^DROP TRIGGER (\w+)\s*;?$/i.exec(input)
    if (drop && triggers.has(drop[1])) {
      await ddl.query(`DROP TRIGGER ${drop[1]} ON ${triggers.get(drop[1])}`)
      return ddl.query(`DROP FUNCTION ${drop[1]}_fail()`)
    }
    // A SQLite DROP removes dependent triggers/FKs with the table. The fixture
    // intentionally creates broken schemas to verify read failures.
    if (/^DROP TABLE \w+\s*;?$/i.test(input)) return ddl.query(input.replace(/;?$/, ' CASCADE'))
    return ddl.query(input)
  }
  const execute = (mode, input, params, callback) => {
    if (typeof params === 'function') { callback = params; params = [] }
    let sql = fixtureSql(input)
    if (/^\s*(ALTER|DROP|CREATE|PRAGMA|BEGIN|COMMIT|ROLLBACK)/i.test(sql)) {
      void definition(sql).then(result => callback?.(null, mode === 'all' ? result.rows : result.rows[0]), error => callback?.(error))
      return
    }
    if (mode === 'run' && /^\s*INSERT INTO\s+(users|events|activities|history|members|event_participants|audit_logs|activity_revisions)\b/i.test(sql) && !/\bRETURNING\b/i.test(sql)) sql += ' RETURNING id'
    void store[mode](sql, (params || []).map(legacyJsonBinding)).then(async result => {
      const table = /^\s*INSERT INTO\s+(users|events|activities|history|members|event_participants|audit_logs|activity_revisions)\b/i.exec(sql)?.[1]
      if (mode === 'run' && table) {
        const qualified = `${store.schema}.${table}`
        await ddl.query(`SELECT setval(pg_get_serial_sequence('${qualified}','id'),COALESCE((SELECT MAX(id) FROM ${qualified}),1),EXISTS(SELECT 1 FROM ${qualified}))`)
      }
      if (mode === 'run') callback?.call(result, null)
      else callback?.(null, result)
    }, error => callback?.(error)).catch(error => callback?.(error))
  }
  return { get: (sql, params, cb) => execute('get', sql, params, cb), all: (sql, params, cb) => execute('all', sql, params, cb), run: (sql, params, cb) => execute('run', sql, params, cb), exec: (sql, cb) => execute('run', sql, [], cb) }
}
export async function createPostgresTestApplication(options) {
  const { applicationFactory = createApplication, ...applicationOptions } = options
  let source,runtime
  try {
    source=new URL(process.env.PG_BUSINESS_ADMIN_URL||'')
    runtime=new URL(process.env.PG_ADAPTER_TEST_URL||'')
  } catch {throw Error('Use the isolated PostgreSQL test harness')}
  if(source.hostname!=='127.0.0.1'||source.pathname!=='/guatswr_pg_contract_test'||runtime.hostname!==source.hostname||runtime.port!==source.port||runtime.pathname!==source.pathname||runtime.username!=='guatswr_app')throw Error('Isolated test URLs required')
  const database = `guatswr_pg_case_${randomBytes(8).toString('hex')}`
  const admin = new Pool({ connectionString: source.href, max: 1 })
  admin.on('error', () => {})
  let ddl,instance,closing,created=false
  const close=()=>closing??=(async()=>{
    let failure
    try {await instance?.close()} catch(error){failure=error}
    try {await ddl?.end()} catch(error){failure??=error}
    try {if(created)await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`)} catch(error){failure??=error}
    try {await admin.end()} catch(error){failure??=error}
    if(failure)throw failure
  })()
  try {
    await admin.query(`CREATE DATABASE "${database}" TEMPLATE guatswr_pg_business_template`);created=true
    await admin.query(`REVOKE TEMP ON DATABASE "${database}" FROM PUBLIC`)
    await admin.query(`GRANT CONNECT ON DATABASE "${database}" TO guatswr_app`)
    runtime.pathname='/'+database;source.pathname='/'+database
    ddl=new Pool({connectionString:source.href,max:1,options:'-c search_path=pg_catalog,main -c timezone=UTC'});ddl.on('error',()=>{})
    instance = await applicationFactory({ ...applicationOptions, env: { ...applicationOptions.env, DATABASE_DRIVER: 'postgres', POSTGRES_URL: runtime.href } })
    const fixtureDb = callbacks(instance.context.sql.main, ddl)
    const fixtureLogDb = callbacks(instance.context.sql.audit, {
      query: async sql => {
        const client = await ddl.connect()
        try { await client.query('SET search_path=pg_catalog,audit'); return await client.query(sql) }
        finally { await client.query('RESET search_path'); client.release() }
      },
    })
    return { ...instance, fixtureDb, fixtureLogDb, fixtureAdmin: ddl, fixtureCloseApplication: instance.close, close, fixtureSeeded: async () => {
      for (const table of ['users', 'activities', 'members', 'history', 'events', 'event_participants']) {
        await ddl.query(`SELECT setval(pg_get_serial_sequence('main.${table}','id'),COALESCE((SELECT MAX(id) FROM main.${table}),1),EXISTS(SELECT 1 FROM main.${table}))`)
      }
      await ddl.query("SELECT setval(pg_get_serial_sequence('audit.audit_logs','id'),COALESCE((SELECT MAX(id) FROM audit.audit_logs),1),EXISTS(SELECT 1 FROM audit.audit_logs))")
    } }
  } catch (error) { await close().catch(()=>{}); throw error }
}
