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
const store = process.env.DATABASE_DRIVER === 'postgres'
  ? require('../../dist/src/database/postgres.js').createPostgresStore({ connectionString: process.env.POSTGRES_URL, schema: 'main' })
  : createSqliteStore(path.resolve(filename));
processCleanupJob(store, root, quarantine, id).catch(() => { process.exitCode = 1; });
