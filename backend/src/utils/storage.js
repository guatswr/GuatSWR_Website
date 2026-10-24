module.exports = context => {
  const path = require('node:path');
  const { createFileStorage } = require(path.join(context.BACKEND_ROOT, 'dist/src/storage/files'));
  const { createAssetPublication } = require(path.join(context.BACKEND_ROOT, 'dist/src/storage/publication'));
  const { createAssetRetention } = require(path.join(context.BACKEND_ROOT, 'dist/src/storage/retention'));
  const publication = context.sql?.main ? createAssetPublication({ store: context.sql.main, filename: context.dbPath,
    publicRoot: context.PUBLIC_DIR, journalRoot: path.join(context.DATA_DIR, 'asset-publications'), quarantine: path.join(context.DATA_DIR, 'asset-quarantine'),
    signal: context.shutdownSignal, track: context.track, ready: context.mainSchemaVersion >= 2,
    report: error => context.logger.error('storage.failed', { error }) }) : undefined;
  const retention = context.sql?.main ? createAssetRetention({ store: context.sql.main, publicRoot: context.PUBLIC_DIR, staging: context.UPLOADS_DIR,
    privateRoot: context.PRIVATE_UPLOADS_DIR, quarantine: path.join(context.DATA_DIR, 'asset-quarantine'), ready: context.mainSchemaVersion >= 2, signal: context.shutdownSignal }) : undefined;
  return { ...createFileStorage({ ...context, publication, retention }), publication };
};
