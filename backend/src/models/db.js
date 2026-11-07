const path = require('node:path');
const syncFs = require('node:fs');

// Runtime paths are anchored to package metadata in source and dist.
const findBackendRoot = (start) => {
  let current = path.resolve(start);
  for (let depth = 0; depth < 16; depth += 1) {
    try {
      const metadata = JSON.parse(syncFs.readFileSync(path.join(current, 'package.json'), 'utf8'));
      if (metadata.name === 'guiair-backend') return current;
    } catch (error) {
      if (!['ENOENT', 'ENOTDIR'].includes(error.code)) throw error;
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
  return {
    BACKEND_ROOT,
    DATA_DIR,
    PUBLIC_DIR,
    BACKUP_ROOT: path.resolve(paths.backups || env.BACKUP_ROOT || path.join(BACKEND_ROOT, 'backups')),
    UPLOADS_DIR: path.join(PUBLIC_DIR, 'upload'),
    PRIVATE_UPLOADS_DIR: path.join(DATA_DIR, 'private-upload'),
    IMG_ROOT_DIR: path.join(PUBLIC_DIR, 'img'),
    HISTORY_ROOT_DIR: path.join(PUBLIC_DIR, 'img', 'History'),
    ICON_SVG_DIR: path.join(PUBLIC_DIR, 'icon_svg')
  };
};

const createDatabase = async ({ env, paths, logger }) => {
  const resolved = resolvePaths(env, paths);
  const { parseDatabaseConfiguration } = require(path.join(resolved.BACKEND_ROOT, 'dist/src/database/config'));
  const configuration = parseDatabaseConfiguration(env);
  const { createPostgresDatabase } = require(path.join(resolved.BACKEND_ROOT, 'dist/src/database/application'));
  return createPostgresDatabase(configuration.connectionString, resolved, logger);
};

module.exports = { createDatabase, resolvePaths };
