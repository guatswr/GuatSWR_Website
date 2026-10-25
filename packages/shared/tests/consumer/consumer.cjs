const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const names = ['@guatswr/shared', '@guatswr/shared/config', '@guatswr/shared/event-labels', '@guatswr/shared/admin-workflows', '@guatswr/shared/backend-v1', '@guatswr/shared/bot'];
(async () => {
  for (const name of names) {
    const common = require(name);
    const esm = await import(name);
    assert.deepEqual(Object.keys(common).sort(), Object.keys(esm).sort(), name);
    const resolved = require.resolve(name);
    assert.ok(resolved.includes(`${path.sep}dist${path.sep}cjs${path.sep}`), resolved);
    assert.ok(!resolved.endsWith('.ts'));
  }
  const common = require('@guatswr/shared');
  const esm = await import('@guatswr/shared');
  const payload = { username: ' admin ', password: ' pass ' };
  assert.deepEqual(common.loginSchema.parse(payload), esm.loginSchema.parse(payload));
  assert.deepEqual(common.loginSchema.parse(payload), { username: 'admin', password: ' pass ' });
  assert.equal(fs.existsSync(path.join(__dirname, 'node_modules/@guatswr/shared/src')), false);
  console.log(JSON.stringify({ esmAndCommonJS: true, subpaths: names.length, publishedDeclarations: true, sourceAbsent: true }));
})().catch(error => { console.error(error); process.exitCode = 1; });
