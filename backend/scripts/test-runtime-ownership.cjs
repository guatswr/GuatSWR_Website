const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { constants } = require('node:fs');
(async () => {
  assert.notEqual(process.getuid(), 0, 'Runtime must not run as root');
  for (const filename of ['/app/package.json', '/app/dist/server.js']) {
    await fs.access(filename, constants.R_OK);
    await assert.rejects(fs.access(filename, constants.W_OK), error => ['EACCES', 'EROFS'].includes(error.code));
  }
  for (const directory of ['/app/data', '/app/backups']) {
    assert.equal((await fs.stat(directory)).uid, process.getuid());
    await fs.access(directory, constants.W_OK);
  }
  console.log(JSON.stringify({ nonRoot: true, uid: process.getuid(), codeReadOnly: true, stateWritable: true }));
})().catch(() => { console.error('Runtime ownership validation failed'); process.exitCode = 1; });
