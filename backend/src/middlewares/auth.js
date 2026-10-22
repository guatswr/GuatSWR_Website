module.exports = (context) => {
  const env = context.env;
const jwt = require('jsonwebtoken');
const { db } = context;

const SECRET_KEY = env.JWT_SECRET;
if (!SECRET_KEY) {
  throw new Error('JWT_SECRET is required');
}

const verifyIdentity = (req, res, next, claims) => {
  if (!Number.isSafeInteger(claims?.id) || claims.id <= 0) return res.status(401).json({ message: '会话已失效，请重新登录' });
  db.get(`SELECT id, username, role,
    (SELECT value FROM site_config WHERE key='token_version') AS current_token_version
    FROM users WHERE id=?`, [claims.id], (error, user) => {
    if (error) return res.status(503).json({ message: '认证暂时不可用' });
    if (!user) return res.status(401).json({ message: '会话已失效，请重新登录' });
    let currentVersion;
    let tokenVersion;
    try {
      currentVersion = context.security.readVersion(user.current_token_version);
      tokenVersion = context.security.readVersion(claims.token_version);
    } catch { return res.status(503).json({ message: '认证暂时不可用' }); }
    if (currentVersion !== tokenVersion) return res.status(401).json({ message: '会话已失效，请重新登录' });
    req.user = { ...claims, id: user.id, username: user.username, role: user.role };
    next();
  });
};
const authenticateToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: '未登录' });
  jwt.verify(token, SECRET_KEY, (error, claims) => {
    if (error) return res.status(403).json({ message: 'Token 无效' });
    verifyIdentity(req, res, next, claims);
  });
};
const optionalAuth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return next();
  jwt.verify(token, SECRET_KEY, (error, claims) => {
    if (error) return next();
    verifyIdentity(req, res, next, claims);
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

return { authenticateToken, requireSuperAdmin, requireAdmin, optionalAuth };

};
