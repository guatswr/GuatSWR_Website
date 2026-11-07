import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

export const TOPOLOGICAL_TABLE_ORDER = [
  // Level 0: No foreign key dependencies
  { schema: 'main', table: 'users', pk: 'id' },
  { schema: 'main', table: 'site_config', pk: 'key' },
  { schema: 'main', table: 'banned_ips', pk: 'ip' },
  { schema: 'main', table: 'login_attempts', pk: 'ip' },
  { schema: 'main', table: 'history', pk: 'id' },
  { schema: 'main', table: 'members', pk: 'id' },
  { schema: 'main', table: 'activities', pk: 'id' },
  { schema: 'main', table: 'events', pk: 'id' },
  { schema: 'main', table: 'bot_credentials', pk: 'id' },
  { schema: 'main', table: 'bot_notifications', pk: 'id' },
  { schema: 'main', table: 'member_sync_groups', pk: 'group_id' },
  { schema: 'main', table: 'member_sync_meta', pk: 'id' },
  { schema: 'main', table: 'member_sync_settings', pk: 'id' },
  { schema: 'main', table: 'security_audit_outbox', pk: 'id' },
  { schema: 'main', table: 'asset_cleanup_jobs', pk: 'id' },
  { schema: 'main', table: 'asset_references', pk: 'id' },
  { schema: 'audit', table: 'audit_logs', pk: 'id' },

  // Level 1: Dependencies on Level 0
  { schema: 'main', table: 'activity_revisions', pk: 'id' },
  { schema: 'main', table: 'bot_credential_secrets', pk: 'credential_id' },
  { schema: 'main', table: 'bot_identities', pk: 'id' },
  { schema: 'main', table: 'bot_subscriptions', pk: 'id' },
  { schema: 'main', table: 'event_participants', pk: 'id' },
  { schema: 'main', table: 'event_submissions', pk: 'event_id' },
  { schema: 'main', table: 'member_group_memberships', pk: 'qq,group_id' },
  { schema: 'main', table: 'member_profile_tasks', pk: 'member_id' },
  { schema: 'main', table: 'member_sync_requests', pk: 'id' },

  // Level 2: Dependencies on Level 1
  { schema: 'main', table: 'bot_deliveries', pk: 'id' },
  { schema: 'main', table: 'bot_link_codes', pk: 'code_hash' },
  { schema: 'main', table: 'member_sync_avatars', pk: 'id' },
  { schema: 'main', table: 'member_sync_batches', pk: 'request_id,batch_no' },
]

export { canonicalJson, computeRowDigest, computeTableDigest } from '../../backend/scripts/postgres/data.mjs'
import { computeTableDigest, fileDigest } from '../../backend/scripts/postgres/data.mjs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { checkDatabase } = require('../../backend/dist/src/migrations/engine.js')
export function validateDataRow(schema, table, row, columns) {
  const errors = []
  for (const col of columns) {
    const val = row[col]
    if (val === null || val === undefined) continue

    // Integer bounds
    if (typeof val === 'number') {
      if (!Number.isSafeInteger(val)) {
        errors.push(`Column ${col} has an unsafe integer`)
      }
    }

    if (typeof val === 'bigint' && (val > 9007199254740991n || val < -9007199254740991n)) errors.push(`Column ${col} is outside safe integer range`)
    if (typeof val === 'string' && val.includes('\u0000')) errors.push(`Column ${col} contains a null byte`)
  }
  return errors
}

