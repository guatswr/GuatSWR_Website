const assert = require('node:assert/strict');
const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os');
(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'guatswr-read-only-'));
  const paths = { data: path.join(root, 'data'), public: path.join(root, 'public'), backups: path.join(root, 'backups') };
  await require('./initialize-databases.cjs').initializeDatabases({}, paths);
  const store = require('../dist/src/database/sqlite.js').createSqliteStore(path.join(paths.data, 'guatswr_web_main.db'));
  await store.run("INSERT INTO users(id,username,password,role) VALUES(1,'synthetic-read-only','unusable-password','super_admin')");
  await store.close();
  await fs.mkdir(path.join(paths.backups, 'full'), { recursive: true });
  await fs.writeFile(path.join(paths.backups, 'full', 'fixture.tar.gz'), 'synthetic read-only bytes');
  const secret = 'synthetic-read-only-secret';
  const instance = await require('./read-only-server.cjs').createReadOnlyApplication({ env: { NODE_ENV: 'test', JWT_SECRET: secret }, paths });
  try {
    const server = await instance.listen(0, '127.0.0.1'), origin = `http://127.0.0.1:${server.address().port}`;
    assert.equal(instance.context.timers.size, 0);
    assert.equal((await fetch(origin + '/api/version')).status, 200);
    assert.equal((await fetch(origin + '/api/auth/login', { method: 'POST' })).status, 503);
    await assert.rejects(instance.context.sql.main.run("DELETE FROM users WHERE id=-1"), { sqliteCode: 'SQLITE_READONLY' });
    const token = require('jsonwebtoken').sign({ id: 1, token_version: 0, user_token_version: 0 }, secret);
    const download = await fetch(origin + '/api/admin/backups/download?file=fixture.tar.gz', { headers: { authorization: 'Bearer ' + token } });
    assert.equal(download.status, 200);
    assert.equal(await download.text(), 'synthetic read-only bytes');
    assert.equal((await instance.context.sql.audit.get('SELECT count(*) AS n FROM audit_logs')).n, 0);
    assert.equal((await instance.context.sql.main.get('SELECT count(*) AS n FROM users')).n, 1);
    console.log(JSON.stringify({ queryOnly: true, writes503: true, reads200: true, getAuditSideEffectRefused: true, backgroundTimers: 0 }));
  } finally { await instance.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
