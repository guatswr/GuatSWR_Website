module.exports = context => {
  const path = require('node:path');
  const router = require('express').Router();
  const { createBotController } = require(path.join(context.BACKEND_ROOT, 'dist/src/integrations/bot/controller'));
  const controller = createBotController(context.bot);
  for (const name of ['activity', 'history', 'member']) {
    router.post('/notify/' + name, context.auth.authenticateToken, (req, res, next) => controller[name](req, res).catch(next));
  }
  return router;
};
