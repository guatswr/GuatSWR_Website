const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const allowed = require('../legacy-javascript.json');
const collect = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
  const filename = path.join(dir, entry.name);
  return entry.isDirectory() ? collect(filename) : entry.name.endsWith('.js') && !entry.name.endsWith('.test.js') ? [path.relative(root, filename).split(path.sep).join('/')] : [];
});
const actual = collect(path.join(root, 'src')).sort();
if (new Set(allowed).size !== allowed.length || JSON.stringify(actual) !== JSON.stringify([...allowed].sort())) {
  throw new Error('Legacy JavaScript scope changed: migrate toward TypeScript and update the reviewed shrinking ledger');
}
console.log(`Legacy JavaScript scope: ${actual.length} reviewed files`);
