module.exports = context => {
  const path = require('node:path');
  const router = require('express').Router();
  const { createUploadControllers } = require(path.join(context.BACKEND_ROOT, 'dist/src/storage/upload-controller'));
  const controller = createUploadControllers({ store: context.sql.main, images: context.images, imageRoot: context.IMG_ROOT_DIR,
    iconRoot: context.ICON_SVG_DIR, publicRoot: context.PUBLIC_DIR, moveStagedFile: context.storage.moveStagedFile,
    matches: (req, eid) => context.guestProof.matches(req, eid), audit: context.addLog,
    report: error => context.logger.error('upload.failed', { error }) });
  const handle = fn => (req, res, next) => context.track(async () => {
    try { return await fn(req, res); }
    finally { context.upload.upload.complete(req); }
  }).catch(next);
  router.post('/', context.auth.optionalAuth, context.guestGateway, context.guestProof.check('upload'), context.limiter.uploadLimiter, context.upload.upload.single('file'), handle(controller.content));
  router.post('/avatar', context.auth.optionalAuth, context.guestGateway, context.limiter.uploadLimiter, context.upload.upload.single('file'), handle(controller.avatar));
  return router;
};
