const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const PUBLIC_DIR = path.join(DATA_DIR, 'public');
const UPLOADS_DIR = path.join(PUBLIC_DIR, 'upload');
const IMG_ROOT_DIR = path.join(PUBLIC_DIR, 'img');
const HISTORY_ROOT_DIR = path.join(IMG_ROOT_DIR, 'History');
const ICON_SVG_DIR = path.join(PUBLIC_DIR, 'icon_svg');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
if (!fs.existsSync(IMG_ROOT_DIR)) fs.mkdirSync(IMG_ROOT_DIR, { recursive: true });
if (!fs.existsSync(HISTORY_ROOT_DIR)) fs.mkdirSync(HISTORY_ROOT_DIR, { recursive: true });
if (!fs.existsSync(ICON_SVG_DIR)) fs.mkdirSync(ICON_SVG_DIR, { recursive: true });

const legacyDbPath = path.join(DATA_DIR, 'guiair.db');
const legacyLogDbPath = path.join(DATA_DIR, 'logs.db');
const resolveDbPath = (envValue, fallbackFile) => {
  if (!envValue) return path.join(DATA_DIR, fallbackFile);
  return path.isAbsolute(envValue) ? envValue : path.join(DATA_DIR, envValue);
};
const dbPath = resolveDbPath(process.env.DB_PATH, 'guatswr_web_main.db');
const logDbPath = resolveDbPath(process.env.LOG_DB_PATH, 'guatswr_web_logs.db');

const migrateDbFile = (fromPath, toPath) => {
  if (fs.existsSync(toPath)) return;
  if (!fs.existsSync(fromPath)) return;
  fs.copyFileSync(fromPath, toPath);
  console.log(`[DB] 已迁移数据库文件: ${path.basename(fromPath)} -> ${path.basename(toPath)}`);
};

migrateDbFile(legacyDbPath, dbPath);
migrateDbFile(legacyLogDbPath, logDbPath);

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) console.error('业务数据库错误:', err.message);
  else console.log('已连接业务库');
});
const logDb = new sqlite3.Database(logDbPath, (err) => {
  if (err) console.error('日志数据库错误:', err.message);
  else console.log('已连接日志库');
});

const applyPragmas = (database) => {
  database.serialize(() => {
    database.run('PRAGMA journal_mode = WAL');
    database.run('PRAGMA synchronous = NORMAL');
    database.run('PRAGMA foreign_keys = ON');
    database.run('PRAGMA busy_timeout = 5000');
  });
};

applyPragmas(db);
applyPragmas(logDb);

// --- 日志记录 ---
const addLog = (username, action, details) => {
  const stmt = logDb.prepare("INSERT INTO audit_logs (username, action, details) VALUES (?, ?, ?)");
  stmt.run(username || 'System', action, details);
  stmt.finalize();
};

