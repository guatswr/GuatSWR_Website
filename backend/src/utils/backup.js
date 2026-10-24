module.exports = (context) => {
  const path = require('node:path');
  const { createBackupFiles } = require(path.join(context.BACKEND_ROOT, 'dist/src/backup/files'));
  return {
    ROOT_DIR: context.BACKEND_ROOT,
    BACKUP_ROOT: context.BACKUP_ROOT,
    DB_BACKUP_DIR: path.join(context.BACKUP_ROOT, 'db'),
    UPLOADS_BACKUP_DIR: path.join(context.BACKUP_ROOT, 'uploads'),
    FULL_BACKUP_DIR: path.join(context.BACKUP_ROOT, 'full'),
    DB_BACKUP_SCRIPT: path.join(context.BACKEND_ROOT, 'scripts', 'db_backup.sh'),
    UPLOADS_BACKUP_SCRIPT: path.join(context.BACKEND_ROOT, 'scripts', 'uploads_backup.sh'),
    FULL_BACKUP_SCRIPT: path.join(context.BACKEND_ROOT, 'scripts', 'backup_all.sh'),
    ...createBackupFiles(context.BACKUP_ROOT, context.PUBLIC_DIR, error => context.logger.warn('backup.failed', { error }))
  };
};
