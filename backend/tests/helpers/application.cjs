const { createApplication: factory } = require('../../src/app');
const { initializeDatabases } = require('../../scripts/initialize-databases.cjs');
async function createApplication(options = {}) {
  if (options.env?.JWT_SECRET?.trim() && options.paths?.data && options.paths?.public && options.paths?.backups) {
    await initializeDatabases(options.env, options.paths);
  }
  return factory(options);
}
module.exports = { createApplication };
