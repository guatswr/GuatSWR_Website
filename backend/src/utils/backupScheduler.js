module.exports = (context) => {
  const path = require('node:path');
  const compiled = path.join(context.BACKEND_ROOT, 'dist/src/backup');
  const { createBackupRunner, BackupError } = require(path.join(compiled, 'runner'));
  const { createBackupScheduler } = require(path.join(compiled, 'scheduler'));
  const run = createBackupRunner({
    script: context.backup.FULL_BACKUP_SCRIPT,
    env: { ...context.env, DATA_DIR: context.DATA_DIR, PUBLIC_DIR: context.PUBLIC_DIR, BACKUP_ROOT: context.BACKUP_ROOT, DB_PATH: context.dbPath, LOG_DB_PATH: context.logDbPath },
    shutdown: context.shutdownSignal, timeoutMs: context.env.BACKUP_TIMEOUT_MS,
    trackChild: child => context.trackChild(child, { processGroup: true })
  });
  const service = createBackupScheduler({ store: context.sql.main, run, enabled: () => context.externalServices,
    audit: context.addLog, report: error => context.logger.warn('backup.failed', { error }) });
  const owner = context.env.BACKUP_SCHEDULER_OWNER || 'app';
  if (!['app', 'external'].includes(owner)) throw new BackupError('BACKUP_CONFIGURATION');
  let timer;
  return {
    ...service,
    runAutoBackup: trigger => context.track(() => service.runAutoBackup(trigger)),
    startBackupScheduler: () => {
      if (timer || owner === 'external') return;
      timer = context.every(service.checkAndRun, 30000);
      context.track(service.checkAndRun);
    }
  };
};
