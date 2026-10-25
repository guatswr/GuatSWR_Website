module.exports = (context) => {
  const path = require('node:path');
  const router = require('express').Router();
  const compiled = path.join(context.BACKEND_ROOT, 'dist/src/modules/history');
  const { createHistoryRepository } = require(path.join(compiled, 'repository'));
  const { createHistoryService } = require(path.join(compiled, 'service'));
  const { createHistoryController } = require(path.join(compiled, 'controller'));
  const service = createHistoryService({
    repository: createHistoryRepository(context.sql.main), storage: context.storage,
    audit: context.addLog, notify: context.bot.notifyHistoryUpdated,
    ...(context.botPlatform ? { enqueue: context.botPlatform.enqueue } : {}),
    reportAuditFailure: error => context.logger.error('audit.failed', { error })
  });
  const controller = createHistoryController(service, error => context.logger.error('http.failed', { error, route: '/api/history' }));
  const { authenticateToken, optionalAuth, requireSuperAdmin } = context.auth;
  router.get('/', optionalAuth, (req, res, next) => controller.list(req, res).catch(next));
  router.post('/', authenticateToken, (req, res, next) => controller.create(req, res).catch(next));
  router.put('/:id', authenticateToken, (req, res, next) => controller.update(req, res).catch(next));
  router.delete('/:id', authenticateToken, (req, res, next) => controller.remove(req, res).catch(next));
  router.post('/:id/restore', authenticateToken, requireSuperAdmin, (req, res, next) => controller.restore(req, res).catch(next));
  return router;
};
