module.exports = context => {
  const path = require('node:path');
  const router = require('express').Router();
  const { createUploadControllers } = require(path.join(context.BACKEND_ROOT, 'dist/src/storage/upload-controller'));
  const controller = createUploadControllers({ store: context.sql.main, images: context.images, imageRoot: context.IMG_ROOT_DIR,
    iconRoot: context.ICON_SVG_DIR, publicRoot: context.PUBLIC_DIR, moveStagedFile: context.storage.moveStagedFile,
    matches: (req, eid) => context.guestProof.matches(req, eid), audit: context.addLog,
    report: error => context.logger.error('upload.failed', { error }) });
  router.post('/', context.auth.authenticateToken, context.limiter.uploadLimiter, controller.adminParameters, context.upload.upload.single('file'),
    (req, res, next) => context.track(() => controller.admin(req, res)).catch(next));
  return router;
};