export async function exportSqliteDatabase(sourcePaths) {
  const { mainDbPath, auditDbPath } = sourcePaths
  const result = {
    exportedAt: new Date().toISOString(),
    sourcePaths,
    tables: {},
    diagnostics: [],
  }

  for (const filename of [mainDbPath, auditDbPath]) {
    if (!filename) throw Error('SOURCE_AUDIT_REQUIRED')
    const info = await fs.lstat(filename)
    if (!info.isFile() || info.isSymbolicLink()) throw Error('SOURCE_FILE_INVALID')
    const wal = await fs.stat(filename+'-wal').catch(()=>null)
    if (wal && wal.size > 0) throw Error('SOURCE_MUST_BE_FROZEN: checkpointed verified copy required')
  }
  const initialHashes = await Promise.all([fileDigest(mainDbPath),fileDigest(auditDbPath)])
  // Open both databases in read-only mode
  const mainDb = new DatabaseSync(mainDbPath, { readOnly: true })
  let auditDb
  try {
    auditDb = new DatabaseSync(auditDbPath, { readOnly: true })
    if (!auditDb) throw new Error('SOURCE_AUDIT_REQUIRED')
    const directory = fileURLToPath(new URL('../../backend/src/migrations',import.meta.url))
    for (const [db, kind] of [[mainDb,'main'],[auditDb,'audit']]) {
      const connection = {
        all(sql, params, callback) { try { callback(null, db.prepare(sql).all(...params)) } catch (error) { callback(error) } },
        exec(sql, callback) { try { db.exec(sql); callback(null) } catch (error) { callback(error) } },
      }
      const schema = await checkDatabase(connection, directory, kind, {compatible:true})
      if (schema.version !== (kind==='main'?10:2)) throw Error('SOURCE_VERSION_UNSUPPORTED')
    }
    // 1. Run integrity checks
    const mainIntegrity = mainDb.prepare('PRAGMA integrity_check').all()
    if (mainIntegrity.length !== 1 || mainIntegrity[0].integrity_check !== 'ok') {
      throw new Error(`Main SQLite database integrity check failed: ${JSON.stringify(mainIntegrity)}`)
    }

    if (auditDb) {
      const auditIntegrity = auditDb.prepare('PRAGMA integrity_check').all()
      if (auditIntegrity.length !== 1 || auditIntegrity[0].integrity_check !== 'ok') {
        throw new Error(`Audit SQLite database integrity check failed: ${JSON.stringify(auditIntegrity)}`)
      }
    }

    // 2. Foreign keys check on main
    const fkViolations = mainDb.prepare('PRAGMA foreign_key_check').all()
    if (fkViolations.length > 0) {
      throw new Error(`Main database contains foreign key violations: ${JSON.stringify(fkViolations)}`)
    }

    // 3. Export each table
    for (const spec of TOPOLOGICAL_TABLE_ORDER) {
      const db = spec.schema === 'audit' ? auditDb : mainDb
      if (!db) continue

      // Check if table exists in SQLite
      const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").get(spec.table)
      if (!tableExists) {
        result.tables[spec.table] = {
          schema: spec.schema,
          table: spec.table,
          present: false,
          rowCount: 0,
          digest: createHash('sha256').digest('hex'),
          columns: [],
          rows: [],
        }
        continue
      }

      // Read column definitions
      const colInfo = db.prepare(`PRAGMA table_info("${spec.table}")`).all()
      const columnSet = new Set(colInfo.map(c => c.name))
      const manifest = JSON.parse(await fs.readFile(path.join(directory,'manifest.json'),'utf8'))[spec.schema]
      const expected = [manifest,...(manifest.upgrades||[]),...(manifest.compatibleUpgrades||[])].at(-1).shape[spec.table].columns.map(c=>c[1])
      for (const col of expected) {
        if (!columnSet.has(col)) throw Error('SOURCE_COLUMNS_UNSUPPORTED: ' + spec.table + ' missing ' + col)
      }
      const columns = expected

      // Read all rows with explicit column selection
      const statement = db.prepare(`SELECT ${columns.map(c => `"${c}"`).join(', ')} FROM "${spec.table}"`)
      statement.setReadBigInts(true)
      const rows = statement.all()

      // Validate each row
      for (const row of rows) {
        const rowErrors = validateDataRow(spec.schema, spec.table, row, columns)
        if (rowErrors.length > 0) {
          result.diagnostics.push({
            schema: spec.schema,
            table: spec.table,
            pk: spec.pk,
            rowNumber: rows.indexOf(row) + 1,
            errors: rowErrors,
          })
        }
      }

      // Check PK uniqueness
      const pkCols = spec.pk.split(',').map(c => `"${c}"`).join(',')
      const duplicates = db.prepare(`SELECT ${pkCols}, count(*) as cnt FROM "${spec.table}" GROUP BY ${pkCols} HAVING cnt > 1`).all()
      if (duplicates.length > 0) {
        throw new Error(`Duplicate primary keys found in ${spec.table}: ${JSON.stringify(duplicates)}`)
      }

      const tableSummary = computeTableDigest(rows, columns, spec.pk)

      result.tables[spec.table] = {
        schema: spec.schema,
        table: spec.table,
        present: true,
        pk: spec.pk,
        columns,
        rowCount: tableSummary.rowCount,
        digest: tableSummary.digest,
        rows: tableSummary.sortedRows,
      }
    }

    if (result.diagnostics.length > 0) {
      const msg = `Export failed data validation with ${result.diagnostics.length} errors: ${JSON.stringify(result.diagnostics.slice(0, 5))}`
      const err = new Error(msg)
      err.diagnostics = result.diagnostics
      throw err
    }

    for (const [name, summary] of Object.entries(result.tables)) {
      if (!summary.present) throw Error('SOURCE_TABLE_REQUIRED: '+name)
      for (const row of summary.rows) for (const key of summary.pk.split(',')) if (row[key] === null) throw Error('SOURCE_NULL_PRIMARY_KEY: '+name+'.'+key)
    }
    const finalHashes = await Promise.all([fileDigest(mainDbPath),fileDigest(auditDbPath)])
    if (JSON.stringify(initialHashes)!==JSON.stringify(finalHashes)) throw Error('SOURCE_CHANGED_DURING_EXPORT')
    result.sourceHashes={main:initialHashes[0],audit:initialHashes[1]}
    return result
  } finally {
    mainDb.close()
    if (auditDb) auditDb.close()
  }
}
