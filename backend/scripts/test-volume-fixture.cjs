// Synthetic state only; invoked by test-runtime-volumes.ps1 in disposable volumes.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
(async () => {
  assert.notEqual(process.getuid(), 0);
  if (process.argv[2] === 'provision') {
    await require('./initialize-databases.cjs').initializeDatabases({}, { data: '/app/data' });
    const store = require('../dist/src/database/sqlite.js').createSqliteStore('/app/data/guatswr_web_main.db');
    try {
      await store.run('INSERT INTO users(id,username,password,role) VALUES (1,?,?,?)', ['volume-owner', require('bcryptjs').hashSync('synthetic-volume-password', 10), 'super_admin']);
      await store.run("INSERT INTO members(name,tags) VALUES ('synthetic-volume-member','[]')");
    } finally { await store.close(); }
    await fs.mkdir('/app/data/public', { recursive: true });
    await fs.writeFile('/app/data/public/persistent.txt', 'synthetic persistent volume bytes');
    await fs.mkdir('/app/backups/full', { recursive: true });
    await fs.writeFile('/app/backups/full/fixture.tar.gz', 'synthetic backup volume bytes');
    return;
  }
  const origin = 'http://127.0.0.1:3000';
  const response = await fetch(origin + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'volume-owner', password: 'synthetic-volume-password' }), signal: AbortSignal.timeout(5000) });
  assert.equal(response.status, 200);
  const token = (await response.json()).token;
  assert.ok((await (await fetch(origin + '/api/members')).json()).some(member => member.name === 'synthetic-volume-member'));
  assert.equal(await (await fetch(origin + '/uploads/persistent.txt')).text(), 'synthetic persistent volume bytes');
  const download = await fetch(origin + '/api/admin/backups/download?file=fixture.tar.gz', { headers: { authorization: `Bearer ${token}` } });
  assert.equal(download.status, 200);
  assert.equal(await download.text(), 'synthetic backup volume bytes');
  const data = new FormData();
  data.set('file', new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==', 'base64')], { type: 'image/png' }), 'volume.png');
  const upload = await fetch(origin + '/api/upload', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: data });
  assert.equal(upload.status, 200);
  const image = (await upload.json()).url;
  assert.equal((await fetch(origin + image)).status, 200);
  const disk = path.join('/app/data/public', image.slice('/uploads/'.length));
  assert.equal((await fs.stat(disk)).uid, process.getuid());
  console.log(JSON.stringify({ volumeLogin: true, resourceRead: true, nativeImageUpload: true, privateBackupDownload: true }));
})().catch(error => { console.error(error); process.exitCode = 1; });
