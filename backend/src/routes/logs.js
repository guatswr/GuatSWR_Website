const express = require('express');
const http = require('http');
const https = require('https');
const { URL } = require('url');
const { db, logDb } = require('../models/db');

const router = express.Router();

const UMAMI_BASE_URL = (process.env.UMAMI_BASE_URL || 'http://localhost:3036').replace(/\/+$/, '');
const UMAMI_USERNAME = process.env.UMAMI_USERNAME || '';
const UMAMI_PASSWORD = process.env.UMAMI_PASSWORD || '';
const UMAMI_WEBSITE_ID = process.env.UMAMI_WEBSITE_ID || '';
const UMAMI_CACHE_TTL_MS = Number(process.env.UMAMI_CACHE_TTL_MS || 60 * 1000);
const UMAMI_TIMEOUT_MS = Number(process.env.UMAMI_TIMEOUT_MS || 8000);

const umamiCache = new Map();
const umamiTokenCache = { token: '', exp: 0 };

const parseJwtExp = (token) => {
  if (!token || typeof token !== 'string') return 0;
  const parts = token.split('.');
  if (parts.length < 2) return 0;
  try {
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    const payload = JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
    return payload?.exp ? Number(payload.exp) : 0;
  } catch (e) {
    return 0;
  }
};

const requestJson = (urlStr, { method = 'GET', headers = {}, body, timeout = UMAMI_TIMEOUT_MS } = {}) => new Promise((resolve, reject) => {
  const url = new URL(urlStr);
  const isHttps = url.protocol === 'https:';
  const data = body ? JSON.stringify(body) : null;
  const req = (isHttps ? https : http).request({
    hostname: url.hostname,
    port: url.port || (isHttps ? 443 : 80),
    path: url.pathname + url.search,
    method,
    headers: {
      Accept: 'application/json',
      ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}),
      ...headers
    },
    timeout
  }, (res) => {
    let raw = '';
    res.setEncoding('utf8');
    res.on('data', (chunk) => { raw += chunk; });
    res.on('end', () => {
      const status = res.statusCode || 0;
      if (!raw) return resolve({ status, data: null });
      try {
        const parsed = JSON.parse(raw);
        resolve({ status, data: parsed });
      } catch (e) {
        resolve({ status, data: null });
      }
    });
  });
  req.on('error', reject);
  req.on('timeout', () => {
    req.destroy(new Error('Request timeout'));
  });
  if (data) req.write(data);
  req.end();
});

const getUmamiToken = async () => {
  const now = Date.now();
  if (umamiTokenCache.token && umamiTokenCache.exp * 1000 - now > 60 * 1000) {
    return umamiTokenCache.token;
  }
  const loginPayload = { username: UMAMI_USERNAME, password: UMAMI_PASSWORD };
  const loginPaths = ['/api/auth/login', '/api/login'];
  for (const path of loginPaths) {
    try {
      const { status, data } = await requestJson(`${UMAMI_BASE_URL}${path}`, { method: 'POST', body: loginPayload });
      if (status >= 200 && status < 300 && data?.token) {
        umamiTokenCache.token = data.token;
        umamiTokenCache.exp = parseJwtExp(data.token);
        return data.token;
      }
      if (status !== 404) continue;
    } catch (e) {
      continue;
    }
  }
  throw new Error('UMAMI_LOGIN_FAILED');
};

const umamiGet = async (path, query = {}, retry = true) => {
  const token = await getUmamiToken();
  const url = new URL(`${UMAMI_BASE_URL}${path}`);
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    url.searchParams.set(key, String(value));
  });
  const { status, data } = await requestJson(url.toString(), {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` }
  });
  if (status === 401 && retry) {
    umamiTokenCache.token = '';
    umamiTokenCache.exp = 0;
    return umamiGet(path, query, false);
  }
  if (status >= 200 && status < 300) return data;
  return null;
};

const attachUserMeta = (logs, cb) => {
  const usernames = Array.from(new Set((logs || []).map(l => l.username).filter(Boolean)));
  if (usernames.length === 0) return cb(logs);
  const placeholders = usernames.map(() => '?').join(',');
  db.all(`SELECT id, username, avatar FROM users WHERE username IN (${placeholders})`, usernames, (err, rows) => {
    if (err || !rows) return cb(logs);
    const map = new Map(rows.map(r => [r.username, r]));
    const merged = logs.map(l => ({
      ...l,
      user_id: map.get(l.username)?.id || null,
      user_avatar: map.get(l.username)?.avatar || null
    }));
    cb(merged);
  });
};

router.get('/', (req, res) => {
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
    logDb.all(
      `SELECT id, username, action, details,
        strftime('%Y-%m-%dT%H:%M:%S+08:00', created_at, '+8 hours') as created_at
       ${sqlBase}
       ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset],
      (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      attachUserMeta(rows || [], (merged) => res.json({ total, logs: merged }));
    });
  });
});

