const { createApplication: factory } = require('../../src/app');
async function createApplication(options = {}) {
  if (options.env?.JWT_SECRET?.trim() && options.paths?.data && options.paths?.public && options.paths?.backups) {
    return (await import('./postgres-application.mjs')).createPostgresTestApplication(options);
  }
  return factory(options);
}
module.exports = { createApplication };
