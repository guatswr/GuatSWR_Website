// Explicit provisioning helper for isolated tools/tests. Normal server startup never calls this.
const fs = require('node:fs/promises');
const path = require('node:path');
const sqlite = require('sqlite3');
const { resolvePaths } = require('../src/models/db');
async function initializeDatabases(env, paths) {
  if (!paths?.data || !path.isAbsolute(paths.data)) throw new Error('Explicit absolute data directory required');
  const resolved = resolvePaths(env, paths);
  const { migrateDatabase } = require(path.join(resolved.BACKEND_ROOT, 'dist/src/migrations/engine'));
  for (const [kind, filename] of [['main', resolved.dbPath], ['audit', resolved.logDbPath]]) {
    await fs.mkdir(path.dirname(filename), { recursive: true });
    const db = await new Promise((resolve, reject) => { const connection = new sqlite.Database(filename, error => error ? reject(error) : resolve(connection)); });
    try { await migrateDatabase(db, path.join(resolved.BACKEND_ROOT, 'src/migrations'), kind, { mode: 'initialize' }); }
    finally { await new Promise((resolve, reject) => db.close(error => error ? reject(error) : resolve())); }
  }
}
module.exports = { initializeDatabases };
