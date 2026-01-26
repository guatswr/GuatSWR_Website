const jwt = require('jsonwebtoken');
const { db } = require('../models/db');

const SECRET_KEY = process.env.JWT_SECRET;
if (!SECRET_KEY) {
  throw new Error('JWT_SECRET is required');
}

const getTokenVersion = (cb) => {
  db.get("SELECT value FROM site_config WHERE key = 'token_version'", [], (err, row) => {
    if (err) return cb(0);
    const version = Number(row?.value || 0);
    cb(Number.isNaN(version) ? 0 : version);
  });
};

const authenticateToken = (req, res, next) => {
  const token = req.headers['authorization'] && req.headers['authorization'].split(' ')[1];
  if (!token) return res.status(401).json({ message: '未登录' });
  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) return res.status(403).json({ message: 'Token 无效' });
    getTokenVersion((currentVersion) => {
      const tokenVersion = Number(user?.token_version || 0);
      if (Number.isNaN(tokenVersion) || tokenVersion !== currentVersion) {
        return res.status(401).json({ message: '会话已失效，请重新登录' });
      }
      req.user = user;
      next();
    });
  });
};

const optionalAuth = (req, res, next) => {
  const token = req.headers['authorization'] && req.headers['authorization'].split(' ')[1];
  if (!token) return next();
  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) return next();
    getTokenVersion((currentVersion) => {
      const tokenVersion = Number(user?.token_version || 0);
      if (!Number.isNaN(tokenVersion) && tokenVersion === currentVersion) {
        req.user = user;
      }
      next();
    });
  });
};

const requireSuperAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'super_admin') {
    next();
  } else {
    res.status(403).json({ message: '权限不足' });
  }
};

const requireAdmin = (req, res, next) => {
  if (req.user && (req.user.role === 'super_admin' || req.user.role === 'admin')) {
    next();
  } else {
    res.status(403).json({ message: '权限不足' });
  }
};

module.exports = { authenticateToken, requireSuperAdmin, requireAdmin, optionalAuth };
