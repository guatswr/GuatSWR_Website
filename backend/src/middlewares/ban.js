module.exports = context => {
  const path = require('node:path');
  const compiled = path.join(context.BACKEND_ROOT, 'dist/src/security');
  const { createBanService } = require(path.join(compiled, 'bans'));
  const { createBanController } = require(path.join(compiled, 'ban-controller'));
  const report = error => context.logger.error('http.failed', { error, route: '/api/admin/bans' });
  const service = createBanService({ store: context.sql.main, ready: context.securityReady, committed: context.flushSecurityAudit, report });
  const controller = createBanController(service, report);
  const finish = (work, callback) => { void context.track(work).then(() => callback?.(), error => { report(error); callback?.(error); }).catch(report); };
  return {
    service, controller,
    banGuard: (req, res, next) => controller.guard(req, res, next).catch(next),
    banIp: (ip, reason = '', operator = 'ATRI', expires = null, callback) => finish(service.ban(ip, reason, operator, expires), callback),
    unbanIp: (ip, operator = 'ATRI', callback) => finish(service.unban(ip, operator), callback),
    cleanupExpired: callback => finish(service.cleanup(), callback)
  };
};
