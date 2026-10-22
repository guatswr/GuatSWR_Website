module.exports = (context) => {
  const env = context.env;
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const path = require('path');
const { db, addLog, IMG_ROOT_DIR } = context;
const { validate } = require('../utils');
const { authenticateToken, requireSuperAdmin } = context.auth;
const { loginLimiter } = context.limiter;
const { loginSchema, registerSchema, profileSchema } = require('../controllers/schemas');
const { moveStagedFile } = context.storage;

const router = express.Router();
const SECRET_KEY = env.JWT_SECRET;
if (!SECRET_KEY) {
  throw new Error('JWT_SECRET is required');
}

const TWOFA_SECRET = env.TWOFA_SECRET || SECRET_KEY;
const TWOFA_KEY = crypto.createHash('sha256').update(String(TWOFA_SECRET)).digest();

const encryptTwofa = (text) => {
  if (!text) return null;
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', TWOFA_KEY, iv);
  let encrypted = cipher.update(String(text), 'utf8', 'base64');
  encrypted += cipher.final('base64');
  return `${iv.toString('base64')}:${encrypted}`;
};

const decryptTwofa = (payload) => {
  if (!payload || typeof payload !== 'string') return null;
  const [ivB64, encrypted] = payload.split(':');
  if (!ivB64 || !encrypted) return null;
  const iv = Buffer.from(ivB64, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-cbc', TWOFA_KEY, iv);
  let decrypted = decipher.update(encrypted, 'base64', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
};

// --- 持久化：登录尝试记录 (防爆破) ---
const cleanupLoginAttempts = () => {
  const staleBefore = Date.now() - 24 * 60 * 60 * 1000;
  db.run('DELETE FROM login_attempts WHERE updated_at < ?', [staleBefore], () => {});
};
context.startLoginCleanup = () => context.every(cleanupLoginAttempts, 60 * 60 * 1000);

router.post('/login', loginLimiter, (req, res) => {
  const clientIp = req.ip; 
  const now = Date.now();

  db.get('SELECT count, lock_until FROM login_attempts WHERE ip = ?', [clientIp], (lockErr, lockRow) => {
    if (lockErr) return res.status(503).json({ message: '登录暂时不可用' });
    if (lockRow) {
      if (lockRow.lock_until > now) {
        const waitSeconds = Math.ceil((lockRow.lock_until - now) / 1000);
        return res.status(429).json({ message: `尝试次数过多，请等待 ${waitSeconds} 秒后再试` });
      }
    }

    const validated = validate(loginSchema, req.body);
    if (!validated.ok) return res.status(400).json({ message: validated.error });
    const { username, password, twofa } = validated.data;

    db.get("SELECT * FROM users WHERE username = ?", [username], (err, user) => {
      const loginFailed = (message) => {
        context.security.recordFailure(clientIp, now).then((attempt) => {
          if (attempt.count >= 5) {
            addLog(username || 'Unknown', 'LOGIN_LOCK', `IP ${clientIp} 锁定`);
            return res.status(429).json({ message: '错误次数过多，锁定 1 分钟' });
          }
          res.status(401).json({ message: message || `用户名或密码错误 (剩余 ${5 - attempt.count} 次)` });
        }).catch(() => res.status(503).json({ message: '登录暂时不可用' }));
      };

      if (err) return res.status(503).json({ message: '登录暂时不可用' });
      if (!user) return loginFailed();

      let passwordMatches;
      try { passwordMatches = bcrypt.compareSync(password, user.password); }
      catch { return res.status(503).json({ message: '登录暂时不可用' }); }
      if (passwordMatches) {
        if (user.twofa_enabled) {
          if (!twofa) return res.status(401).json({ message: '需要二步密码' });
          let stored;
          try { stored = decryptTwofa(user.twofa_secret); }
          catch { return res.status(503).json({ message: '登录暂时不可用' }); }
          if (!stored || stored !== String(twofa)) {
            return loginFailed('二步密码错误');
          }
        }
        db.run('DELETE FROM login_attempts WHERE ip = ?', [clientIp], () => {});
        db.get("SELECT value FROM site_config WHERE key = 'token_version'", [], (versionErr, versionRow) => {
          if (versionErr) return res.status(503).json({ message: '登录暂时不可用' });
          let tokenVersion;
          try { tokenVersion = context.security.readVersion(versionRow?.value); }
          catch { return res.status(503).json({ message: '登录暂时不可用' }); }
          const token = jwt.sign({ id: user.id, username: user.username, role: user.role, token_version: tokenVersion }, SECRET_KEY, { expiresIn: '24h' });
          addLog(user.username, 'LOGIN', `登录成功 (IP: ${clientIp})`);
          res.json({ token, username: user.username, role: user.role, avatar: user.avatar, id: user.id });
        });
      } else {
        return loginFailed();
      }
    });
  });
});

router.put('/profile', authenticateToken, (req, res) => {
  const validated = validate(profileSchema, req.body || {});
  if (!validated.ok) return res.status(400).json({ message: validated.error });
  const { password, avatar, twofa_password, twofa_enabled } = validated.data;
  const userId = req.user.id;

  const userDir = path.join(IMG_ROOT_DIR, 'user');
  const getCurrentTwofaEnabled = () => new Promise((resolve, reject) => {
    db.get('SELECT twofa_enabled FROM users WHERE id = ?', [userId], (err, row) => {
      if (err) return reject(err);
      if (!row) return reject(new Error('用户不存在'));
      resolve(!!row.twofa_enabled);
    });
  });

  const updateProfile = async (newAvatar, currentTwofaEnabled) => {
    const sets = [];
    const params = [];

    if (password) {
      const hash = bcrypt.hashSync(password, 10);
      sets.push('password = ?');
      params.push(hash);
    }

    sets.push('avatar = ?');
    params.push(newAvatar || null);

    let twofaLog = '';
    const shouldEnableTwofa = twofa_enabled === true || !!twofa_password;
    if (twofa_enabled === false) {
      sets.push('twofa_enabled = ?');
      params.push(0);
      sets.push('twofa_secret = ?');
      params.push(null);
      twofaLog = '关闭二步密码';
    } else if (shouldEnableTwofa) {
      if (!twofa_password) {
        if (!currentTwofaEnabled) {
          return res.status(400).json({ message: '请填写二步密码' });
        }
      } else {
        sets.push('twofa_enabled = ?');
        params.push(1);
        sets.push('twofa_secret = ?');
        params.push(encryptTwofa(twofa_password));
        twofaLog = currentTwofaEnabled ? '更新二步密码' : '设置二步密码';
      }
    }

    const sql = `UPDATE users SET ${sets.join(', ')} WHERE id = ?`;
    params.push(userId);
    db.run(sql, params, (err) => {
      if (err) return res.status(500).json({ error: err.message });
      const action = twofaLog ? `更新资料/二步密码(${twofaLog})` : '更新个人资料';
      addLog(req.user.username, 'UPDATE_PROFILE', action);
      res.json({ message: "个人资料更新成功" });
    });
  };

  (async () => {
    const currentTwofaEnabled = await getCurrentTwofaEnabled();
    const movedAvatar = await moveStagedFile(avatar, userDir);
    await updateProfile(movedAvatar, currentTwofaEnabled);
  })().catch((moveErr) => res.status(500).json({ error: moveErr.message }));
});

router.get('/me', authenticateToken, (req, res) => {
  db.get("SELECT id, username, role, avatar, twofa_enabled FROM users WHERE id = ?", [req.user.id], (err, row) => {
    if (err || !row) return res.status(404).json({ message: "用户不存在" });
    res.json(row);
  });
});

router.post('/register', authenticateToken, requireSuperAdmin, (req, res) => {
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

return router;

};
