const jwt = require('jsonwebtoken');

const SECRET_KEY = process.env.JWT_SECRET;
if (!SECRET_KEY) {
  throw new Error('JWT_SECRET is required');
}

const authenticateToken = (req, res, next) => {
  const token = req.headers['authorization'] && req.headers['authorization'].split(' ')[1];
  if (!token) return res.status(401).json({ message: '未登录' });
  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) return res.status(403).json({ message: 'Token 无效' });
    req.user = user;
    next();
  });
};

const optionalAuth = (req, res, next) => {
  const token = req.headers['authorization'] && req.headers['authorization'].split(' ')[1];
  if (!token) return next();
  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (!err) req.user = user;
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

module.exports = { authenticateToken, requireSuperAdmin, optionalAuth };
