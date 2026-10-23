require('dotenv').config();
const { createApplication } = require('./src/app');

const start = async () => {
  const instance = await createApplication();
  try {
    const server = await instance.listen();
    instance.context.logger.info('application.ready', { port: server.address().port });
    const shutdown = () => instance.close().catch((error) => {
      instance.context.logger.error('application.failed', { error });
      process.exit(1);
    });
    process.once('SIGTERM', shutdown);
    process.once('SIGINT', shutdown);
    instance.context.disposers.push(() => {
      process.removeListener('SIGTERM', shutdown);
      process.removeListener('SIGINT', shutdown);
    });
    return instance;
  } catch (error) {
    await instance.close();
    throw error;
  }
};
if (require.main === module) start().catch((error) => {
  const path = require('node:path');
  const root = require('./src/models/db').resolvePaths({}).BACKEND_ROOT;
  const { createDiagnosticLogger } = require(path.join(root, 'dist/src/diagnostics.js'));
  createDiagnosticLogger().error('application.failed', { error });
  process.exitCode = 1;
});
module.exports = { start };
