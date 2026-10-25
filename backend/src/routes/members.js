module.exports = (context) => {
  const path = require('node:path');
  const router = require('express').Router();
  const compiled = path.join(context.BACKEND_ROOT, 'dist/src/modules/members');
  const { createMembersRepository } = require(path.join(compiled, 'repository'));
  const { createMembersService } = require(path.join(compiled, 'service'));
  const { createMembersController } = require(path.join(compiled, 'controller'));
  const service = createMembersService({
    repository: createMembersRepository(context.sql.main,context.mainSchemaVersion>=5), storage: context.storage,
    directory: path.join(context.IMG_ROOT_DIR, 'user'), audit: context.addLog, notify: context.bot.notifyMemberAdded,
    ...(context.botPlatform ? { enqueue: context.botPlatform.enqueue } : {}),
    reportAuditFailure: error => context.logger.error('audit.failed', { error })
  });
  const controller = createMembersController(service, error => context.logger.error('http.failed', { error, route: '/api/members' }));
  const { authenticateToken, optionalAuth, requireSuperAdmin } = context.auth;
  router.get('/revision', async (_req,res,next) => {
    try { res.setHeader('Cache-Control','no-store');res.json({revision:context.mainSchemaVersion>=5 ? (await context.sql.main.get('SELECT revision FROM member_sync_meta WHERE id=1')).revision : 0}); }
    catch(error){next(error);}
  });
  router.get('/stats/schools', (req, res, next) => controller.schools(req, res).catch(next));
  router.get('/', optionalAuth, (req, res, next) => controller.list(req, res).catch(next));
  router.post('/', authenticateToken, (req, res, next) => controller.create(req, res).catch(next));
  router.put('/:id', authenticateToken, (req, res, next) => controller.update(req, res).catch(next));
  router.delete('/:id', authenticateToken, (req, res, next) => controller.remove(req, res).catch(next));
  router.post('/:id/restore', authenticateToken, requireSuperAdmin, (req, res, next) => controller.restore(req, res).catch(next));
  return router;
};
