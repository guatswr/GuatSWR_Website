module.exports = context => {
  const path = require('node:path');
  const router = require('express').Router();
  const compiled = path.join(context.BACKEND_ROOT, 'dist/src/modules/events');
  const { authenticateToken, optionalAuth, requireAdmin } = context.auth;
  const { createEventContentPersister } = require(path.join(context.BACKEND_ROOT, 'dist/src/utils/eventContentStorage'));
  const { createEventsRepository } = require(path.join(compiled, 'repository'));
  const { createEventsService } = require(path.join(compiled, 'service'));
  const { createEventsController } = require(path.join(compiled, 'controller'));
  const { createSignupRepository } = require(path.join(compiled, 'signup/repository'));
  const { createSignupService } = require(path.join(compiled, 'signup/service'));
  const { createSignupController } = require(path.join(compiled, 'signup/controller'));
  const { createEventStateRepository } = require(path.join(compiled, 'state/repository'));
  const { createEventStateService } = require(path.join(compiled, 'state/service'));
  const { createEventStateController } = require(path.join(compiled, 'state/controller'));
  const { callBotHook } = require('../utils/botHooks');
  const report = error => context.logger.error('http.failed', { error, route: '/api/event' });
  const auditFailure = error => context.logger.error('audit.failed', { error });
  const queued = context.botPlatform ? { enqueue: context.botPlatform.enqueue } : {};
  const events = createEventsController(createEventsService({ repository: createEventsRepository(context.sql.main), publication: context.storage.publication,
    persist: createEventContentPersister({ imageRoot: context.IMG_ROOT_DIR, moveStagedFile: context.storage.moveStagedFile }),
    audit: context.addLog, notify: callBotHook, report: auditFailure, ...queued }), report);
  const signup = createSignupController(createSignupService({ repository: createSignupRepository(context.sql.main), notify: callBotHook, publication: context.storage.publication, ...queued }), report);
  const state = createEventStateController(createEventStateService({ repository: createEventStateRepository(context.sql.main), audit: context.addLog,
    notify: callBotHook, reportAuditFailure: auditFailure, publication: context.storage.publication, ...queued }), report);
  const websiteIdentity = async (req, res, next) => {
    if (!context.botPlatform || req.user || !req.headers['x-bot-owner']) return next();
    try {
      const { createBotIdentityService } = require(path.join(context.BACKEND_ROOT, 'dist/src/integrations/bot/identity'));
      req.botIdentityId = await createBotIdentityService(context.sql.main).websiteIdentity(req.headers['x-bot-owner']);
      next();
    } catch { res.status(400).json({ message: 'Bot 网站身份无效' }); }
  };
  const handle = fn => (req, res, next) => fn(req, res).catch(next);
  router.post('/draft', optionalAuth, context.guestGateway, context.guestProof.check('draft'), handle(events.draft));
  router.put('/:id', optionalAuth, context.guestGateway, context.guestProof.check('save'), handle(events.save));
  router.get('/', optionalAuth, handle(events.list));
  router.get('/:id', optionalAuth, handle(events.detail));
  router.post('/:id/signup', optionalAuth, context.guestGateway, websiteIdentity, handle(signup.signup));
  router.get('/:id/signup', optionalAuth, context.guestGateway, websiteIdentity, handle(signup.find));
  router.delete('/:id/signup', optionalAuth, context.guestGateway, websiteIdentity, handle(signup.remove));
  router.get('/:id/participants/public', optionalAuth, handle(signup.list));
  router.get('/admin/list', authenticateToken, requireAdmin, handle(events.adminList));
  router.post('/admin', authenticateToken, requireAdmin, handle(events.create));
  router.post('/:id/approve', authenticateToken, requireAdmin, handle(state.approve));
  router.post('/:id/reject', authenticateToken, requireAdmin, handle(state.reject));
  router.post('/:id/status', authenticateToken, requireAdmin, handle(state.status));
  router.post('/:id/delete', authenticateToken, requireAdmin, handle(state.remove));
  router.post('/:id/settle', authenticateToken, requireAdmin, handle(state.settle));
  router.post('/:id/set_result', authenticateToken, requireAdmin, handle(state.result));
  router.get('/:id/participants', authenticateToken, requireAdmin, handle(events.participants));
  return router;
};