router.get('/stats', (req, res) => {
  const limit = parseInt(req.query.limit) || 10;
  const editActions = [
    'CREATE_ACTIVITY', 'UPDATE_ACTIVITY', 'DELETE_ACTIVITY',
    'CREATE_MEMBER', 'UPDATE_MEMBER', 'DELETE_MEMBER',
    'CREATE_HISTORY', 'UPDATE_HISTORY', 'DELETE_HISTORY',
    'UPDATE_CONFIG', 'UPDATE_PROFILE'
  ];
  const placeholders = editActions.map(() => '?').join(',');
  logDb.all(
    `SELECT username, COUNT(*) as count FROM audit_logs WHERE action IN (${placeholders}) GROUP BY username ORDER BY count DESC LIMIT ?`,
    [...editActions, limit],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      const stats = rows || [];
      const usernames = stats.map(s => s.username).filter(Boolean);
      if (usernames.length === 0) return res.json({ stats: [] });
      const namePlaceholders = usernames.map(() => '?').join(',');
      db.all(`SELECT id, username, avatar FROM users WHERE username IN (${namePlaceholders})`, usernames, (err, users) => {
        if (err) return res.json({ stats });
        const map = new Map((users || []).map(u => [u.username, u]));
        const merged = stats.map(s => ({
          username: s.username,
          count: s.count,
          user_id: map.get(s.username)?.id || null,
          user_avatar: map.get(s.username)?.avatar || null
        }));
        res.json({ stats: merged });
      });
    }
  );
});

router.get('/umami', async (req, res) => {
  if (!UMAMI_USERNAME || !UMAMI_PASSWORD || !UMAMI_WEBSITE_ID) {
    return res.status(503).json({ message: 'Umami 未配置' });
  }

  const hasEndAt = Object.prototype.hasOwnProperty.call(req.query, 'endAt');
  const hasStartAt = Object.prototype.hasOwnProperty.call(req.query, 'startAt');
  let endAt = hasEndAt ? Number(req.query.endAt) : Date.now();
  if (!endAt || Number.isNaN(endAt)) endAt = Date.now();
  let startAt = hasStartAt ? Number(req.query.startAt) : (endAt - 7 * 24 * 60 * 60 * 1000);
  if (Number.isNaN(startAt)) startAt = endAt - 7 * 24 * 60 * 60 * 1000;
  const unit = req.query.unit || 'day';
  const limit = Number(req.query.limit) || 10;
  const envTypeRaw = String(req.query.envType || 'browser').toLowerCase();
  const envType = ['browser', 'os', 'device'].includes(envTypeRaw) ? envTypeRaw : 'browser';
  const cacheKey = `${startAt}:${endAt}:${unit}:${limit}`;
  const cacheItem = umamiCache.get(cacheKey);
  if (cacheItem && Date.now() - cacheItem.ts < UMAMI_CACHE_TTL_MS) {
    return res.json(cacheItem.data);
  }

  try {
    if (!startAt || startAt <= 0) {
      const range = await umamiGet(`/api/websites/${UMAMI_WEBSITE_ID}/daterange`);
      if (range?.startDate) startAt = new Date(range.startDate).getTime();
      if (range?.endDate) endAt = new Date(range.endDate).getTime();
    }

    const [stats, pageviews, pages, environments] = await Promise.all([
      umamiGet(`/api/websites/${UMAMI_WEBSITE_ID}/stats`, { startAt, endAt }),
      umamiGet(`/api/websites/${UMAMI_WEBSITE_ID}/pageviews`, { startAt, endAt, unit }),
      umamiGet(`/api/websites/${UMAMI_WEBSITE_ID}/metrics`, { startAt, endAt, type: 'path', limit }),
      umamiGet(`/api/websites/${UMAMI_WEBSITE_ID}/metrics`, { startAt, endAt, type: envType, limit })
    ]);

    const payload = {
      meta: { startAt, endAt, unit, limit, envType },
      summary: stats || {},
      series: {
        pageviews: pageviews?.pageviews || [],
        visitors: pageviews?.sessions || []
      },
      top: {
        pages: pages || [],
        environments: environments || []
      }
    };
    umamiCache.set(cacheKey, { ts: Date.now(), data: payload });
    res.json(payload);
  } catch (e) {
    res.status(502).json({ message: '无法获取统计数据' });
  }
});

module.exports = router;
