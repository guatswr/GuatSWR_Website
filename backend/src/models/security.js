module.exports = context => {
  const path = require('node:path');
  const root = context.BACKEND_ROOT || require('./db').resolvePaths({}).BACKEND_ROOT;
  const { createSecurityService } = require(path.join(root, 'dist/src/security/service'));
  const store = context.sql.main;
  return createSecurityService(store);
};
