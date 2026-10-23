module.exports = (context) => {
  const path = require('node:path');
  const { createWebhookTransport } = require(path.join(context.BACKEND_ROOT, 'dist/src/integrations/bot/transport'));
  const { createBotNotifier } = require(path.join(context.BACKEND_ROOT, 'dist/src/integrations/bot/notifier'));
  return createBotNotifier(payload => context.track(() => createWebhookTransport({
    url: context.env.ASTRBOT_WEBHOOK_URL || '', token: context.env.ASTRBOT_TOKEN || '',
    timeoutMs: context.env.ASTRBOT_TIMEOUT_MS, enabled: context.externalServices, shutdown: context.shutdownSignal
  })(payload)));
};
