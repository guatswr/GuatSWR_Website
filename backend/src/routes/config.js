module.exports = (context) => {
  const path = require('node:path');
  const router = require('express').Router();
  const compiled = path.join(context.BACKEND_ROOT, 'dist/src/modules/config');
  const { createConfigRepository } = require(path.join(compiled, 'repository'));
  const { createConfigService } = require(path.join(compiled, 'service'));
  const { createConfigController } = require(path.join(compiled, 'controller'));
  const service = createConfigService({
    repository: createConfigRepository(context.sql.main), storage: context.storage,
    audit: (username, key) => context.addLog(username, 'UPDATE_CONFIG', `修改配置: ${key}`),
    reportAuditFailure: error => context.logger.error('audit.failed', { error })
  });
  const controller = createConfigController(service, error => context.logger.error('http.failed', { error, route: '/api/config' }));
  const { authenticateToken, requireAdmin, optionalAuth } = context.auth;
  router.get('/', optionalAuth, (req, res, next) => controller.read(req, res).catch(next));
  router.post('/', authenticateToken, requireAdmin, (req, res, next) => controller.write(req, res).catch(next));
  return router;
};
