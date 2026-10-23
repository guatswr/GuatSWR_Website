const path = require('node:path');
const fs = require('node:fs/promises');
const syncFs = require('node:fs');
// Runtime paths are anchored to package metadata in source and dist.
const findBackendRoot = (start) => {
  let current = path.resolve(start);
  for (let depth = 0; depth < 16; depth += 1) {
    try {
      const metadata = JSON.parse(syncFs.readFileSync(path.join(current, 'package.json'), 'utf8'));
      if (metadata.name === 'guiair-backend') return current;
    } catch (error) {
      if (!['ENOENT','ENOTDIR'].includes(error.code)) throw error;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  throw new Error('Backend package root not found');
};


const resolvePaths = (env, paths = {}) => {
  const BACKEND_ROOT = findBackendRoot(__dirname);
  const DATA_DIR = path.resolve(paths.data || env.DATA_DIR || path.join(BACKEND_ROOT, 'data'));
  const PUBLIC_DIR = path.resolve(paths.public || env.PUBLIC_DIR || path.join(DATA_DIR, 'public'));
  const resolveDb = (value, fallback) => path.resolve(DATA_DIR, value || fallback);
  return {
    BACKEND_ROOT, DATA_DIR, PUBLIC_DIR,
    BACKUP_ROOT: path.resolve(paths.backups || env.BACKUP_ROOT || path.join(BACKEND_ROOT, 'backups')),
    UPLOADS_DIR: path.join(PUBLIC_DIR, 'upload'),
    PRIVATE_UPLOADS_DIR: path.join(DATA_DIR, 'private-upload'),
    IMG_ROOT_DIR: path.join(PUBLIC_DIR, 'img'),
    HISTORY_ROOT_DIR: path.join(PUBLIC_DIR, 'img', 'History'),
    ICON_SVG_DIR: path.join(PUBLIC_DIR, 'icon_svg'),
    dbPath: resolveDb(env.DB_PATH, 'guatswr_web_main.db'),
    logDbPath: resolveDb(env.LOG_DB_PATH, 'guatswr_web_logs.db')
  };
};
const run = (db, sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function (error) { error ? reject(error) : resolve(this); });
});
const close = (db) => new Promise((resolve, reject) => db.close((error) => error ? reject(error) : resolve()));

const createDatabase = async ({ env, paths, logger }) => {
  const resolved = resolvePaths(env, paths);
  if (resolved.dbPath === resolved.logDbPath) throw new Error('Main and audit databases must be different files');
  const sqlite3 = require('sqlite3').verbose();

  const { checkDatabase } = require(path.join(resolved.BACKEND_ROOT, 'dist/src/migrations/engine'));
  const { createSqliteStore } = require(path.join(resolved.BACKEND_ROOT, 'dist/src/database/sqlite'));
  const connections = [];
  const stores = [];
  const open = (filename) => new Promise((resolve, reject) => {
    const connection = new sqlite3.Database(filename, sqlite3.OPEN_READWRITE, (error) => {
      if (error) return reject(error);
      connections.push(connection);
      resolve(connection);
    });
  });
  let closed;
  const closeAll = () => {
    if (!closed) closed = (async () => {
      const results = await Promise.allSettled([...stores.map(store => store.close()), ...connections.map(close)]);
      const errors = results.filter(result => result.status === 'rejected').map(result => result.reason);
      if (errors.length) throw new AggregateError(errors, 'Database cleanup failed');
    })();
    return closed;
  };
  try {
    for (const key of ['DATA_DIR', 'PUBLIC_DIR', 'UPLOADS_DIR', 'IMG_ROOT_DIR', 'HISTORY_ROOT_DIR', 'ICON_SVG_DIR', 'PRIVATE_UPLOADS_DIR']) {
      await fs.mkdir(resolved[key], { recursive: true, mode: key === 'PRIVATE_UPLOADS_DIR' ? 0o700 : 0o755 });
    }
    const db = await open(resolved.dbPath);
    const logDb = await open(resolved.logDbPath);
    const migrations = path.join(resolved.BACKEND_ROOT, 'src/migrations');
    await checkDatabase(db, migrations, 'main');
    await checkDatabase(logDb, migrations, 'audit');
    for (const connection of [db, logDb]) {
      for (const pragma of ['journal_mode = WAL', 'synchronous = NORMAL', 'foreign_keys = ON', 'busy_timeout = 5000']) {
        await run(connection, `PRAGMA ${pragma}`);
      }
    }
    const addLog = (username, action, details) => {
      const report = (error) => { if (error) logger?.error('audit.failed', { error }); };
      logDb.run('INSERT INTO audit_logs (username, action, details) VALUES (?, ?, ?)',
        [username || 'System', action, details], logger ? logger.bind(report) : report);
    };
    const sql = { main: createSqliteStore(resolved.dbPath), audit: createSqliteStore(resolved.logDbPath) };
    stores.push(sql.main, sql.audit);
    return { ...resolved, db, logDb, sql, addLog, close: closeAll };
  } catch (error) {
    await closeAll();
    throw error;
  }
};
module.exports = { createDatabase, resolvePaths };
