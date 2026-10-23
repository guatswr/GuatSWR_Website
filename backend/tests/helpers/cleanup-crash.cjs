const path = require('node:path');
const fs = require('node:fs/promises');
const rename = fs.rename;
fs.rename = async (...args) => {
  await rename(...args);
  process.stdout.write('RENAMED\n');
  await new Promise(() => {});
};
const { createSqliteStore } = require('../../dist/src/database/sqlite.js');
const { processCleanupJob } = require('../../dist/src/storage/cleanup.js');
const [filename, root, quarantine, id] = process.argv.slice(2);
const store = createSqliteStore(path.resolve(filename));
processCleanupJob(store, root, quarantine, id).catch(() => { process.exitCode = 1; });
