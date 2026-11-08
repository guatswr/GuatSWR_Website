import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { buildInventory, renderInventory } from './inventory.mjs'

test('covers callback connections, BFF persistence, migrations and backup consumers', async () => {
  const inventory = await buildInventory()
  const files = new Set(inventory.files.map(item => item.file))
  for (const file of ['backend/src/models/db.js', 'scripts/postgres/legacy-sqlite/engine.ts',
    'web/server/utils/durable-records.ts', 'backend/scripts/backup_bundle.py', 'backend/scripts/inspect_data.py', 'scripts/ops_backup.py']) assert.ok(files.has(file), file)
  for (const file of inventory.files) {
    for (const field of ['consumer', 'access', 'database', 'replacement', 'tests', 'status']) assert.ok(file[field], `${file.file}: ${field}`)
    assert.ok(file.matches.length)
  }
  assert.ok(!files.has('backend/src/migrations/manifest.json'))
  for (const file of ['main-002-assets.sql', 'main-003-security.sql', 'main-004-bot.sql', 'main-005-member-sync.sql',
    'main-008-event-submissions.sql', 'main-009-query-indexes.sql', 'audit-002-source.sql']) assert.ok(files.has(`scripts/postgres/legacy-sqlite/${file}`), file)
  assert.equal(inventory.files.find(file => file.file === 'scripts/googlebot_simulator.py').database, '无')
  assert.equal(inventory.files.find(file => file.file === 'web/server/utils/bff-auth-context.ts').database, '无')
  assert.doesNotMatch(await fs.readFile(new URL('../../backend/src/models/security.js', import.meta.url), 'utf8'), /context\.db/)
  const tables = new Set(inventory.schemas.map(item => `${item.database}.${item.table}`))
  for (const table of ['main.users', 'main.bot_deliveries', 'main.member_sync_requests', 'main.activity_revisions',
    'main.asset_references', 'main.event_submissions', 'audit.audit_logs']) assert.ok(tables.has(table), table)
  const users = inventory.schemas.find(item => item.table === 'users')
  assert.ok(users.columns.some(column => column.name === 'auth_version'))
  const text = renderInventory(inventory)
  assert.match(text, /POSTGRES_URL/)
  assert.match(text, /生产切换/)
  assert.match(text, /影子|asset_references/)
})
