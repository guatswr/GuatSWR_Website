const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const sqlite = require('sqlite3');
const jwt = require('jsonwebtoken');
const { initializeDatabases } = require('./initialize-databases.cjs');
const { migrateDatabase } = require('../dist/src/migrations/engine');
const { createSqliteStore } = require('../dist/src/database/sqlite');
const { bootstrapAdministrator } = require('../dist/src/admin/bootstrap');
(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'guatswr-security-bridge-'));
  let app, store;
  try {
    const data = path.join(root, 'data'), custom = path.join(root, 'definitions');
    await initializeDatabases({}, { data });
    const main = path.join(data, 'guatswr_web_main.db');
    store = createSqliteStore(main);
    await bootstrapAdministrator(store, 'bridge-admin', 'synthetic-bridge-password');
    const before = await store.get('SELECT password,twofa_secret FROM users WHERE id=1');
    await store.close(); store = undefined;
    await fs.cp(path.resolve(__dirname, '../src/migrations'), custom, { recursive: true });
    const manifest = JSON.parse(await fs.readFile(path.join(custom, 'manifest.json'), 'utf8'));
    for (const kind of ['main', 'audit']) {
      manifest[kind].upgrades = [...(manifest[kind].upgrades || []), ...(manifest[kind].compatibleUpgrades || [])];
      delete manifest[kind].compatibleUpgrades;
    }
    await fs.writeFile(path.join(custom, 'manifest.json'), JSON.stringify(manifest));
    for (const [kind, filename] of [['main', main], ['audit', path.join(data, 'guatswr_web_logs.db')]]) {
      const db = await new Promise((resolve, reject) => { const db = new sqlite.Database(filename, error => error ? reject(error) : resolve(db)); });
      try { await migrateDatabase(db, custom, kind, { mode: 'upgrade' }); }
      finally { await new Promise((resolve, reject) => db.close(error => error ? reject(error) : resolve())); }
    }
    const env = { NODE_ENV: 'test', JWT_SECRET: 'synthetic-bridge-runtime-key' };
    app = await require('../src/app').createApplication({ env, paths: { data, public: path.join(data, 'public'), backups: path.join(root, 'backups') }, backgroundTasks: false, externalServices: false });
    assert.equal(app.context.mainSchemaVersion, 3); assert.equal(app.context.auditSchemaVersion, 2);
    assert.deepEqual(await app.context.sql.main.get('SELECT password,twofa_secret FROM users WHERE id=1'), before);
    const server = await app.listen(0, '127.0.0.1'), origin = `http://127.0.0.1:${server.address().port}`;
    const legacy = jwt.sign({ id: 1, username: 'bridge-admin', role: 'super_admin', token_version: 0 }, env.JWT_SECRET);
    const me = value => fetch(origin + '/api/auth/me', { headers: { Authorization: `Bearer ${value}` } });
    assert.equal((await me(legacy)).status, 200);
    await app.context.sql.main.run('UPDATE users SET auth_version=1 WHERE id=1');
    assert.equal((await me(legacy)).status, 401);
    const response = await fetch(origin + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'bridge-admin', password: 'synthetic-bridge-password' }) });
    assert.equal(response.status, 200);
    const login = await response.json();
    assert.equal(jwt.verify(login.token, env.JWT_SECRET).user_token_version, 1);
    assert.equal((await me(login.token)).status, 200);
    if (app.context.securityReady) {
      const changed = await fetch(origin + '/api/auth/profile', { method: 'PUT', headers: { Authorization: `Bearer ${login.token}`, 'content-type': 'application/json' }, body: JSON.stringify({ password: 'synthetic-updated-bridge-password' }) });
      assert.equal(changed.status, 200);
      assert.equal((await me(login.token)).status, 401);
      assert.equal((await app.context.sql.main.get('SELECT auth_version FROM users WHERE id=1')).auth_version, 2);
      // Include any intent committed while the first dispatcher batch was active.
      await app.context.securityAudit.flush(); await app.context.securityAudit.flush();
      const intent = await app.context.sql.main.get("SELECT id,delivered_at FROM security_audit_outbox WHERE action='UPDATE_PROFILE'");
      assert.ok(intent.delivered_at);
      assert.equal((await app.context.sql.audit.get('SELECT count(*) AS n FROM audit_logs WHERE source_id=?', [intent.id])).n, 1);
    }
    console.log(JSON.stringify({ ok: true, main: 3, audit: 2, credentialsPreserved: true, legacyZero: true, selectiveVersion: true, freshLogin: true, durableSecurity: Boolean(app.context.securityReady) }));
  } finally {
    await app?.close(); await store?.close();
    if (path.dirname(path.resolve(root)) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('guatswr-security-bridge-')) throw new Error('Unsafe cleanup');
    await fs.rm(root, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
