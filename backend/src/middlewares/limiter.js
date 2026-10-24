module.exports = context => {
  const path = require('node:path');
  const { createLimiters } = require(path.join(context.BACKEND_ROOT, 'dist/src/security/limiters'));
  return createLimiters({ banMinutes: context.configuration.banMinutes, globalRateLimit: context.configuration.globalRateLimit,
    dispose: callback => context.disposers.push(callback),
    ban: (ip, reason, operator, expires) => context.track(() => context.ban.service.ban(ip, reason, operator, expires)),
    report: error => context.logger.error('http.failed', { error, route: '/rate-limit' }) });
};
