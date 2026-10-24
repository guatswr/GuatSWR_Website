module.exports = context => {
  const path = require('node:path');
  const { createMultipartParser } = require(path.join(context.BACKEND_ROOT, 'dist/src/storage/multipart'));
  return createMultipartParser(context.PRIVATE_UPLOADS_DIR);
};
