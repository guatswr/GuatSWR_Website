module.exports = (context) => {
  const { createHash, timingSafeEqual } = require('node:crypto');
  const net = require('node:net');
  const configured = String(context.env.BFF_BRIDGE_SECRET || '');
  const key = Buffer.from(configured);
  const expected = createHash('sha256').update(key).digest();
  return (req, res, next) => {
    res.setHeader('Cache-Control', 'private, no-store');
    if (req.user && ['admin','super_admin'].includes(req.user.role)) return next();
    if (key.length < 32 || key.length > 256) return res.status(503).json({ message: '访客入口暂时不可用' });
    const supplied = req.headers['x-bff-bridge'];
    if (typeof supplied !== 'string' || supplied.length > 1024 || !timingSafeEqual(expected, createHash('sha256').update(supplied).digest())) {
      return res.status(403).json({ message: '请通过站点访客入口操作' });
    }
    const trust = req.app.get('trust proxy fn');
    if (!trust?.(req.socket.remoteAddress, 0)) return res.status(503).json({ message: '访客代理配置暂不可用' });
    const ip = req.headers['x-forwarded-for'];
    if (typeof ip !== 'string' || ip.length > 128 || !net.isIP(ip)) return res.status(400).json({ message: '访客地址无效' });
    next();
  };
};
