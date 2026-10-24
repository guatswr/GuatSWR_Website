module.exports = context => {
  const path = require('node:path');
  const router = require('express').Router();
  const compiled = path.join(context.BACKEND_ROOT, 'dist/src/security');
  const { createAuthService } = require(path.join(compiled, 'auth-service'));
  const { createAuthController } = require(path.join(compiled, 'auth-controller'));
  const report = error => context.logger.error('http.failed', { error, route: '/api/auth' });
  const service = createAuthService({ store: context.sql.main, security: context.security,
    secret: context.env.JWT_SECRET, secondSecret: context.env.TWOFA_SECRET || context.env.JWT_SECRET,
    moveAvatar: value => context.storage.moveStagedFile(value, path.join(context.IMG_ROOT_DIR, 'user')),
    audit: context.addLog, report });
  const controller = createAuthController(service, report);
  context.startLoginCleanup = () => context.every(() => service.cleanup().catch(report), 60 * 60 * 1000);
  const { authenticateToken, requireSuperAdmin } = context.auth;
  router.post('/login', context.limiter.loginLimiter, (req, res, next) => controller.login(req, res).catch(next));
  router.put('/profile', authenticateToken, (req, res, next) => controller.profile(req, res).catch(next));
  router.get('/me', authenticateToken, (req, res, next) => controller.me(req, res).catch(next));
  router.post('/register', authenticateToken, requireSuperAdmin, (req, res, next) => controller.register(req, res).catch(next));
  return router;
};
