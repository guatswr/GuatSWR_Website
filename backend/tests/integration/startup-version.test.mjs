import path from 'node:path'
import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import { expect, it } from 'vitest'
import { fixture, all } from '../helpers/fixture.mjs'
const require = createRequire(import.meta.url)
const { createApplication } = require('../../src/app')
const { migrateDatabase, inspectSchema } = require('../../dist/src/migrations/engine')
const exec = (db, sql) => new Promise((resolve, reject) => db.exec(sql, error => error ? reject(error) : resolve()))
const options = instance => ({ env: instance.context.env, paths: { data: instance.context.DATA_DIR, public: instance.context.PUBLIC_DIR, backups: instance.context.BACKUP_ROOT }, backgroundTasks: false, externalServices: false })

it('normal startup never creates missing database files', async () => {
  const base = await fixture()
  const data = path.join(base.root, 'uninitialized')
  await expect(createApplication({ ...options(base), paths: { data, public: path.join(data, 'public'), backups: path.join(data, 'backups') } })).rejects.toHaveProperty('code', 'SQLITE_CANTOPEN')
  await expect(fs.access(path.join(data, 'guatswr_web_main.db'))).rejects.toHaveProperty('code', 'ENOENT')
})

it('partial dual-database migration blocks readiness without recreating the ledger', async () => {
  const base = await fixture()
  await exec(base.context.logDb, 'DROP TABLE _guatswr_migrations')
  await expect(createApplication(options(base))).rejects.toHaveProperty('code', 'MIGRATION_REQUIRED')
  expect(await all(base.context.logDb, "SELECT name FROM sqlite_master WHERE name='_guatswr_migrations'")).toEqual([])
  expect((await all(base.context.logDb, 'SELECT source_id FROM audit_logs WHERE source_id IS NOT NULL'))).toEqual([])
  await exec(base.context.logDb, 'DROP INDEX idx_audit_source_id; ALTER TABLE audit_logs DROP COLUMN source_id;')
  const current = await inspectSchema(base.context.logDb)
  await migrateDatabase(base.context.logDb, path.resolve('src/migrations'), 'audit', { mode: 'adopt', expectedFingerprint: current.fingerprint })
  const ready = await createApplication(options(base))
  await ready.close()
})

it('normal startup rejects schema drift instead of repairing missing indexes', async () => {
  const base = await fixture()
  await exec(base.db, 'DROP INDEX idx_members_name')
  await expect(createApplication(options(base))).rejects.toHaveProperty('code', 'MIGRATION_SCHEMA_DRIFT')
  expect(await all(base.db, "SELECT name FROM sqlite_master WHERE name='idx_members_name'")).toEqual([])
})
