// Measures controlled recovery on a private clone; never restores over a live path.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os');
const { performance } = require('node:perf_hooks');
const execute = require('node:util').promisify(require('node:child_process').execFile);
(async () => {
  const [input, output] = process.argv.slice(2);
  if (!input || !output || !path.isAbsolute(input) || !path.isAbsolute(output)) throw new Error('Explicit absolute private input/output required');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'guatswr-recovery-timing-'));
  const paths = { data: path.join(root, 'data'), public: path.join(root, 'data/public'), backups: path.join(root, 'backups') };
  await fs.mkdir(paths.data);
  for (const name of ['guatswr_web_main.db', 'guatswr_web_logs.db']) await fs.copyFile(path.join(input, name), path.join(paths.data, name));
  await fs.cp(path.join(input, 'public'), paths.public, { recursive: true });
  await fs.writeFile(path.join(paths.public, 'candidate-recovery-marker.txt'), 'controlled recovery bytes');
  const env = { NODE_ENV: 'test', JWT_SECRET: 'synthetic-recovery-timing-key' };
  const factory = require('../dist/src/app.js').createApplication;
  async function commit(sequence) {
    const instance = await factory({ env, paths, backgroundTasks: false, externalServices: false });
    try {
      const user = await instance.context.sql.main.get("SELECT id,auth_version FROM users WHERE role='super_admin' ORDER BY id LIMIT 1");
      const global = await instance.context.sql.main.get("SELECT value FROM site_config WHERE key='token_version'");
      const token = require('jsonwebtoken').sign({ id: user.id, user_token_version: user.auth_version, token_version: Number(global?.value || 0) }, env.JWT_SECRET);
      const server = await instance.listen(0, '127.0.0.1');
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/history`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token }, body: JSON.stringify({ date: '2050-01-01', title: 'candidate recovery sequence ' + sequence }) });
      assert.equal(response.status, 200); await response.arrayBuffer();
    } finally { await instance.close(); }
  }
  const bundle = path.join(__dirname, 'backup_bundle.py');
  async function backup(tag) {
    const started = performance.now();
    await execute('/bin/bash', [path.join(__dirname, 'backup_all.sh')], { env: { ...process.env, DATA_DIR: paths.data, PUBLIC_DIR: paths.public, BACKUP_ROOT: paths.backups, BACKUP_DATE_TAG: tag, BACKUP_WRITE_FENCE: 'acknowledged', BACKUP_SOURCE_REVISION: 'controlled-candidate-recovery', BACKUP_NODE_BIN: process.execPath } });
    return { archive: path.join(paths.backups, 'full', 'full_' + tag + '.tar.gz'), durationMs: performance.now() - started };
  }
  await commit(1);
  const baseline = await backup('20500101_010101_candidate');
  await commit(2); // A later committed write must not be erased by blind rollback.
  const obsoleteTarget = path.join(root, 'obsolete-point');
  await execute('python3', [bundle, 'restore', baseline.archive, '--target', obsoleteTarget]);
  const obsolete = require('../dist/src/database/sqlite.js').createSqliteStore(path.join(obsoleteTarget, 'data/guatswr_web_main.db'));
  try { assert.equal((await obsolete.get("SELECT count(*) AS n FROM history WHERE title='candidate recovery sequence 2'")).n, 0); }
  finally { await obsolete.close(); }
  const finalPoint = await backup('20500101_010102_candidate');
  const recoveryStarted = performance.now();
  await execute('python3', [bundle, 'verify', finalPoint.archive, '--work-dir', root]);
  const verifiedAt = performance.now(), target = path.join(root, 'restored-point');
  await execute('python3', [bundle, 'restore', finalPoint.archive, '--target', target]);
  const restoredAt = performance.now();
  const restored = await factory({ env, paths: { data: path.join(target, 'data'), public: path.join(target, 'data/public'), backups: path.join(target, 'backups') }, backgroundTasks: false, externalServices: false });
  try {
    const server = await restored.listen(0, '127.0.0.1'), origin = `http://127.0.0.1:${server.address().port}`;
    const history = await fetch(origin + '/api/history'); assert.equal(history.status, 200);
    const rows = await history.json();
    for (const sequence of [1, 2]) assert.ok(rows.some(row => row.title === 'candidate recovery sequence ' + sequence));
    const resource = await fetch(origin + '/uploads/candidate-recovery-marker.txt');
    assert.equal(resource.status, 200); assert.equal(await resource.text(), 'controlled recovery bytes');
    const report = { consistency: 'quiesced-attested', controlledWrites: 2, restoredControlledWrites: 2, lostControlledWrites: 0, controlledRpoMs: 0, obsoletePointWouldLoseWrites: 1, firstBackupMs: baseline.durationMs, finalBackupMs: finalPoint.durationMs, verifyMs: verifiedAt - recoveryStarted, restoreMs: restoredAt - verifiedAt, startupAndHttpMs: performance.now() - restoredAt, rtoMs: performance.now() - recoveryStarted, archiveBytes: (await fs.stat(finalPoint.archive)).size, originalPathsOverwritten: false };
    await fs.writeFile(output, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  } finally { await restored.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
