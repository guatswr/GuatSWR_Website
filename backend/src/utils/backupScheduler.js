module.exports = (context, dependencies = {}) => {
  const path = require('node:path');
  const compiled = path.join(context.BACKEND_ROOT, 'dist/src/backup');
  const { BackupError } = require(path.join(compiled, 'runner'));
  const { createBackupScheduler } = require(path.join(compiled, 'scheduler'));
  const service = createBackupScheduler({
    store: context.sql.main,
    run: async () => {
      const createPostgresBackup = dependencies.createBackup || (await import(path.join(context.BACKEND_ROOT, 'scripts/postgres/backup.mjs'))).createPostgresBackup;
      const outputDir = path.join(context.BACKUP_ROOT, 'postgres');
      await createPostgresBackup({
        databaseUrl: context.env.POSTGRES_BACKUP_URL || context.env.POSTGRES_URL,
        uploadsDir: context.PUBLIC_DIR,
        dataDir: context.DATA_DIR,
        quarantineDir: path.join(context.DATA_DIR, 'asset-quarantine'),
        journalDir: path.join(context.DATA_DIR, 'asset-publications'),
        outputDir,
        sourceRevision: context.env.SOURCE_REVISION
      });
    },
    enabled: () => context.externalServices,
    audit: context.addLog,
    report: error => context.logger.warn('backup.failed', { error })
  });
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
