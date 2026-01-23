const { app, PORT } = require('./src/app');

const server = app.listen(PORT, () => {
  console.log(`***后端服务v4.0已启动 (Port ${PORT})***`);
});
server.on('clientError', (err, socket) => { socket.destroy(err); });


/* LEGACY MONOLITH (保留以便回滚)
require('dotenv').config();
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET_KEY = process.env.JWT_SECRET || 'guiair_secret_key_change_me';
const MAX_BODY_SIZE = process.env.MAX_BODY_SIZE || '50mb';
const NODE_ENV = process.env.NODE_ENV || 'development';
const isProd = NODE_ENV === 'production';
const CORS_ORIGINS = (process.env.CORS_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

// --- 安全配置 ---
app.set('trust proxy', true);
app.disable('x-powered-by');

if (isProd && SECRET_KEY === 'guiair_secret_key_change_me') {
  console.warn('[安全警告] 生产环境请设置 JWT_SECRET');
}

// --- 内存存储：登录尝试记录 (防爆破) ---
const loginAttempts = {};
setInterval(() => {
  const now = Date.now();
  for (const ip in loginAttempts) {
    if (loginAttempts[ip].lockUntil < now && loginAttempts[ip].lockUntil !== 0) {
      delete loginAttempts[ip];
    }
  }
}, 600000);

// --- 工具函数 ---
const safeJsonParse = (str) => {
  if (!str) return [];
  try { return JSON.parse(str); } catch (e) { return []; }
};

const normalizeImages = (images) => {
  if (!images) return [];
  if (Array.isArray(images)) return images;
  if (typeof images === 'string') return safeJsonParse(images);
  return [];
};

const validate = (schema, data) => {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    const msg = parsed.error.issues?.[0]?.message || '参数错误';
    return { ok: false, error: msg };
  }
  return { ok: true, data: parsed.data };
};

// --- 中间件 ---
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));
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
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// --- 目录初始化 ---
const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);

// --- 数据库连接 ---
const dbPath = path.join(DATA_DIR, 'guiair.db');
const logDbPath = path.join(DATA_DIR, 'logs.db');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) console.error('业务数据库错误:', err.message);
  else console.log('已连接业务库');
});
const logDb = new sqlite3.Database(logDbPath, (err) => {
  if (err) console.error('日志数据库错误:', err.message);
  else console.log('已连接日志库');
});

// --- 日志记录 ---
const addLog = (username, action, details) => {
  const stmt = logDb.prepare("INSERT INTO audit_logs (username, action, details) VALUES (?, ?, ?)");
  stmt.run(username || 'System', action, details);
  stmt.finalize();
};

// --- 数据库初始化与迁移 ---
db.serialize(() => {
  db.run('PRAGMA journal_mode = WAL');
  db.run('PRAGMA synchronous = NORMAL');
  db.run('PRAGMA foreign_keys = ON');

  // 1. 用户表 (新增 avatar)
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT, 
    username TEXT UNIQUE, 
    password TEXT,
    role TEXT DEFAULT 'admin',
    avatar TEXT
  )`, (err) => {
    if (!err) {
      db.run("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'admin'", () => {});
      // [新增] 尝试添加 avatar 字段
      db.run("ALTER TABLE users ADD COLUMN avatar TEXT", () => {});
    }
  });

  // 2. 活动表 (新增 created_by, updated_by)
  db.run(`CREATE TABLE IF NOT EXISTS activities (
    id INTEGER PRIMARY KEY AUTOINCREMENT, 
    title TEXT, 
    date TEXT, 
    description TEXT, 
    content TEXT, 
    cover_image TEXT, 
    images TEXT, 
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER,
    updated_by INTEGER
  )`, (err) => {
    if (!err) {
      db.run("ALTER TABLE activities ADD COLUMN images TEXT", () => {});
      // [新增] 尝试添加关联字段
      db.run("ALTER TABLE activities ADD COLUMN created_by INTEGER", () => {});
      db.run("ALTER TABLE activities ADD COLUMN updated_by INTEGER", () => {});
    }
  });
  
  db.run(`CREATE TABLE IF NOT EXISTS members (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, role TEXT, bio TEXT, avatar TEXT, school TEXT)`, (err) => {
    if(!err) db.run("ALTER TABLE members ADD COLUMN school TEXT", () => {});
  });
  db.run(`CREATE TABLE IF NOT EXISTS site_config (key TEXT PRIMARY KEY, value TEXT)`);
  db.run(`CREATE TABLE IF NOT EXISTS history (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT, title TEXT, description TEXT, image TEXT, sort_order INTEGER DEFAULT 0)`);

  // 索引优化
  db.run('CREATE INDEX IF NOT EXISTS idx_activities_date ON activities(date)');
  db.run('CREATE INDEX IF NOT EXISTS idx_activities_created_at ON activities(created_at)');
  db.run('CREATE INDEX IF NOT EXISTS idx_history_date ON history(date)');
  db.run('CREATE INDEX IF NOT EXISTS idx_history_sort ON history(sort_order)');
  db.run('CREATE INDEX IF NOT EXISTS idx_members_name ON members(name)');

  // 初始化站长
  const superUser = 'Taropoi';
  db.get("SELECT * FROM users WHERE username = ?", [superUser], (err, row) => {
    if (!row) {
      const hash = bcrypt.hashSync('koishi514', 10);
      db.run("INSERT INTO users (username, password, role) VALUES (?, ?, ?)", [superUser, hash, 'super_admin']);
      console.log(`[Init] 站长账号初始化: ${superUser}`);
    } else if (row.role !== 'super_admin') {
      db.run("UPDATE users SET role = 'super_admin' WHERE username = ?", [superUser]);
    }
  });
});

logDb.serialize(() => {
  logDb.run('PRAGMA journal_mode = WAL');
  logDb.run('PRAGMA synchronous = NORMAL');
  logDb.run('PRAGMA foreign_keys = ON');
  logDb.run(`CREATE TABLE IF NOT EXISTS audit_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT, action TEXT, details TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  logDb.run('CREATE INDEX IF NOT EXISTS idx_logs_created_at ON audit_logs(created_at)');
  logDb.run('CREATE INDEX IF NOT EXISTS idx_logs_username ON audit_logs(username)');
});

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml'
]);
const ALLOWED_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg']);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `img-${Date.now()}-${Math.round(Math.random()*1E9)}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_MIME_TYPES.has(file.mimetype) || !ALLOWED_EXTS.has(ext)) {
      return cb(new Error('不支持的文件类型'));
    }
    cb(null, true);
  }
});

// --- 限流策略 ---
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: '请求过于频繁，请稍后再试' }
});
const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: '登录过于频繁，请稍后再试' }
});
const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: '上传过于频繁，请稍后再试' }
});

// --- 参数校验 ---
const loginSchema = z.object({
  username: z.string().trim().min(1, '用户名不能为空').max(50),
  password: z.string().min(1, '密码不能为空').max(100)
});
const registerSchema = z.object({
  username: z.string().trim().min(1, '用户名不能为空').max(50),
  password: z.string().min(6, '密码至少 6 位').max(100)
});
const profileSchema = z.object({
  password: z.string().min(6, '密码至少 6 位').max(100).optional(),
  avatar: z.string().max(500).optional()
});
const resetPasswordSchema = z.object({
  password: z.string().min(6, '密码至少 6 位').max(100)
});
const activitySchema = z.object({
  title: z.string().trim().min(1, '标题不能为空').max(200),
  date: z.string().trim().min(1, '日期不能为空').max(50),
  description: z.string().max(2000).optional().nullable(),
  content: z.string().optional().nullable(),
  cover_image: z.string().max(500).optional().nullable(),
  images: z.array(z.string().max(500)).optional()
});
const memberSchema = z.object({
  name: z.string().trim().min(1, '姓名不能为空').max(50),
  role: z.string().trim().min(1, '角色不能为空').max(50),
  bio: z.string().max(2000).optional().nullable(),
  avatar: z.string().max(500).optional().nullable(),
  school: z.string().max(50).optional().nullable()
});
const historySchema = z.object({
  date: z.string().trim().min(1, '日期不能为空').max(50),
  title: z.string().trim().min(1, '标题不能为空').max(200),
  description: z.string().max(2000).optional().nullable(),
  image: z.string().max(500).optional().nullable(),
  sort_order: z.coerce.number().int().optional().default(0)
});
const configSchema = z.object({
  key: z.string().trim().min(1, '配置键不能为空').max(100),
  value: z.string().max(5000).optional().default('')
});

const authenticateToken = (req, res, next) => {
  const token = req.headers['authorization'] && req.headers['authorization'].split(' ')[1];
  if (!token) return res.status(401).json({ message: '未登录' });
  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) return res.status(403).json({ message: 'Token 无效' });
    req.user = user; // user: { id, username, role }
    next();
  });
};

const requireSuperAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'super_admin') {
    next();
  } else {
    res.status(403).json({ message: '权限不足' });
  }
};

// ================= API 路由 =================

app.get('/api/version', (req, res) => res.json({ version: '4.0', status: 'online' }));

app.use('/api/auth', authLimiter);

// --- 认证与用户管理 ---
app.post('/api/auth/login', loginLimiter, (req, res) => {
  const clientIp = req.ip; 
  const now = Date.now();

  if (loginAttempts[clientIp]) {
    if (loginAttempts[clientIp].lockUntil > now) {
      const waitSeconds = Math.ceil((loginAttempts[clientIp].lockUntil - now) / 1000);
      return res.status(429).json({ message: `尝试次数过多，请等待 ${waitSeconds} 秒后再试` });
    } else if (loginAttempts[clientIp].lockUntil !== 0 && loginAttempts[clientIp].lockUntil <= now) {
      delete loginAttempts[clientIp];
    }
  }

  const validated = validate(loginSchema, req.body);
  if (!validated.ok) return res.status(400).json({ message: validated.error });
  const { username, password } = validated.data;

  db.get("SELECT * FROM users WHERE username = ?", [username], (err, user) => {
    const loginFailed = () => {
      if (!loginAttempts[clientIp]) loginAttempts[clientIp] = { count: 0, lockUntil: 0 };
      loginAttempts[clientIp].count += 1;
      if (loginAttempts[clientIp].count >= 5) {
        loginAttempts[clientIp].lockUntil = now + 60 * 1000;
        addLog(username || 'Unknown', 'LOGIN_LOCK', `IP ${clientIp} 锁定`);
        return res.status(429).json({ message: "错误次数过多，锁定 1 分钟" });
      }
      res.status(401).json({ message: `用户名或密码错误 (剩余 ${5 - loginAttempts[clientIp].count} 次)` });
    };

    if (err || !user) return loginFailed();

    if (bcrypt.compareSync(password, user.password)) {
      if (loginAttempts[clientIp]) delete loginAttempts[clientIp];
      const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, SECRET_KEY, { expiresIn: '24h' });
      addLog(user.username, 'LOGIN', `登录成功 (IP: ${clientIp})`);
      // 返回更多用户信息
      res.json({ token, username: user.username, role: user.role, avatar: user.avatar, id: user.id });
    } else {
      return loginFailed();
    }
  });
});

// [新增] 更新个人资料 (头像/密码)
app.put('/api/auth/profile', authenticateToken, (req, res) => {
  const validated = validate(profileSchema, req.body || {});
  if (!validated.ok) return res.status(400).json({ message: validated.error });
  const { password, avatar } = validated.data;
  const userId = req.user.id;
  
  if (password) {
    const hash = bcrypt.hashSync(password, 10);
    db.run("UPDATE users SET password = ?, avatar = ? WHERE id = ?", [hash, avatar || null, userId], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      addLog(req.user.username, 'UPDATE_PROFILE', '修改密码/头像');
      res.json({ message: "个人资料更新成功" });
    });
  } else {
    db.run("UPDATE users SET avatar = ? WHERE id = ?", [avatar || null, userId], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      addLog(req.user.username, 'UPDATE_PROFILE', '更新头像');
      res.json({ message: "头像更新成功" });
    });
  }
});

// 获取用户信息 (仅获取自己的)
app.get('/api/auth/me', authenticateToken, (req, res) => {
  db.get("SELECT id, username, role, avatar FROM users WHERE id = ?", [req.user.id], (err, row) => {
    if (err || !row) return res.status(404).json({ message: "用户不存在" });
    res.json(row);
  });
});

// 站长管理接口
app.get('/api/admin/users', authenticateToken, requireSuperAdmin, (req, res) => {
  // 返回头像字段
  db.all("SELECT id, username, role, avatar FROM users ORDER BY id ASC", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/auth/register', authenticateToken, requireSuperAdmin, (req, res) => {
  const validated = validate(registerSchema, req.body);
  if (!validated.ok) return res.status(400).json({ message: validated.error });
  const { username, password } = validated.data;
  const hash = bcrypt.hashSync(password, 10);
  db.run("INSERT INTO users (username, password, role) VALUES (?, ?, ?)", [username, hash, 'admin'], function(err) {
    if (err) return res.status(400).json({ message: "添加失败" });
    addLog(req.user.username, 'CREATE_USER', `创建管理员: ${username}`);
    res.json({ message: "添加成功" });
  });
});

app.delete('/api/admin/users/:id', authenticateToken, requireSuperAdmin, (req, res) => {
  if (parseInt(req.params.id) === req.user.id) return res.status(400).json({ message: "无法删除自己" });
  db.get("SELECT username FROM users WHERE id = ?", [req.params.id], (err, row) => {
    const targetName = row ? row.username : 'Unknown';
    db.run("DELETE FROM users WHERE id = ?", [req.params.id], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      addLog(req.user.username, 'DELETE_USER', `删除管理员: ${targetName}`);
      res.json({ message: "删除成功" });
    });
  });
});

app.put('/api/admin/users/:id/password', authenticateToken, requireSuperAdmin, (req, res) => {
  const validated = validate(resetPasswordSchema, req.body);
  if (!validated.ok) return res.status(400).json({ message: validated.error });
  const { password } = validated.data;
  const hash = bcrypt.hashSync(password, 10);
  db.get("SELECT username FROM users WHERE id = ?", [req.params.id], (err, row) => {
    const targetName = row ? row.username : 'Unknown';
    db.run("UPDATE users SET password = ? WHERE id = ?", [hash, req.params.id], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      addLog(req.user.username, 'RESET_PWD', `重置密码: ${targetName}`);
      res.json({ message: "重置成功" });
    });
  });
});

// --- 日志管理 ---
app.get('/api/admin/logs', authenticateToken, (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const offset = (page - 1) * limit;
  const username = req.query.username || '';
  const action = req.query.action || '';

  let sqlBase = "FROM audit_logs WHERE 1=1";
  const params = [];
  if (username) { sqlBase += " AND username LIKE ?"; params.push(`%${username}%`); }
  if (action) { sqlBase += " AND action LIKE ?"; params.push(`%${action}%`); }

  logDb.get(`SELECT COUNT(*) as count ${sqlBase}`, params, (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    const total = row.count;
    logDb.all(`SELECT * ${sqlBase} ORDER BY created_at DESC LIMIT ? OFFSET ?`, [...params, limit, offset], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ total, logs: rows });
    });
  });
});

app.delete('/api/admin/logs/:id', authenticateToken, requireSuperAdmin, (req, res) => {
  logDb.run("DELETE FROM audit_logs WHERE id = ?", [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: "删除成功" });
  });
});

// --- 业务接口 ---
app.post('/api/upload', authenticateToken, uploadLimiter, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ message: '文件上传失败' });
  addLog(req.user.username, 'UPLOAD', `上传文件: ${req.file.filename}`);
  res.json({ url: `/uploads/${req.file.filename}` });
});

app.get('/api/config', (req, res) => {
  db.all("SELECT * FROM site_config", [], (err, rows) => {
    const config = {};
    if (rows) rows.forEach(r => config[r.key] = r.value);
    res.json(config);
  });
});
app.post('/api/config', authenticateToken, (req, res) => {
  const validated = validate(configSchema, req.body);
  if (!validated.ok) return res.status(400).json({ message: validated.error });
  const { key, value } = validated.data;
  db.run("INSERT OR REPLACE INTO site_config (key, value) VALUES (?, ?)", [key, value], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    addLog(req.user.username, 'UPDATE_CONFIG', `修改配置: ${key}`);
    res.json({ message: "已保存" });
  });
});

// Activities (重点修改：关联用户)
app.get('/api/activities', (req, res) => {
  // 列表页暂不展示作者头像，保持查询轻量
  db.all("SELECT * FROM activities ORDER BY date DESC", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows.map(r => ({ ...r, images: normalizeImages(r.images) })));
  });
});

// [修改] 详情页：关联查询创建者和修改者信息
app.get('/api/activities/:id', (req, res) => {
  const sql = `
    SELECT 
      a.*, 
      u1.username as created_by_name, 
      u1.avatar as created_by_avatar,
      u2.username as updated_by_name, 
      u2.avatar as updated_by_avatar
    FROM activities a
    LEFT JOIN users u1 ON a.created_by = u1.id
    LEFT JOIN users u2 ON a.updated_by = u2.id
    WHERE a.id = ?
  `;
  db.get(sql, [req.params.id], (err, row) => {
    if (!row) return res.status(404).json({ message: "Not Found" });
    row.images = normalizeImages(row.images);
    // 格式化返回字段，兼容旧代码
    row.created_by = row.created_by_name; 
    row.updated_by = row.updated_by_name;
    res.json(row);
  });
});

app.post('/api/activities', authenticateToken, (req, res) => {
  const validated = validate(activitySchema, req.body);
  if (!validated.ok) return res.status(400).json({ message: validated.error });
  const { title, date, description, content, cover_image, images } = validated.data;
  const normalizedImages = normalizeImages(images);
  // 记录 created_by (req.user.id)
  db.run("INSERT INTO activities (title, date, description, content, cover_image, images, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)", 
    [title, date, description, content, cover_image, JSON.stringify(normalizedImages), req.user.id], 
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      addLog(req.user.username, 'CREATE_ACTIVITY', `发布活动: ${title}`);
      res.json({ id: this.lastID, message: "发布成功" });
    });
});

app.put('/api/activities/:id', authenticateToken, (req, res) => {
  const validated = validate(activitySchema, req.body);
  if (!validated.ok) return res.status(400).json({ message: validated.error });
  const { title, date, description, content, cover_image, images } = validated.data;
  const normalizedImages = normalizeImages(images);
  // 记录 updated_by (req.user.id)
  db.run("UPDATE activities SET title=?, date=?, description=?, content=?, cover_image=?, images=?, updated_by=? WHERE id=?", 
    [title, date, description, content, cover_image, JSON.stringify(normalizedImages), req.user.id, req.params.id], 
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      addLog(req.user.username, 'UPDATE_ACTIVITY', `更新活动: ${title}`);
      res.json({ message: "更新成功" });
    });
});

app.delete('/api/activities/:id', authenticateToken, (req, res) => {
  db.get("SELECT title FROM activities WHERE id = ?", [req.params.id], (err, row) => {
    const title = row ? row.title : 'Unknown';
    db.run("DELETE FROM activities WHERE id = ?", [req.params.id], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      addLog(req.user.username, 'DELETE_ACTIVITY', `删除活动: ${title}`);
      res.json({ message: "删除成功" });
    });
  });
});

// Members
app.get('/api/members', (req, res) => {
  db.all("SELECT * FROM members", [], (err, rows) => res.json(rows || []));
});
app.post('/api/members', authenticateToken, (req, res) => {
  const validated = validate(memberSchema, req.body);
  if (!validated.ok) return res.status(400).json({ message: validated.error });
  const { name, role, bio, avatar, school } = validated.data;
  db.run("INSERT INTO members (name, role, bio, avatar, school) VALUES (?, ?, ?, ?, ?)", [name, role, bio, avatar, school || ''], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    addLog(req.user.username, 'CREATE_MEMBER', `添加成员: ${name}`);
    res.json({ id: this.lastID });
  });
});
app.put('/api/members/:id', authenticateToken, (req, res) => {
  const validated = validate(memberSchema, req.body);
  if (!validated.ok) return res.status(400).json({ message: validated.error });
  const { name, role, bio, avatar, school } = validated.data;
  db.run("UPDATE members SET name=?, role=?, bio=?, avatar=?, school=? WHERE id=?", [name, role, bio, avatar, school || '', req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    addLog(req.user.username, 'UPDATE_MEMBER', `更新成员: ${name}`);
    res.json({ message: "成员更新成功" });
  });
});
app.delete('/api/members/:id', authenticateToken, (req, res) => {
  db.get("SELECT name FROM members WHERE id = ?", [req.params.id], (err, row) => {
    const name = row ? row.name : 'Unknown';
    db.run("DELETE FROM members WHERE id = ?", [req.params.id], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      addLog(req.user.username, 'DELETE_MEMBER', `删除成员: ${name}`);
      res.json({ message: "Deleted" });
    });
  });
});

// History
app.get('/api/history', (req, res) => {
  db.all("SELECT * FROM history ORDER BY date ASC, sort_order ASC", [], (err, rows) => res.json(rows || []));
});
app.post('/api/history', authenticateToken, (req, res) => {
  const validated = validate(historySchema, req.body);
  if (!validated.ok) return res.status(400).json({ message: validated.error });
  const { date, title, description, image, sort_order } = validated.data;
  db.run("INSERT INTO history (date, title, description, image, sort_order) VALUES (?, ?, ?, ?, ?)", 
    [date, title, description, image, sort_order || 0], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      addLog(req.user.username, 'CREATE_HISTORY', `添加群史: ${title}`);
      res.json({ id: this.lastID });
    });
});
app.put('/api/history/:id', authenticateToken, (req, res) => {
  const validated = validate(historySchema, req.body);
  if (!validated.ok) return res.status(400).json({ message: validated.error });
  const { date, title, description, image, sort_order } = validated.data;
  db.run("UPDATE history SET date=?, title=?, description=?, image=?, sort_order=? WHERE id=?", 
    [date, title, description, image, sort_order, req.params.id], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      addLog(req.user.username, 'UPDATE_HISTORY', `更新群史: ${title}`);
      res.json({ message: "更新成功" });
    });
});
app.delete('/api/history/:id', authenticateToken, (req, res) => {
  db.get("SELECT title FROM history WHERE id = ?", [req.params.id], (err, row) => {
    const title = row ? row.title : 'Unknown';
    db.run("DELETE FROM history WHERE id = ?", [req.params.id], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      addLog(req.user.username, 'DELETE_HISTORY', `删除群史: ${title}`);
      res.json({ message: "删除成功" });
    });
  });
});

// --- 统一错误与 404 处理 ---
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

const server = app.listen(PORT, () => {
  console.log(`***后端服务v4.0已启动 (Port ${PORT})***`);
});
server.on('clientError', (err, socket) => { socket.destroy(err); });
*/
