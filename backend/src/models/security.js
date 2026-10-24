module.exports = context => {
  const path = require('node:path');
  const root = context.BACKEND_ROOT || require('./db').resolvePaths({}).BACKEND_ROOT;
  const { createSecurityService } = require(path.join(root, 'dist/src/security/service'));
  const store = context.sql?.main || { get: (sql, params = []) => new Promise((resolve, reject) => context.db.get(sql, params, (error, row) => error ? reject(error) : resolve(row))) };
  return createSecurityService(store);
};
