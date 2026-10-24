module.exports = context => {
  const path = require('node:path');
  const { createIdentityMiddleware } = require(path.join(context.BACKEND_ROOT, 'dist/src/security/identity'));
  return createIdentityMiddleware(context.sql.main, context.env.JWT_SECRET, context.mainSchemaVersion >= 3);
};
