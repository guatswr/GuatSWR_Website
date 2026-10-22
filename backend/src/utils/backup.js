module.exports = (context) => {
const path = require('path');
const fs = require('fs');

const findProjectRoot = () => {
  let dir = __dirname;
  const maxDepth = 6;
  for (let i = 0; i < maxDepth; i += 1) {
    const scriptsDir = path.join(dir, 'scripts');
    const dbScript = path.join(scriptsDir, 'db_backup.sh');
    const uploadsScript = path.join(scriptsDir, 'uploads_backup.sh');
    const fullScript = path.join(scriptsDir, 'backup_all.sh');
    if (fs.existsSync(dbScript) && fs.existsSync(uploadsScript) && fs.existsSync(fullScript)) return dir;
    dir = path.dirname(dir);
  }
  const cwdScripts = path.join(process.cwd(), 'scripts');
  if (
    fs.existsSync(path.join(cwdScripts, 'db_backup.sh'))
    && fs.existsSync(path.join(cwdScripts, 'uploads_backup.sh'))
    && fs.existsSync(path.join(cwdScripts, 'backup_all.sh'))
  ) {
    return process.cwd();
  }
  return path.resolve(__dirname, '..', '..');
};

const ROOT_DIR = findProjectRoot();
const BACKUP_ROOT = context.BACKUP_ROOT;
const DB_BACKUP_DIR = path.join(BACKUP_ROOT, 'db');
const UPLOADS_BACKUP_DIR = path.join(BACKUP_ROOT, 'uploads');
const FULL_BACKUP_DIR = path.join(BACKUP_ROOT, 'full');
const DB_BACKUP_SCRIPT = path.join(ROOT_DIR, 'scripts', 'db_backup.sh');
const UPLOADS_BACKUP_SCRIPT = path.join(ROOT_DIR, 'scripts', 'uploads_backup.sh');
const FULL_BACKUP_SCRIPT = path.join(ROOT_DIR, 'scripts', 'backup_all.sh');

const ensureBackupDirs = () => {
  [BACKUP_ROOT, DB_BACKUP_DIR, UPLOADS_BACKUP_DIR, FULL_BACKUP_DIR].forEach((dir) => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  });
};

const normalizeType = (type) => {
  const safeType = String(type || '').trim();
  if (!safeType) return 'full';
  if (safeType === 'uploads') return 'uploads';
  if (safeType === 'full' || safeType === 'all') return 'full';
  return 'db';
};

const getBackupDir = (type) => {
  const targetType = normalizeType(type);
  if (targetType === 'uploads') return UPLOADS_BACKUP_DIR;
  if (targetType === 'full') return FULL_BACKUP_DIR;
  return DB_BACKUP_DIR;
};

const listBackups = (type) => {
  ensureBackupDirs();
  const targetType = normalizeType(type);
  const dir = getBackupDir(targetType);
  if (!fs.existsSync(dir)) return [];
  const items = fs.readdirSync(dir)
    .map((name) => {
      const filePath = path.join(dir, name);
      const stat = fs.statSync(filePath);
      if (!stat.isFile()) return null;
      return {
        name,
        type: targetType,
        size: stat.size,
        mtime: stat.mtimeMs
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.mtime - a.mtime);
  return items;
};

const resolveBackupPath = (type, filename) => {
  const targetType = normalizeType(type);
  const safeName = path.basename(filename || '');
  if (!safeName || safeName !== filename) return null;
  const dir = getBackupDir(targetType);
  const filePath = path.join(dir, safeName);
  if (!fs.existsSync(filePath)) return null;
  return { filePath, fileName: safeName, type: targetType };
};

return {
  ROOT_DIR,
  BACKUP_ROOT,
  DB_BACKUP_DIR,
  UPLOADS_BACKUP_DIR,
  FULL_BACKUP_DIR,
  DB_BACKUP_SCRIPT,
  UPLOADS_BACKUP_SCRIPT,
  FULL_BACKUP_SCRIPT,
  ensureBackupDirs,
  listBackups,
  resolveBackupPath
};

};
