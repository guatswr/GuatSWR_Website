const buildApp = (context) => {
const env = context.env;
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');
const yaml = require('js-yaml');
const swaggerUi = require('swagger-ui-express');

const { PUBLIC_DIR } = context;
const { cleanupStaging } = context.storage;
const { authLimiter, globalLimiter } = context.limiter;
const { banGuard } = context.ban;

const authRoutes = require('./routes/auth')(context);
const adminRoutes = require('./routes/admin')(context);
const activitiesRoutes = require('./routes/activities')(context);
const membersRoutes = require('./routes/members')(context);
const historyRoutes = require('./routes/history')(context);
const configRoutes = require('./routes/config')(context);
const uploadRoutes = require('./routes/upload')(context);
const uploadVisitorRoutes = require('./routes/upload_visitor')(context);
const logsRoutes = require('./routes/logs')(context);
const botRoutes = require('./routes/bot')(context);
// 引入新创建的 event 路由
const eventRoutes = require('./routes/event')(context);

const app = express();

const PORT = env.PORT || 3000;
const NODE_ENV = env.NODE_ENV || 'development';
const isProd = NODE_ENV === 'production';
const MAX_BODY_SIZE = context.configuration.maxBodyBytes;
const CORS_ORIGINS = (env.CORS_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
const SITE_URL = (env.SITE_URL || 'https://guatswr.top').replace(/\/+$/, '');

app.set('trust proxy', require('./config/proxy').createTrustProxy(env.TRUST_PROXY_CIDRS));
app.disable('x-powered-by');
app.use((req, res, next) => context.logger.request(requestId => {
  res.setHeader('X-Request-ID', requestId);
  const started = performance.now();
  let recorded = false;
  const complete = () => {
    if (recorded) return;
    recorded = true;
    const route = typeof req.route?.path === 'string' ? `${req.baseUrl}${req.route.path}` : '/unmatched';
    context.logger.info('http.completed', { method: req.method, route, status: res.writableFinished ? res.statusCode : 499, durationMs: performance.now() - started });
  };
  res.once('finish', context.logger.bind(complete));
  res.once('close', context.logger.bind(complete));
  next();
}));
app.use((req, res, next) => {
  if (context.isClosing()) return res.status(503).json({ message: '服务正在关闭' });
  next();
});
app.use((req, res, next) => {
  res.vary('Authorization');
  if (req.headers.authorization) res.setHeader('Cache-Control', 'private, no-store');
  const send = res.json;
  res.json = (payload) => {
    if (res.statusCode >= 500 && payload && typeof payload.error === 'string') {
      const { error, ...safe } = payload;
      payload = { ...safe, message: typeof safe.message === 'string' ? safe.message : '服务器错误' };
    }
    return send.call(res, payload);
  };
  next();
});

app.use(banGuard);
app.use(globalLimiter);
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (!isProd) return callback(null, true);
    if (CORS_ORIGINS.includes(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));
app.use(express.json({ limit: MAX_BODY_SIZE }));
app.use(express.urlencoded({ extended: true, limit: MAX_BODY_SIZE }));
app.use('/uploads', helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' }, contentSecurityPolicy: false }), (req, res, next) => {
  if (!context.storage.resolveUploadsPath(`/uploads${req.path}`)) return res.status(404).json({ message: 'Not Found' });
  next();
}, express.static(PUBLIC_DIR, { setHeaders(res, filename) {
  if (/\.svg$/i.test(filename)) res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'; style-src 'unsafe-inline'");
} }));

const openapiPath = path.join(context.BACKEND_ROOT, 'docs', 'openapi.yaml');
if (fs.existsSync(openapiPath)) {
  const openapiDoc = yaml.load(fs.readFileSync(openapiPath, 'utf8'));
  app.get('/api/docs/openapi.yaml', (req, res) => {
    res.setHeader('Content-Type', 'text/yaml; charset=utf-8');
    res.send(fs.readFileSync(openapiPath, 'utf8'));
  });
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openapiDoc, { explorer: true }));
}

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

// 定期清理暂存区 (默认保留 48 小时)
const STAGING_TTL_MS = Number(env.STAGING_TTL_MS || 48 * 60 * 60 * 1000);
context.startStagingCleanup = () => context.every(() => cleanupStaging(STAGING_TTL_MS), 60 * 60 * 1000);

app.get('/api/version', (req, res) => res.json({ version: '4.0', status: 'online' }));

const { createSitemapController } = require(path.join(context.BACKEND_ROOT, 'dist/src/modules/sitemap'));
const sitemap = createSitemapController(context.sql.main, () => env.SITE_URL, error => context.logger.error('http.failed', { error, route: '/sitemap.xml' }));
app.get('/sitemap.xml', (req, res, next) => sitemap(req, res).catch(next));

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/activities', activitiesRoutes);
app.use('/api/members', membersRoutes);
app.use('/api/history', historyRoutes);
app.use('/api/config', configRoutes);
app.use('/api/upload/visitor', uploadVisitorRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/logs', logsRoutes);
app.use('/api/bot', botRoutes);
// 注册 /api/event
app.use('/api/event', eventRoutes);

app.use((req, res) => res.status(404).json({ message: 'Not Found' }));
app.use((err, req, res, next) => {
  if (err?.message === 'Not allowed by CORS') {
    return res.status(403).json({ message: '跨域访问被拒绝' });
  }
  if (err?.message === '不支持的文件类型') {
    return res.status(400).json({ message: err.message });
  }
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ message: '文件过大' });
  }
  if (err instanceof require('multer').MulterError) return res.status(400).json({ message: '上传参数无效' });
  context.logger.error('http.failed', { error: err });
  res.status(500).json({ message: '服务器错误' });
});

return { app, PORT };
};

module.exports = { createApplication: require('./lifecycle').createApplication, buildApp };
