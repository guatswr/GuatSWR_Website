module.exports = (context) => {
const { db, addLog } = context;

const cleanupExpired = (cb) => {
  const now = Date.now();
  db.run('DELETE FROM banned_ips WHERE expires_at IS NOT NULL AND expires_at <= ?', [now], cb);
};

const banGuard = (req, res, next) => {
  if (req.path.startsWith('/api/bot')) return next();
  const ip = req.ip;
  db.get('SELECT ip, reason, expires_at FROM banned_ips WHERE ip = ?', [ip], (err, row) => {
    if (err || !row) return next();
    if (row.expires_at && Number(row.expires_at) <= Date.now()) {
      return db.run('DELETE FROM banned_ips WHERE ip = ?', [ip], () => next());
    }
    return res.status(403).json({ message: 'IP 已被封禁', reason: row.reason || '' });
  });
};

const banIp = (ip, reason = '', createdBy = 'ATRI', expiresAt = null, cb) => {
  const createdAt = Date.now();
  db.run(
    'INSERT OR REPLACE INTO banned_ips (ip, reason, created_at, expires_at, created_by) VALUES (?, ?, ?, ?, ?)',
    [ip, reason, createdAt, expiresAt, createdBy],
    (err) => {
      if (!err) {
        const until = expiresAt ? ` until ${new Date(expiresAt).toISOString()}` : '';
        addLog(createdBy, 'BAN_IP', `封禁IP ${ip}${reason ? ` (${reason})` : ''}${until}`);
      }
      if (cb) cb(err);
    }
  );
};

const unbanIp = (ip, operator = 'ATRI', cb) => {
  db.run('DELETE FROM banned_ips WHERE ip = ?', [ip], (err) => {
    if (!err) addLog(operator, 'UNBAN_IP', `解封IP ${ip}`);
    if (cb) cb(err);
  });
};

return { banGuard, banIp, unbanIp, cleanupExpired };

};
