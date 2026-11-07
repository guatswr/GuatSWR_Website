import fs from 'node:fs/promises'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { verifySourceMarker } from './prepare-source.mjs'
import { exportSqliteDatabase } from './export-sqlite.mjs'
import { importToPostgres, validateTargetUrl } from './import-postgres.mjs'
import { verifyMigration, renderVerificationMarkdown } from './verify-migration.mjs'

export function parseArgs(args) {
  const parsed = {
    source: null,
    target: null,
    runId: `mig-${Date.now()}-${randomBytes(4).toString('hex')}`,
    reportDir: './docs/ops/evidence/stability',
    dryRun: false,
    runtimeRole: 'guatswr_app',
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--source' && args[i + 1]) {
      parsed.source = args[++i]
    } else if (arg === '--target' && args[i + 1]) {
      throw Error('Use private POSTGRES_MIGRATION_URL, not a connection string argument')
    } else if (arg === '--run-id' && args[i + 1]) {
      parsed.runId = args[++i]
    } else if (arg === '--report-dir' && args[i + 1]) {
      parsed.reportDir = args[++i]
    } else if (arg === '--runtime-role' && args[i + 1]) {
      parsed.runtimeRole = args[++i]
    } else if (arg === '--target-database' && args[i+1]) {
      parsed.expectedDatabase=args[++i]
    } else if (arg === '--dry-run') {
      parsed.dryRun = true
    } else throw Error('Unknown migration argument')
  }

  if (!/^[A-Za-z0-9_-]{1,80}$/.test(parsed.runId)) throw Error('INVALID_RUN_ID')
  return parsed
}

export async function resolveSourcePaths(sourceInput) {
  const stat = await fs.lstat(sourceInput)
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw Error('SOURCE_DIRECTORY_REQUIRED')
  const files = await fs.readdir(sourceInput)
  const pick = (candidates) => {
    const found = candidates.filter(name=>files.includes(name))
    if(found.length!==1)throw Error('SOURCE_DATABASE_AMBIGUOUS_OR_MISSING')
    return path.join(sourceInput,found[0])
  }
  return {mainDbPath:pick(['guatswr_web_main.db','main.db','data.db']),auditDbPath:pick(['guatswr_web_logs.db','audit.db','log.db'])}
}

export async function runMigration(cliArgs = process.argv.slice(2)) {
  const options = parseArgs(cliArgs)
  options.target=process.env.POSTGRES_MIGRATION_URL
  if(!options.expectedDatabase)throw Error('TARGET_DATABASE_REQUIRED')
  if (!options.source) {
    throw new Error('Missing required option: --source <sqlite-path-or-dir>')
  }
  if (!options.target) {
    throw new Error('Missing private POSTGRES_MIGRATION_URL')
  }

  validateTargetUrl(options.target,options.expectedDatabase)
  const sourcePaths = await resolveSourcePaths(options.source)
  await verifySourceMarker(options.source,sourcePaths)

  console.log(`[PG-04] Starting offline migration Run ID: ${options.runId}`)
  console.log(`[PG-04] Source main: ${sourcePaths.mainDbPath}`)
  console.log(`[PG-04] Source audit: ${sourcePaths.auditDbPath ?? 'none'}`)
  console.log(`[PG-04] Target database: ${options.expectedDatabase}`)
  console.log(`[PG-04] Dry run: ${options.dryRun}`)

  // 1. Export & Validate from SQLite
  console.log(`[PG-04] Exporting and validating SQLite source data...`)
  const exportResult = await exportSqliteDatabase(sourcePaths)
  console.log(`[PG-04] Exported ${Object.keys(exportResult.tables).length} tables successfully.`)

  // 2. Import into PostgreSQL
  console.log(`[PG-04] Importing into PostgreSQL target...`)
  const importResult = await importToPostgres(exportResult, options.target, {
    dryRun: options.dryRun,
    runtimeRole: options.runtimeRole,
    expectedDatabase: options.expectedDatabase,
  })
  console.log(`[PG-04] Import completed: ${JSON.stringify(importResult.tables)}`)

  // 3. Verify Migration (unless dryRun)
  let verifyResult = null
  if (!options.dryRun) {
    console.log(`[PG-04] Verifying migration integrity against target...`)
    verifyResult = await verifyMigration(exportResult, options.target,{publicDir:path.join(options.source,'public')})
    console.log(`[PG-04] Verification result: ${verifyResult.overallStatus}`)
    if (verifyResult.overallStatus !== 'PASS') {
      throw new Error(`Migration verification failed! Details: ${verifyResult.overallStatus}`)
    }
  }

  // 4. Save reports
  await fs.mkdir(options.reportDir, { recursive: true })
  const jsonReportPath = path.join(options.reportDir, `PG-04-migration-${options.runId}.json`)
  const mdReportPath = path.join(options.reportDir, `PG-04-migration-${options.runId}.md`)

  const fullReport = {
    runId: options.runId,
    timestamp: new Date().toISOString(),
    sourcePaths,
    dryRun: options.dryRun,
    exportSummary: {
      tables: Object.fromEntries(
        Object.entries(exportResult.tables).map(([k, v]) => [k, { rowCount: v.rowCount, digest: v.digest }])
      ),
    },
    importSummary: importResult,
    verification: verifyResult,
  }

  await fs.writeFile(jsonReportPath, JSON.stringify(fullReport, null, 2), 'utf8')
  if (verifyResult) {
    const mdContent = renderVerificationMarkdown(verifyResult, options.runId)
    await fs.writeFile(mdReportPath, mdContent, 'utf8')
  }

  console.log(`[PG-04] Migration artifacts written to:`)
  console.log(`  - ${jsonReportPath}`)
  if (verifyResult) console.log(`  - ${mdReportPath}`)

  return fullReport
}

if (process.argv[1] && process.argv[1].endsWith('migrate.mjs')) {
  runMigration().catch(err => {
    console.error('[PG-04] Migration failed:', /^([A-Z_]+)(:|$)/.exec(err.message)?.[1] || 'MIGRATION_FAILED')
    process.exit(1)
  })
}
