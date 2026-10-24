module.exports = context => {
  const path = require('node:path');
  const { createImageStorage } = require(path.join(context.BACKEND_ROOT, 'dist/src/storage/images'));
  return createImageStorage({ privateDir: context.PRIVATE_UPLOADS_DIR, publicDir: context.PUBLIC_DIR, stagingDir: context.UPLOADS_DIR });
};
