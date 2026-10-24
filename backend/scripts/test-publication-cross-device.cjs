const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { initializeDatabases } = require('./initialize-databases.cjs');
(async () => {
  // This fixture is used only inside a disposable container with the exact
  // destination directory mounted as tmpfs. Never accepts a production path.
  const root = '/tmp/guatswr-cross-volume', data = path.join(root, 'data'), publicRoot = path.join(root, 'public');
  await fs.mkdir(data, { recursive: true });
  await assert.rejects(fs.stat(path.join(data, 'guatswr_web_main.db')), error => error.code === 'ENOENT');
  await initializeDatabases({}, { data });
  const secret = 'synthetic-publication-volume-key';
  const app = await require('../src/app').createApplication({ env: { NODE_ENV: 'test', JWT_SECRET: secret },
    paths: { data, public: publicRoot, backups: path.join(root, 'backups') }, backgroundTasks: false, externalServices: false });
  try {
    const user = await app.context.sql.main.run("INSERT INTO users(username,password,role) VALUES('synthetic-volume','unused','super_admin')");
    const token = require('jsonwebtoken').sign({ id: user.lastID, token_version: 0 }, secret);
    const server = await app.listen(0, '127.0.0.1'), origin = `http://127.0.0.1:${server.address().port}`;
    const source = path.join(app.context.UPLOADS_DIR, 'cross.png');
    await fs.writeFile(source, 'synthetic staged image bytes');
    const destinationDir = app.context.storage.getConfigDir('home_bg');
    assert.notEqual((await fs.stat(source)).dev, (await fs.stat(destinationDir)).dev, 'fixture must cross real filesystems');
    const save = name => fetch(origin + '/api/config', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ key: 'home_bg', value: '/uploads/upload/' + name }) });
    assert.equal((await save('cross.png')).status, 200);
    assert.equal(await fs.readFile(path.join(destinationDir, 'cross.png'), 'utf8'), 'synthetic staged image bytes');
    await fs.writeFile(path.join(app.context.UPLOADS_DIR, 'failed.png'), 'preserve after rollback');
    await new Promise((resolve, reject) => app.context.db.run("CREATE TRIGGER fail_volume_publish BEFORE INSERT ON site_config WHEN NEW.key='home_bg' BEGIN SELECT RAISE(ABORT,'synthetic'); END", error => error ? reject(error) : resolve()));
    assert.equal((await save('failed.png')).status, 500);
    assert.equal(await fs.readFile(path.join(app.context.UPLOADS_DIR, 'failed.png'), 'utf8'), 'preserve after rollback');
    assert.equal((await app.context.sql.main.get("SELECT value FROM site_config WHERE key='home_bg'")).value, '/uploads/img/bg/home/cross.png');
    assert.equal((await app.context.sql.main.get("SELECT last_error FROM asset_cleanup_jobs WHERE url='/uploads/img/bg/home/failed.png'")).last_error, 'cross_device');
    await new Promise((resolve, reject) => app.context.db.run('DROP TRIGGER fail_volume_publish', error => error ? reject(error) : resolve()));
    const free = await fs.statfs(destinationDir), filler = path.join(destinationDir, 'fill-volume.bin');
    await fs.writeFile(filler, Buffer.alloc(Math.max(0, Number(free.bavail) * Number(free.bsize) - 4096)));
    const fullSource = path.join(app.context.UPLOADS_DIR, 'full.png');
    await fs.writeFile(fullSource, Buffer.alloc(2 * 1024 * 1024, 7));
    assert.equal((await save('full.png')).status, 500);
    assert.equal((await fs.stat(fullSource)).size, 2 * 1024 * 1024);
    assert.equal((await app.context.sql.main.get("SELECT value FROM site_config WHERE key='home_bg'")).value, '/uploads/img/bg/home/cross.png');
    console.log(JSON.stringify({ ok: true, crossDevice: true, committedCopy: true, rollbackSourcePreserved: true, quarantineRetry: true, diskFull: true }));
  } finally { await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
