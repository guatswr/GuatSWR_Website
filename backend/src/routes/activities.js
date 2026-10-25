module.exports = (context) => {
  const path = require('node:path');
  const router = require('express').Router();
  const compiled = path.join(context.BACKEND_ROOT, 'dist/src/modules/activities');
  const { createActivitiesRepository } = require(path.join(compiled, 'repository'));
  const { createActivitiesService } = require(path.join(compiled, 'service'));
  const { createActivitiesController } = require(path.join(compiled, 'controller'));
  const { createActivityRevisions } = require(path.join(compiled, 'revisions'));
  const revisions = createActivityRevisions({store:context.sql.main,ready:context.mainSchemaVersion>=7,publication:context.storage.publication,committed:context.flushSecurityAudit});
  const service = createActivitiesService({
    repository: createActivitiesRepository(context.sql.main), storage: context.storage,
    directory: path.join(context.IMG_ROOT_DIR, 'activity'), audit: context.addLog, notify: context.bot.notifyActivityPublished,
    ...(context.botPlatform ? { enqueue: context.botPlatform.enqueue } : {}),
    ...(revisions.ready ? { revisions } : {}),
    reportAuditFailure: error => context.logger.error('audit.failed', { error })
  });
  const controller = createActivitiesController(service, error => context.logger.error('http.failed', { error, route: '/api/activities' }));
  const { authenticateToken, optionalAuth, requireSuperAdmin } = context.auth;
  router.use(require(path.join(compiled,'revision-api')).createActivityRevisionApi(revisions,authenticateToken,error=>context.logger.error('http.failed',{error})));
  router.get('/', optionalAuth, (req, res, next) => controller.list(req, res).catch(next));
  router.get('/:id', optionalAuth, (req, res, next) => controller.detail(req, res).catch(next));
  router.post('/draft', authenticateToken, (req, res, next) => controller.draft(req, res).catch(next));
  router.post('/', authenticateToken, (req, res, next) => controller.create(req, res).catch(next));
  router.put('/:id', authenticateToken, (req, res, next) => controller.update(req, res).catch(next));
  router.delete('/:id', authenticateToken, (req, res, next) => controller.remove(req, res).catch(next));
  router.post('/:id/restore', authenticateToken, requireSuperAdmin, (req, res, next) => controller.restore(req, res).catch(next));
  return router;
};
