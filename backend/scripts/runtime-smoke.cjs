const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { start } = require('../server');
(async () => {
  const fs = require('node:fs/promises');
  const os = require('node:os');
  const path = require('node:path');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'guatswr-runtime-'));
  process.env.DATA_DIR = path.join(root, 'data');
  process.env.PUBLIC_DIR = path.join(root, 'public');
  process.env.BACKUP_ROOT = path.join(root, 'backups');
  await require('./initialize-databases.cjs').initializeDatabases({}, { data: process.env.DATA_DIR });
  const instance = await start();
  try {
    const version = await new Promise((resolve, reject) => instance.context.db.get('SELECT sqlite_version() AS version', (err, row) => err ? reject(err) : resolve(row.version)));
    const response = await fetch(`http://127.0.0.1:${instance.app.get('port') || process.env.PORT}/api/version`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).status, 'online');
    const main = await instance.context.sql.main.transaction(tx => tx.get('SELECT count(*) AS count FROM users'));
    const audit = await instance.context.sql.audit.get('SELECT count(*) AS count FROM audit_logs');
    assert.ok(Number.isInteger(main.count) && Number.isInteger(audit.count));
    console.log(JSON.stringify({ node: process.version, platform: process.platform, sqlite: version, sqliteCli: execFileSync('sqlite3',['--version'],{encoding:'utf8'}).trim(), sharp: require('sharp').versions.sharp, scopedSql: true }));
  } finally {
    await instance.close();
    if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('guatswr-runtime-')) throw new Error('Unsafe smoke cleanup');
    await fs.rm(root, { recursive: true, force: true });
  }
})().catch((error) => { console.error(error); process.exitCode=1; });
