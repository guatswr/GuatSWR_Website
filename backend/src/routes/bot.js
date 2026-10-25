module.exports = context => {
  const path = require('node:path');
  const router = require('express').Router();
  router.get('/docs/openapi.yaml', (_req, res, next) => {
    require('node:fs/promises').readFile(path.join(context.BACKEND_ROOT, 'docs/bot-openapi.yaml'), 'utf8')
      .then(document => res.type('text/yaml').send(document)).catch(next);
  });
  const { createBotController } = require(path.join(context.BACKEND_ROOT, 'dist/src/integrations/bot/controller'));
  const controller = createBotController(context.bot);
  for (const name of ['activity', 'history', 'member']) {
    router.post('/notify/' + name, context.auth.authenticateToken, (req, res, next) => controller[name](req, res).catch(next));
  }
  if (context.botPlatform) {
    const { createBotApi } = require(path.join(context.BACKEND_ROOT, 'dist/src/integrations/bot/api'));
    router.use(createBotApi({ platform: context.botPlatform, store: context.sql.main, publication: context.storage.publication,
      ...(context.memberSync ? {memberSync:context.memberSync} : {}),
      images: { assetBaseUrl: () => context.env.BOT_PUBLIC_ASSET_BASE_URL || context.env.SITE_URL || 'https://guatswr.top',
        siteUrl: () => context.env.SITE_URL || 'https://guatswr.top', resolveUploadsPath: context.storage.resolveUploadsPath },
      ...context.auth, guestGateway: context.guestGateway, report: error => context.logger.error('http.failed', { error, route: '/api/bot' }) }));
  } else router.use(['/v1', '/admin', '/link-codes', '/binding'], (_req, res) => res.status(503).json({ message: 'Bot 平台未启用或未完成数据库迁移' }));
  return router;
};
