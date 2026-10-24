const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { initializeDatabases } = require('./initialize-databases.cjs');
(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'guatswr-member-native-'));
  let app;
  try {
    const data = path.join(root, 'data');
    await initializeDatabases({}, { data });
    app = await require('../src/app').createApplication({ env: { NODE_ENV: 'test', JWT_SECRET: 'synthetic-member-binding-key' },
      paths: { data, public: path.join(root, 'public'), backups: path.join(root, 'backups') }, backgroundTasks: false, externalServices: false });
    await app.context.sql.main.run("INSERT INTO members(id,name,school) VALUES(13,'synthetic member','[object Object]')");
    const server = await app.listen(0, '127.0.0.1');
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/members?school[nested]=legacy`);
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).map(row => row.id), [13]);
    console.log(JSON.stringify({ ok: true, structuredSchool: true, legacyBinding: true }));
  } finally {
    await app?.close();
    if (path.dirname(path.resolve(root)) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('guatswr-member-native-')) throw new Error('Unsafe cleanup');
    await fs.rm(root, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
