const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createApplication } = require('./helpers/application.cjs');
const { inspectSchema, migrateDatabase } = require('../dist/src/migrations/engine');
const migrations = path.resolve(__dirname, '../src/migrations');
const adoptFixture = async db => {
  // Construct a synthetic pre-v2 legacy fixture, never discard real pending intent.
  const securityJobs = await new Promise((resolve, reject) => db.get('SELECT count(*) AS n FROM security_audit_outbox', (error, row) => error ? reject(error) : resolve(row)));
  assert.equal(securityJobs.n, 0);
  const revoked = await new Promise((resolve, reject) => db.get('SELECT count(*) AS n FROM users WHERE auth_version<>0', (error, row) => error ? reject(error) : resolve(row)));
  assert.equal(revoked.n, 0);
  await new Promise((resolve, reject) => db.exec('DROP TABLE security_audit_outbox; ALTER TABLE users DROP COLUMN auth_version;', error => error ? reject(error) : resolve()));
  const jobs = await new Promise((resolve, reject) => db.get('SELECT count(*) AS n FROM asset_cleanup_jobs', (error, row) => error ? reject(error) : resolve(row)));
  assert.equal(jobs.n, 0);
  await new Promise((resolve, reject) => db.exec('DROP TABLE asset_cleanup_jobs', error => error ? reject(error) : resolve()));
  await new Promise((resolve, reject) => db.exec('DROP TABLE _guatswr_migrations', error => error ? reject(error) : resolve()));
  const current = await inspectSchema(db);
  await migrateDatabase(db, migrations, 'main', { mode: 'adopt', expectedFingerprint: current.fingerprint });
};
const fixture = async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'guatswr-backend-'));
  const resources = [];
  t.after(async () => {
    for (const resource of resources) await resource.close();
    assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep));
    assert.ok(path.basename(root).startsWith('guatswr-backend-'));
    await fs.rm(root, { recursive: true, force: true });
  });
  return { resources, env: { JWT_SECRET: 'isolated-test-key', NODE_ENV: 'test' }, paths: {
    data: path.join(root, 'data'), public: path.join(root, 'public'), backups: path.join(root, 'backups')
  }, backgroundTasks: false, externalServices: false };
};
const get = (db, sql) => new Promise((resolve, reject) => db.get(sql, (e, row) => e ? reject(e) : resolve(row)));

test('import exposes a factory without creating a default application', () => {
  assert.equal(typeof createApplication, 'function');
  assert.equal(require('../src/app').app, undefined);
});