// --- 数据库初始化与迁移 ---
const initDb = () => {
  db.serialize(() => {
    const addColumnSafe = (table, columnDef) => {
      db.run(`ALTER TABLE ${table} ADD COLUMN ${columnDef}`, (err) => {
        if (!err) return;
        if (/duplicate column name/i.test(err.message)) return;
        console.warn(`[DB] 添加列失败: ${table}.${columnDef} -> ${err.message}`);
      });
    };

    const createIndexSafe = (sql) => {
      db.run(sql, (err) => {
        if (!err) return;
        if (/no such column/i.test(err.message)) return;
        console.warn(`[DB] 创建索引失败: ${sql} -> ${err.message}`);
      });
    };
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT, 
      username TEXT UNIQUE, 
      password TEXT,
      role TEXT DEFAULT 'admin',
      avatar TEXT,
      twofa_secret TEXT,
      twofa_enabled INTEGER DEFAULT 0
    )`, (err) => {
      if (!err) {
        addColumnSafe('users', "role TEXT DEFAULT 'admin'");
        addColumnSafe('users', 'avatar TEXT');
        addColumnSafe('users', 'twofa_secret TEXT');
        addColumnSafe('users', 'twofa_enabled INTEGER DEFAULT 0');
      }
    });

    db.run(`CREATE TABLE IF NOT EXISTS activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT, 
      title TEXT, 
      tag TEXT,
      date TEXT, 
      description TEXT, 
      content TEXT, 
      cover_image TEXT, 
      images TEXT, 
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_by INTEGER,
      updated_by INTEGER,
      status TEXT DEFAULT 'published',
      deleted_at DATETIME,
      deleted_by INTEGER
    )`, (err) => {
      if (!err) {
        addColumnSafe('activities', 'tag TEXT');
        addColumnSafe('activities', 'images TEXT');
        addColumnSafe('activities', 'created_by INTEGER');
        addColumnSafe('activities', 'updated_by INTEGER');
        addColumnSafe('activities', "status TEXT DEFAULT 'published'");
        addColumnSafe('activities', 'deleted_at DATETIME');
        addColumnSafe('activities', 'deleted_by INTEGER');
      }
    });
    
    db.run(`CREATE TABLE IF NOT EXISTS members (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, role TEXT, bio TEXT, avatar TEXT, school TEXT, sort_order INTEGER DEFAULT 0, deleted_at DATETIME, deleted_by INTEGER)`, (err) => {
      if(!err) {
        addColumnSafe('members', 'school TEXT');
        addColumnSafe('members', 'sort_order INTEGER DEFAULT 0');
        addColumnSafe('members', 'deleted_at DATETIME');
        addColumnSafe('members', 'deleted_by INTEGER');
      }
    });
    db.run(`CREATE TABLE IF NOT EXISTS site_config (key TEXT PRIMARY KEY, value TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS history (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT, title TEXT, description TEXT, image TEXT, sort_order INTEGER DEFAULT 0, deleted_at DATETIME, deleted_by INTEGER)`, (err) => {
      if (!err) {
        addColumnSafe('history', 'deleted_at DATETIME');
        addColumnSafe('history', 'deleted_by INTEGER');
      }
    });

    db.run(`CREATE TABLE IF NOT EXISTS login_attempts (
      ip TEXT PRIMARY KEY,
      count INTEGER NOT NULL DEFAULT 0,
      lock_until INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0
    )`);

    // 索引优化
    db.run('CREATE INDEX IF NOT EXISTS idx_activities_date ON activities(date)');
    db.run('CREATE INDEX IF NOT EXISTS idx_activities_created_at ON activities(created_at)');
    createIndexSafe('CREATE INDEX IF NOT EXISTS idx_activities_deleted_at ON activities(deleted_at)');
    db.run('CREATE INDEX IF NOT EXISTS idx_history_date ON history(date)');
    db.run('CREATE INDEX IF NOT EXISTS idx_history_sort ON history(sort_order)');
    createIndexSafe('CREATE INDEX IF NOT EXISTS idx_history_deleted_at ON history(deleted_at)');
    db.run('CREATE INDEX IF NOT EXISTS idx_members_name ON members(name)');
    createIndexSafe('CREATE INDEX IF NOT EXISTS idx_members_deleted_at ON members(deleted_at)');

    // 初始化站长 (从环境变量读取)
    const superUser = process.env.SUPER_ADMIN_USERNAME;
    const superPass = process.env.SUPER_ADMIN_PASSWORD;
    if (!superUser || !superPass) {
      console.warn('[Init] 未设置 SUPER_ADMIN_USERNAME / SUPER_ADMIN_PASSWORD，跳过站长初始化');
    } else {
      db.get("SELECT * FROM users WHERE username = ?", [superUser], (err, row) => {
        if (!row) {
          const hash = bcrypt.hashSync(superPass, 10);
          db.run("INSERT INTO users (username, password, role) VALUES (?, ?, ?)", [superUser, hash, 'super_admin']);
          console.log(`[Init] 站长账号初始化: ${superUser}`);
        } else if (row.role !== 'super_admin') {
          db.run("UPDATE users SET role = 'super_admin' WHERE username = ?", [superUser]);
        }
      });
    }
  });

  logDb.serialize(() => {
    logDb.run(`CREATE TABLE IF NOT EXISTS audit_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT, action TEXT, details TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    logDb.run('CREATE INDEX IF NOT EXISTS idx_logs_created_at ON audit_logs(created_at)');
    logDb.run('CREATE INDEX IF NOT EXISTS idx_logs_username ON audit_logs(username)');
  });
};

module.exports = { db, logDb, addLog, initDb, DATA_DIR, PUBLIC_DIR, UPLOADS_DIR, IMG_ROOT_DIR, HISTORY_ROOT_DIR, ICON_SVG_DIR };
