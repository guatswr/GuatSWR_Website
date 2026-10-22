const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { start } = require('../server');
(async () => {
  const instance = await start();
  try {
    const version = await new Promise((resolve, reject) => instance.context.db.get('SELECT sqlite_version() AS version', (err, row) => err ? reject(err) : resolve(row.version)));
    const response = await fetch(`http://127.0.0.1:${instance.app.get('port') || process.env.PORT}/api/version`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).status, 'online');
    console.log(JSON.stringify({ node: process.version, platform: process.platform, sqlite: version, sqliteCli: execFileSync('sqlite3',['--version'],{encoding:'utf8'}).trim(), sharp: require('sharp').versions.sharp }));
  } finally { await instance.close(); }
})().catch((error) => { console.error(error); process.exitCode=1; });
