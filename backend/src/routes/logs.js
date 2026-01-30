const express = require('express');
const { db, logDb } = require('../models/db');

const router = express.Router();

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

module.exports = router;
