module.exports = (context) => {
  const env = context.env;
const rateLimit = require('express-rate-limit');
const { banIp } = context.ban;

const createStore = () => {
  const store = new rateLimit.MemoryStore();
  context.disposers.push(() => store.shutdown());
  return store;
};

const DEFAULT_BAN_MINUTES = Number(env.BAN_MINUTES || 5);

const globalLimiter = rateLimit({
  store: createStore(),
  windowMs: 60 * 1000,
  max: Number(env.GLOBAL_RATE_LIMIT || 600),
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path.startsWith('/api/bot'),
  handler: (req, res) => {
    const expiresAt = Date.now() + DEFAULT_BAN_MINUTES * 60 * 1000;
    banIp(req.ip, 'rate-limit', 'ATRI', expiresAt, () => {});
    res.status(429).json({ message: '请求过于频繁，请稍后再试' });
  }
});

const authLimiter = rateLimit({
  store: createStore(),
  windowMs: 15 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: '请求过于频繁，请稍后再试' }
});

const loginLimiter = rateLimit({
  store: createStore(),
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: '登录过于频繁，请稍后再试' }
});

const uploadLimiter = rateLimit({
  store: createStore(),
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: '上传过于频繁，请稍后再试' }
});

return { globalLimiter, authLimiter, loginLimiter, uploadLimiter };

};
