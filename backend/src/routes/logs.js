module.exports = (context) => {
  const path = require('node:path');
  const router = require('express').Router();
  const compiled = path.join(context.BACKEND_ROOT, 'dist/src/modules/logs');
  const { createLogsRepository } = require(path.join(compiled, 'repository'));
  const { createLogsService } = require(path.join(compiled, 'service'));
  const { createLogsController } = require(path.join(compiled, 'controller'));
  const { createUmamiClient } = require(path.join(context.BACKEND_ROOT, 'dist/src/integrations/umami/client'));
  const env = context.env;
  const umami = createUmamiClient({
    baseUrl: env.UMAMI_BASE_URL || 'http://localhost:3036', username: env.UMAMI_USERNAME || '', password: env.UMAMI_PASSWORD || '',
    websiteId: env.UMAMI_WEBSITE_ID || '', timeoutMs: env.UMAMI_TIMEOUT_MS, ttlMs: env.UMAMI_CACHE_TTL_MS, shutdown: context.shutdownSignal,
    onUpstreamFailure: status => context.logger.warn('umami.failed', { status, error: Object.assign(new Error('Umami upstream status'), { code: 'UMAMI_UPSTREAM_FAILURE' }) })
  });
  const service = createLogsService(createLogsRepository(context.sql.main, context.sql.audit));
  const controller = createLogsController(service, umami, () => context.externalServices,
    error => context.logger.error('http.failed', { error, route: '/api/logs' }), work => context.track(work));
  router.get('/', (req, res, next) => controller.list(req, res).catch(next));
  router.get('/stats', (req, res, next) => controller.stats(req, res).catch(next));
  router.get('/umami', (req, res, next) => controller.umami(req, res).catch(next));
  return router;
};
