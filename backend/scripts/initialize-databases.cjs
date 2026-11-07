// Explicit provisioning helper for isolated tools/tests. Normal server startup never calls this.
const path = require('node:path');
const { resolvePaths } = require('../src/models/db');

async function initializeDatabases(env = {}, paths = {}) {
  const resolved = resolvePaths(env, paths);
  const url = env.POSTGRES_MIGRATION_URL || env.POSTGRES_URL || process.env.POSTGRES_MIGRATION_URL || process.env.POSTGRES_URL;
  if (!url) return;
  const { initializePostgres } = require(path.join(resolved.BACKEND_ROOT, 'dist/src/migrations/postgres/engine'));
  const database = new URL(url).pathname.slice(1);
  const role = env.POSTGRES_RUNTIME_ROLE || process.env.POSTGRES_RUNTIME_ROLE || 'guatswr_app';
  await initializePostgres(url, database, role);
}

module.exports = { initializeDatabases };