test('two applications have independent real databases, resources and HTTP state', async (t) => {
  const optionsA = await fixture(t);
  const a = await createApplication(optionsA);
  optionsA.resources.push(a);
  t.diagnostic(JSON.stringify({ node: process.version, platform: process.platform, sqlite: (await get(a.context.db, 'SELECT sqlite_version() AS version')).version, sharp: require('sharp').versions.sharp }));
  const optionsB = await fixture(t);
  const b = await createApplication(optionsB);
  optionsB.resources.push(b);
  await new Promise((resolve, reject) => a.context.db.run("INSERT INTO site_config VALUES ('isolation', 'a')", (e) => e ? reject(e) : resolve()));
  assert.equal(await get(b.context.db, "SELECT * FROM site_config WHERE key='isolation'"), undefined);
  for (const instance of [a, b]) {
    assert.equal((await get(instance.context.db, 'PRAGMA foreign_keys')).foreign_keys, 1);
    assert.equal((await get(instance.context.logDb, 'PRAGMA journal_mode')).journal_mode, 'wal');
    assert.equal((await get(instance.context.db, "SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != '_guatswr_migrations'" )).n, 11);
    assert.equal((await get(instance.context.logDb, "SELECT count(*) AS n FROM audit_logs")).n, 0);
    assert.equal(instance.context.timers.size, 0);
    const server = await instance.listen(0, '127.0.0.1');
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/version`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { version: '4.0', status: 'online' });
  }
  assert.notEqual(a.context.PUBLIC_DIR, b.context.PUBLIC_DIR);
  await a.close();
  await a.close();
  assert.equal((await get(b.context.db, 'SELECT 1 AS n')).n, 1);
});

test('missing secret and database open failure reject before listening', async (t) => {
  const options = await fixture(t);
  await assert.rejects(createApplication({ ...options, env: {} }), /JWT_SECRET/);
  await fs.mkdir(options.paths.data, { recursive: true });
  await fs.writeFile(path.join(options.paths.data, 'blocked'), 'file');
  await assert.rejects(createApplication({ ...options, env: { ...options.env, LOG_DB_PATH: 'blocked/logs.db' } }), /SQLITE_CANTOPEN|ENOTDIR|EEXIST/);
});

test('all 71 frozen API operations are still mounted', async (t) => {
  const options = await fixture(t);
  const instance = await createApplication(options);
  options.resources.push(instance);
  const prefixes = ['/api/auth', '/api/admin', '/api/activities', '/api/members', '/api/history', '/api/config', '/api/upload/visitor', '/api/upload', '/api/logs', '/api/bot', '/api/event'];
  const routers = instance.app._router.stack.filter((layer) => layer.name === 'router');
  assert.equal(routers.length, prefixes.length);
  const operations = ['GET /api/version'];
  routers.forEach((layer, index) => {
    assert.ok(layer.regexp.test(prefixes[index]));
    for (const item of layer.handle.stack) {
      if (!item.route) continue;
      for (const method of Object.keys(item.route.methods)) {
        operations.push(`${method.toUpperCase()} ${prefixes[index]}${item.route.path === '/' ? '' : item.route.path}`);
      }
    }
  });
  const frozen = require('../../docs/backend-modernization/evidence/baseline.json');
  assert.deepEqual(operations.sort(), frozen.operations.map((entry) => entry.operation).sort());
});

test('background tasks start after listen and close clears timers and both connections', async (t) => {
  const options = await fixture(t);
  const instance = await createApplication({ ...options, backgroundTasks: true });
  options.resources.push(instance);
  assert.equal(instance.context.timers.size, 0);
  await instance.listen(0, '127.0.0.1');
  assert.equal(instance.context.timers.size, 5);
  await instance.close();
  assert.equal(instance.context.timers.size, 0);
  await assert.rejects(get(instance.context.db, 'SELECT 1'), /SQLITE_MISUSE/);
  await assert.rejects(get(instance.context.logDb, 'SELECT 1'), /SQLITE_MISUSE/);
  await assert.rejects(instance.listen(0, '127.0.0.1'), /closed/);
});

test('listen failure does not start jobs and can be closed', async (t) => {
  const firstOptions = await fixture(t);
  const first = await createApplication(firstOptions);
  firstOptions.resources.push(first);
  const server = await first.listen(0, '127.0.0.1');
  const options = await fixture(t);
  const instance = await createApplication({ ...options, backgroundTasks: true });
  options.resources.push(instance);
  await assert.rejects(instance.listen(server.address().port, '127.0.0.1'), /EADDRINUSE/);
  assert.equal(instance.context.timers.size, 0);
  await instance.close();
});

test('reopening a synthetic legacy database preserves records, extra columns and constraints', async (t) => {
  const options = await fixture(t);
  const first = await createApplication(options);
  options.resources.push(first);
  const run = (sql) => new Promise((resolve, reject) => first.context.db.run(sql, (e) => e ? reject(e) : resolve()));
  await run('ALTER TABLE members ADD COLUMN bio TEXT');
  await run("INSERT INTO members (name, bio, tags) VALUES ('synthetic-member', 'legacy extra', '[\"old\"]')");
  await adoptFixture(first.context.db);
  await first.close();
  const second = await createApplication(options);
  options.resources.push(second);
  assert.deepEqual(await get(second.context.db, 'SELECT name, bio, tags FROM members'), {
    name: 'synthetic-member', bio: 'legacy extra', tags: '["old"]'
  });
  assert.equal((await get(second.context.db, "SELECT count(*) AS n FROM pragma_index_list('event_participants') WHERE [unique]=1")).n, 2);
  assert.equal((await get(second.context.db, "SELECT on_delete FROM pragma_foreign_key_list('event_participants')")).on_delete, 'CASCADE');
});

test('test isolation blocks configured outgoing hooks and backup execution', async (t) => {
  const options = await fixture(t);
  const instance = await createApplication({ ...options, env: { ...options.env, ASTRBOT_WEBHOOK_URL: 'http://127.0.0.1:1' } });
  options.resources.push(instance);
  assert.deepEqual(await instance.context.bot.notifyMemberAdded({ id: 1 }), { skipped: true, reason: 'External services disabled' });
  await assert.rejects(instance.context.scheduler.runAutoBackup(), /External services disabled/);
  await assert.rejects(createApplication({ env: options.env }), /explicit/);
});

test('importing every app component needs neither a secret nor a database binding', () => {
  const { execFileSync } = require('node:child_process');
  const output = execFileSync(process.execPath, ['-e', `
    const fs = require('node:fs');
    fs.mkdirSync = () => { throw new Error('unexpected mkdir during import'); };
    global.setInterval = () => { throw new Error('unexpected timer during import'); };
    const path = require('node:path');
    const root = ${JSON.stringify(path.resolve(__dirname, '../src'))};
    for (const dir of ['routes', 'middlewares', 'models', 'utils']) {
      for (const file of fs.readdirSync(path.join(root, dir))) {
        if (file.endsWith('.js') && !file.endsWith('.test.js')) require(path.join(root, dir, file));
      }
    }
    require(path.join(root, 'app.js'));
    process.stdout.write('import-only');
  `], { env: { ...process.env, JWT_SECRET: '', DB_PATH: '/must-not-open/main.db', LOG_DB_PATH: '/must-not-open/logs.db' }, timeout: 5000 });
  assert.equal(output.toString(), 'import-only');
});

test('closing during pending listen releases the port without starting tasks', async (t) => {
  const options = await fixture(t);
  const instance = await createApplication({ ...options, backgroundTasks: true });
  options.resources.push(instance);
  const pending = instance.listen(0, '127.0.0.1');
  const closed = instance.close();
  const server = await pending;
  await closed;
  assert.equal(server.listening, false);
  assert.equal(instance.context.timers.size, 0);
});

test('the server executable reports missing config with a nonzero exit', async (t) => {
  const options = await fixture(t);
  const { spawnSync } = require('node:child_process');
  const result = spawnSync(process.execPath, [path.resolve(__dirname, '../server.js')], {
    cwd: path.dirname(options.paths.data),
    env: { ...process.env, JWT_SECRET: '' }, encoding: 'utf8', timeout: 5000
  });
  assert.equal(result.status, 1);
  assert.match(result.stdout + result.stderr, /invalid_configuration/);
  await assert.rejects(fs.access(options.paths.data), /ENOENT/);
});

test('schema initialization errors reject and release the database for repair', async (t) => {
  const options = await fixture(t);
  const first = await createApplication(options);
  options.resources.push(first);
  const run = (db, sql) => new Promise((resolve, reject) => db.run(sql, (e) => e ? reject(e) : resolve()));
  await run(first.context.db, 'DROP INDEX idx_activities_date');
  await run(first.context.db, 'ALTER TABLE activities RENAME COLUMN date TO legacy_date');
  const dbPath = first.context.dbPath;
  await first.close();
  await assert.rejects(createApplication(options), /MIGRATION_SCHEMA_DRIFT/);
  const sqlite = require('sqlite3');
  const repair = await new Promise((resolve, reject) => {
    const db = new sqlite.Database(dbPath, (e) => e ? reject(e) : resolve(db));
  });
  try {
    await run(repair, 'ALTER TABLE activities RENAME COLUMN legacy_date TO date');
    await run(repair, 'CREATE INDEX idx_activities_date ON activities(date)');
    await adoptFixture(repair);
  }
  finally { await new Promise((resolve, reject) => repair.close((e) => e ? reject(e) : resolve())); }
  const recovered = await createApplication(options);
  options.resources.push(recovered);
  assert.equal((await get(recovered.context.db, 'SELECT count(*) AS n FROM activities')).n, 0);
});
