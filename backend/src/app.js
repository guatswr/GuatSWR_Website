require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');
const yaml = require('js-yaml');
const swaggerUi = require('swagger-ui-express');

const { initDb, PUBLIC_DIR, db } = require('./models/db');
const { cleanupStaging } = require('./utils/storage');
const { startBackupScheduler } = require('./utils/backupScheduler');
const { authLimiter, globalLimiter } = require('./middlewares/limiter');
const { banGuard } = require('./middlewares/ban');

const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const activitiesRoutes = require('./routes/activities');
const membersRoutes = require('./routes/members');
const historyRoutes = require('./routes/history');
const configRoutes = require('./routes/config');
const uploadRoutes = require('./routes/upload');
const logsRoutes = require('./routes/logs');
const botRoutes = require('./routes/bot');

const app = express();

const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const isProd = NODE_ENV === 'production';
const MAX_BODY_SIZE = process.env.MAX_BODY_SIZE || '50mb';
const CORS_ORIGINS = (process.env.CORS_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
const SITE_URL = (process.env.SITE_URL || 'https://guatswr.top').replace(/\/+$/, '');

app.set('trust proxy', true);
app.disable('x-powered-by');

if (!process.env.JWT_SECRET) {
  console.error('[安全错误] 未设置 JWT_SECRET，应用已退出');
  process.exit(1);
}

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
app.use('/uploads', express.static(PUBLIC_DIR));

const openapiPath = path.join(__dirname, '..', 'docs', 'openapi.yaml');
if (fs.existsSync(openapiPath)) {
  const openapiDoc = yaml.load(fs.readFileSync(openapiPath, 'utf8'));
  app.get('/api/docs/openapi.yaml', (req, res) => {
    res.setHeader('Content-Type', 'text/yaml; charset=utf-8');
    res.send(fs.readFileSync(openapiPath, 'utf8'));
  });
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openapiDoc, { explorer: true }));
}

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

initDb();
startBackupScheduler();

// 定期清理暂存区 (默认保留 48 小时)
const STAGING_TTL_MS = Number(process.env.STAGING_TTL_MS || 48 * 60 * 60 * 1000);
setInterval(() => {
  cleanupStaging(STAGING_TTL_MS).catch(() => {});
}, 60 * 60 * 1000);

app.get('/api/version', (req, res) => res.json({ version: '4.0', status: 'online' }));

app.get('/sitemap.xml', (req, res) => {
  const resolvedSiteUrl = (process.env.SITE_URL || `${req.protocol}://${req.get('host')}`)
    .replace(/\/+$/, '');
  const staticUrls = [
    { loc: '/', changefreq: 'daily', priority: 1.0 },
    { loc: '/activities', changefreq: 'daily', priority: 0.8 },
    { loc: '/members', changefreq: 'weekly', priority: 0.6 },
    { loc: '/history', changefreq: 'weekly', priority: 0.6 },
    { loc: '/social', changefreq: 'monthly', priority: 0.4 },
    { loc: '/join', changefreq: 'monthly', priority: 0.5 },
    { loc: '/logs', changefreq: 'weekly', priority: 0.4 }
  ];

  const escapeXml = (value) => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

  const toLastmod = (value) => {
    if (!value) return null;
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString().slice(0, 10);
  };

  const buildUrlItem = (item) => {
    const loc = `${resolvedSiteUrl}${item.loc}`;
    const lastmod = toLastmod(item.lastmod);
    return [
      '  <url>',
      `    <loc>${escapeXml(loc)}</loc>`,
      lastmod ? `    <lastmod>${lastmod}</lastmod>` : null,
      item.changefreq ? `    <changefreq>${item.changefreq}</changefreq>` : null,
      item.priority !== undefined ? `    <priority>${item.priority}</priority>` : null,
      '  </url>'
    ].filter(Boolean).join('\n');
  };

  const sql = `
    SELECT id, date, created_at
    FROM activities
    WHERE (status = 'published' OR status IS NULL) AND deleted_at IS NULL
    ORDER BY date DESC
  `;

  db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).send('Server Error');

    const activityUrls = rows.map((row) => ({
      loc: `/activity/${row.id}`,
      lastmod: row.date || row.created_at,
      changefreq: 'weekly',
      priority: 0.7
    }));

    const allUrls = [...staticUrls, ...activityUrls];
    const body = allUrls.map(buildUrlItem).join('\n');
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.send(xml);
  });
});

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/activities', activitiesRoutes);
app.use('/api/members', membersRoutes);
app.use('/api/history', historyRoutes);
app.use('/api/config', configRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/logs', logsRoutes);
app.use('/api/bot', botRoutes);

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
  console.error(err);
  res.status(500).json({ message: '服务器错误' });
});

module.exports = { app, PORT };
