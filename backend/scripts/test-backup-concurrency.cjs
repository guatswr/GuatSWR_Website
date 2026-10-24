const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const factory = require('../src/app').createApplication;
const { initializeDatabases } = require('./initialize-databases.cjs');
const { createBackupRunner } = require('../dist/src/backup/runner.js');
(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'guatswr-backup-concurrency-'));
  let app, holding, first;
  const entered = Promise.withResolvers(), release = Promise.withResolvers();
  try {
    const data = path.join(root, 'data'), backups = path.join(root, 'backups'), publicDir = path.join(data, 'public');
    await initializeDatabases({}, { data });
    app = await factory({ env: { NODE_ENV: 'test', JWT_SECRET: 'synthetic-backup-key' }, paths: { data, public: publicDir, backups }, backgroundTasks: false, externalServices: false });
    const runner = (tag, backupRoot = backups) => createBackupRunner({
      script: app.context.backup.FULL_BACKUP_SCRIPT,
      env: { ...process.env, DATA_DIR: data, PUBLIC_DIR: publicDir, BACKUP_ROOT: backupRoot, DB_PATH: app.context.dbPath, LOG_DB_PATH: app.context.logDbPath, BACKUP_DATE_TAG: tag },
      timeoutMs: '10000', shutdown: app.context.shutdownSignal,
      trackChild: child => app.context.trackChild(child, { processGroup: true })
    });
    holding = app.context.sql.main.transaction(async () => { entered.resolve(); await release.promise; });
    await entered.promise;
    first = runner('20300101_000000_first')();
    void first.catch(() => {});
    const deadline = Date.now() + 3000;
    while (true) {
      try { await fs.stat(path.join(data, '.asset-cleanup-fence')); break; }
      catch (error) { if (error.code !== 'ENOENT' || Date.now() > deadline) throw error; }
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    await assert.rejects(runner('20300101_000000_second')(), error => error.code === 'BACKUP_BUSY');
    release.resolve(); await holding; await first;
    await fs.stat(path.join(backups, 'full', 'full_20300101_000000_first.tar.gz'));
    await assert.rejects(fs.stat(path.join(backups, 'full', 'full_20300101_000000_second.tar.gz')), error => error.code === 'ENOENT');
    await assert.rejects(fs.stat(path.join(data, '.asset-cleanup-fence')), error => error.code === 'ENOENT');
    const forbidden = path.join(publicDir, 'exposed-backups');
    await assert.rejects(runner('20300101_000000_private', forbidden)(), error => error.code === 'BACKUP_EXECUTION_FAILED');
    await assert.rejects(fs.stat(forbidden), error => error.code === 'ENOENT');
    console.log(JSON.stringify({ ok: true, concurrentWinner: 1, explicitPaths: true, fenceReleased: true, publicBackupRefused: true }));
  } finally {
    release.resolve(); await holding?.catch(() => {}); await first?.catch(() => {}); await app?.close();
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('guatswr-backup-concurrency-'));
    await fs.rm(root, { recursive: true, force: true });
  }
})().catch(() => { console.error('Backup concurrency check failed'); process.exitCode = 1; });
