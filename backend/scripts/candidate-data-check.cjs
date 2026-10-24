// Explicit private copies only. No original database is opened or migrated.
const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os');
const { createHash, randomUUID } = require('node:crypto');
const assert = require('node:assert/strict');
const sqlite = require('sqlite3');
const hash = value => createHash('sha256').update(value).digest('hex');
const quote = value => '"' + value.replaceAll('"', '""') + '"';
const open = filename => new Promise((resolve, reject) => { const db = new sqlite.Database(filename, error => error ? reject(error) : resolve(db)); });
const all = (db, sql) => new Promise((resolve, reject) => db.all(sql, (error, rows) => error ? reject(error) : resolve(rows)));
const run = (db, sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, error => error ? reject(error) : resolve()));
const close = db => new Promise((resolve, reject) => db.close(error => error ? reject(error) : resolve()));
async function inventory(db, projection) {
  const tables = projection || Object.fromEntries(await Promise.all((await all(db, "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name!='_guatswr_migrations'")).map(async row => [row.name, (await all(db, 'PRAGMA table_info(' + quote(row.name) + ')')).map(column => column.name)])));
  const values = {};
  for (const [table, columns] of Object.entries(tables)) {
    const rows = await all(db, 'SELECT ' + columns.map(quote).join(',') + ' FROM ' + quote(table));
    values[table] = { count: rows.length, hash: hash(rows.map(row => JSON.stringify(row)).sort().join('\n')) };
  }
  return { tables, values };
}
async function resourceDigest(root) {
  const files = [];
  async function walk(directory) {
    for (const item of await fs.readdir(directory, { withFileTypes: true })) {
      assert.ok(!item.isSymbolicLink(), 'Private candidate input must contain ordinary files only');
      const filename = path.join(directory, item.name);
      if (item.isDirectory()) await walk(filename);
      else if (item.isFile()) files.push([path.relative(root, filename), hash(await fs.readFile(filename))]);
    }
  }
  await walk(root); files.sort((a, b) => a[0].localeCompare(b[0]));
  return { count: files.length, hash: hash(JSON.stringify(files)) };
}
(async () => {
  const [mode, input, output] = process.argv.slice(2);
  if (!['prepare', 'read'].includes(mode) || !input || !output || !path.isAbsolute(input) || !path.isAbsolute(output)) throw new Error('Explicit mode and absolute input/output required');
  const work = await fs.mkdtemp(path.join(os.tmpdir(), 'guatswr-candidate-data-'));
  const data = path.join(work, 'data'), publicRoot = path.join(data, 'public');
  await fs.mkdir(data);
  for (const name of ['guatswr_web_main.db', 'guatswr_web_logs.db']) await fs.copyFile(path.join(input, name), path.join(data, name));
  await fs.cp(path.join(input, 'public'), publicRoot, { recursive: true, dereference: false });
  if (mode === 'prepare') {
    const { inspectSchema, migrateDatabase } = require('../dist/src/migrations/engine.js');
    const root = path.join(__dirname, '../src/migrations');
    const reports = [];
    for (const [kind, name] of [['main', 'guatswr_web_main.db'], ['audit', 'guatswr_web_logs.db']]) {
      const db = await open(path.join(data, name));
      try {
        const before = await inventory(db), shape = await inspectSchema(db);
        await migrateDatabase(db, root, kind, { mode: 'adopt', expectedFingerprint: shape.fingerprint });
        assert.deepEqual((await inventory(db, before.tables)).values, before.values);
        assert.equal((await all(db, 'PRAGMA integrity_check'))[0].integrity_check, 'ok');
        reports.push({ kind, businessTables: Object.keys(before.values).length, rows: Object.values(before.values).reduce((sum, row) => sum + row.count, 0), preserved: true });
        if (kind === 'main') {
          await run(db, "INSERT INTO history(date,title) VALUES('2050-01-01','synthetic post-migration write')");
          await run(db, "UPDATE users SET auth_version=1 WHERE id=(SELECT id FROM users WHERE role='super_admin' ORDER BY id LIMIT 1)");
          await run(db, 'INSERT INTO asset_cleanup_jobs(id,url,identity) VALUES(?,?,?)', [randomUUID(), '/uploads/candidate-not-present.png', '1:1:1:1:1']);
        }
      } finally { await close(db); }
    }
    await fs.mkdir(output); // must be a fresh destination
    for (const name of ['guatswr_web_main.db', 'guatswr_web_logs.db']) await fs.copyFile(path.join(data, name), path.join(output, name));
    await fs.cp(publicRoot, path.join(output, 'public'), { recursive: true });
    console.log(JSON.stringify({ originalRowsPreserved: reports, resources: await resourceDigest(publicRoot), syntheticPostMigrationWrite: true, userVersionExpanded: true, pendingCleanupPreservedForRollback: true }));
    return;
  }
  const before = {};
  for (const name of ['guatswr_web_main.db', 'guatswr_web_logs.db']) { const db = await open(path.join(data, name)); try { before[name] = await inventory(db); } finally { await close(db); } }
  const resourceBefore = await resourceDigest(publicRoot);
  const { createReadOnlyApplication } = require('./read-only-server.cjs');
  const instance = await createReadOnlyApplication({ env: { NODE_ENV: 'test', JWT_SECRET: 'synthetic-candidate-reader-secret', SITE_URL: 'https://candidate.invalid' }, paths: { data, public: publicRoot, backups: path.join(work, 'backups') } });
  const responses = {};
  try {
    assert.equal(instance.context.timers.size, 0);
    const server = await instance.listen(0, '127.0.0.1'), origin = `http://127.0.0.1:${server.address().port}`;
    const user = await instance.context.sql.main.get("SELECT id,auth_version FROM users WHERE role='super_admin' ORDER BY id LIMIT 1");
    assert.ok(user);
    const version = await instance.context.sql.main.get("SELECT value FROM site_config WHERE key='token_version'");
    const sign = userVersion => require('jsonwebtoken').sign({ id: user.id, token_version: Number(version?.value || 0), user_token_version: userVersion }, 'synthetic-candidate-reader-secret');
    const routes = [['/api/version'], ['/api/config'], ['/api/activities'], ['/api/history'], ['/api/members'], ['/api/members/stats/schools'], ['/api/event'], ['/api/logs'], ['/api/logs/stats'], ['/sitemap.xml'], ['/api/auth/me', true], ['/api/admin/users', true], ['/api/admin/events/pending', true], ['/api/admin/logs', true]];
    for (const [route, authenticated] of routes) {
      const response = await fetch(origin + route, { headers: authenticated ? { authorization: 'Bearer ' + sign(user.auth_version) } : {}, signal: AbortSignal.timeout(10000) });
      assert.equal(response.status, 200, route);
      const body = await response.text(); responses[route] = { status: response.status, hash: hash(body), bytes: Buffer.byteLength(body) };
    }
    assert.equal((await fetch(origin + '/api/auth/me', { headers: { authorization: 'Bearer ' + sign(0) } })).status, 401);
    assert.equal((await fetch(origin + '/api/auth/login', { method: 'POST' })).status, 503);
    assert.equal((await instance.context.sql.main.get("SELECT count(*) AS n FROM history WHERE title='synthetic post-migration write'")).n, 1);
    await assert.rejects(instance.context.sql.main.run("DELETE FROM site_config WHERE key='candidate-never-existing'"), { code: 'database_unavailable', sqliteCode: 'SQLITE_READONLY' });
    assert.equal(instance.context.timers.size, 0);
  } finally { await instance.close(); }
  for (const name of Object.keys(before)) { const db = await open(path.join(data, name)); try { assert.deepEqual((await inventory(db, before[name].tables)).values, before[name].values); } finally { await close(db); } }
  assert.deepEqual(await resourceDigest(publicRoot), resourceBefore);
  await fs.writeFile(output, JSON.stringify({ responses, resourceDigest: resourceBefore, businessRowsUnchanged: true, rawSqlWriteRefused: true, httpWriteRefused: true, staleTokenRefused: true, timers: 0 }));
  console.log(JSON.stringify({ readOnlyOperations: Object.keys(responses).length, resources: resourceBefore.count, businessRowsUnchanged: true, rawSqlWriteRefused: true, httpWriteRefused: true, staleTokenRefused: true, timers: 0 }));
})().catch(() => { console.error('Candidate data check failed; private diagnostics must stay local.'); process.exitCode = 1; });
