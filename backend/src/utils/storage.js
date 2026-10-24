module.exports = context => {
  const path = require('node:path');
  const { createFileStorage } = require(path.join(context.BACKEND_ROOT, 'dist/src/storage/files'));
  return createFileStorage(context);
};
