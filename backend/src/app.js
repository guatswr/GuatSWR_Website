require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');

const { initDb, DATA_DIR } = require('./models/db');
const { cleanupStaging } = require('./utils/storage');
const { authLimiter } = require('./middlewares/limiter');

const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const activitiesRoutes = require('./routes/activities');
const membersRoutes = require('./routes/members');
const historyRoutes = require('./routes/history');
const configRoutes = require('./routes/config');
const uploadRoutes = require('./routes/upload');
const logsRoutes = require('./routes/logs');

const app = express();

const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const isProd = NODE_ENV === 'production';
const MAX_BODY_SIZE = process.env.MAX_BODY_SIZE || '50mb';
const CORS_ORIGINS = (process.env.CORS_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.set('trust proxy', true);
app.disable('x-powered-by');

if (!process.env.JWT_SECRET) {
  console.error('[安全错误] 未设置 JWT_SECRET，应用已退出');
  process.exit(1);
}

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
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
app.use('/uploads', express.static(DATA_DIR));

initDb();

// 定期清理暂存区 (默认保留 48 小时)
const STAGING_TTL_MS = Number(process.env.STAGING_TTL_MS || 48 * 60 * 60 * 1000);
setInterval(() => {
  cleanupStaging(STAGING_TTL_MS).catch(() => {});
}, 60 * 60 * 1000);

app.get('/api/version', (req, res) => res.json({ version: '4.0', status: 'online' }));

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/activities', activitiesRoutes);
app.use('/api/members', membersRoutes);
app.use('/api/history', historyRoutes);
app.use('/api/config', configRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/logs', logsRoutes);

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
