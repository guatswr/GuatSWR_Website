const express = require('express');
const path = require('path');
const fs = require('fs');
const net = require('net');
const bcrypt = require('bcryptjs');
const { db, logDb, addLog, IMG_ROOT_DIR } = require('../models/db');
const { authenticateToken, requireSuperAdmin } = require('../middlewares/auth');
const { validate, normalizeImages } = require('../utils');
const { deleteByUrl, deletePathSafe } = require('../utils/storage');
const { listBackups, resolveBackupPath, ensureBackupDirs } = require('../utils/backup');
const { runAutoBackup } = require('../utils/backupScheduler');
const { resetPasswordSchema } = require('../controllers/schemas');
const { banIp, unbanIp, cleanupExpired } = require('../middlewares/ban');

const router = express.Router();

router.get('/users', authenticateToken, requireSuperAdmin, (req, res) => {
  db.all("SELECT id, username, role, avatar, twofa_enabled FROM users ORDER BY id ASC", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

router.delete('/users/:id', authenticateToken, requireSuperAdmin, (req, res) => {
  if (parseInt(req.params.id) === req.user.id) return res.status(400).json({ message: "无法删除自己" });
  db.get("SELECT username FROM users WHERE id = ?", [req.params.id], (err, row) => {
    const targetName = row ? row.username : 'Unknown';
    db.run("DELETE FROM users WHERE id = ?", [req.params.id], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      addLog(req.user.username, 'DELETE_USER', `删除管理员: ${targetName}`);
      res.json({ message: "删除成功", target: targetName });
    });
  });
});

router.put('/users/:id/password', authenticateToken, requireSuperAdmin, (req, res) => {
  const validated = validate(resetPasswordSchema, req.body);
  if (!validated.ok) return res.status(400).json({ message: validated.error });
  const { password } = validated.data;
  const hash = bcrypt.hashSync(password, 10);
  db.get("SELECT username FROM users WHERE id = ?", [req.params.id], (err, row) => {
    const targetName = row ? row.username : 'Unknown';
    db.run("UPDATE users SET password = ? WHERE id = ?", [hash, req.params.id], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      addLog(req.user.username, 'RESET_PWD', `重置密码: ${targetName}`);
      res.json({ message: "重置成功" });
    });
  });
});

router.put('/users/:id/twofa/reset', authenticateToken, requireSuperAdmin, (req, res) => {
  db.get("SELECT username FROM users WHERE id = ?", [req.params.id], (err, row) => {
    const targetName = row ? row.username : 'Unknown';
    db.run("UPDATE users SET twofa_enabled = 0, twofa_secret = NULL WHERE id = ?", [req.params.id], function(updateErr) {
      if (updateErr) return res.status(500).json({ error: updateErr.message });
      addLog(req.user.username, 'RESET_2FA', `重置二步密码: ${targetName}`);
      res.json({ message: "二步密码已重置" });
    });
  });
});

router.post('/token-version/refresh', authenticateToken, requireSuperAdmin, (req, res) => {
  db.get("SELECT value FROM site_config WHERE key = 'token_version'", [], (err, row) => {
    const current = Number(row?.value || 0);
    const next = Number.isNaN(current) ? 1 : current + 1;
    db.run("INSERT OR REPLACE INTO site_config (key, value) VALUES ('token_version', ?)", [String(next)], (updateErr) => {
      if (updateErr) return res.status(500).json({ error: updateErr.message });
      addLog(req.user.username, 'REFRESH_TOKEN_VERSION', `强制刷新登录: version=${next}`);
      res.json({ message: '已强制刷新登录状态', version: next });
    });
  });
});

router.get('/logs', authenticateToken, (req, res) => {
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
    logDb.all(`SELECT * ${sqlBase} ORDER BY created_at DESC LIMIT ? OFFSET ?`, [...params, limit, offset], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ total, logs: rows });
    });
  });
});

router.delete('/logs/:id', authenticateToken, requireSuperAdmin, (req, res) => {
  logDb.run("DELETE FROM audit_logs WHERE id = ?", [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    addLog(req.user.username, 'DELETE_LOG', `删除日志: ${req.params.id}`);
    res.json({ message: "删除成功" });
  });
});

router.post('/recycle-bin/purge', authenticateToken, requireSuperAdmin, (req, res) => {
  const result = { activities: 0, members: 0, history: 0 };

  const dbAll = (sql, params = []) => new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || [])));
  });
  const dbRun = (sql, params = []) => new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) return reject(err);
      resolve(this);
    });
  });

  const collectUploadsFromText = (text) => {
    if (!text || typeof text !== 'string') return [];
    return text.match(/\/uploads\/[\w\-./]+/g) || [];
  };

  (async () => {
    const deletedActivities = await dbAll("SELECT id, cover_image, images, content FROM activities WHERE deleted_at IS NOT NULL");
    for (const act of deletedActivities) {
      await deleteByUrl(act.cover_image);
      const imgs = normalizeImages(act.images);
      for (const img of imgs) await deleteByUrl(img);
      const contentUrls = collectUploadsFromText(act.content);
      for (const url of contentUrls) await deleteByUrl(url);
      const activityDir = path.join(IMG_ROOT_DIR, 'activity', String(act.id));
      await deletePathSafe(activityDir);
    }

    const deletedMembers = await dbAll("SELECT id, avatar FROM members WHERE deleted_at IS NOT NULL");
    for (const mem of deletedMembers) {
      await deleteByUrl(mem.avatar);
    }

    const deletedHistory = await dbAll("SELECT id, image FROM history WHERE deleted_at IS NOT NULL");
    for (const hist of deletedHistory) {
      await deleteByUrl(hist.image);
    }

    const actRes = await dbRun("DELETE FROM activities WHERE deleted_at IS NOT NULL");
    const memRes = await dbRun("DELETE FROM members WHERE deleted_at IS NOT NULL");
    const histRes = await dbRun("DELETE FROM history WHERE deleted_at IS NOT NULL");

    result.activities = actRes.changes || 0;
    result.members = memRes.changes || 0;
    result.history = histRes.changes || 0;

    addLog(req.user.username, 'PURGE_RECYCLE_BIN', `清空回收站并清理图片: activities=${result.activities}, members=${result.members}, history=${result.history}`);
    res.json({ message: '已清空回收站', result });
  })().catch((err) => res.status(500).json({ error: err.message }));
});

router.get('/bans', authenticateToken, requireSuperAdmin, (req, res) => {
  cleanupExpired(() => {
    db.all('SELECT * FROM banned_ips ORDER BY created_at DESC', [], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ bans: rows || [] });
    });
  });
});

router.post('/bans', authenticateToken, requireSuperAdmin, (req, res) => {
  const ip = String(req.body?.ip || '').trim();
  const reason = String(req.body?.reason || '').trim();
  const minutes = Number(req.body?.minutes || 0);
  if (!net.isIP(ip)) return res.status(400).json({ message: 'IP 格式不正确' });
  const expiresAt = minutes > 0 ? Date.now() + minutes * 60 * 1000 : null;
  banIp(ip, reason, req.user.username, expiresAt, (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: '已封禁', ip });
  });
});

router.delete('/bans/:ip', authenticateToken, requireSuperAdmin, (req, res) => {
  const ip = String(req.params.ip || '').trim();
  if (!net.isIP(ip)) return res.status(400).json({ message: 'IP 格式不正确' });
  unbanIp(ip, req.user.username, (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: '已解封', ip });
  });
});

router.get('/backups/settings', authenticateToken, requireSuperAdmin, (req, res) => {
  db.all("SELECT key, value FROM site_config WHERE key IN ('backup_enabled','backup_time','backup_last_run','backup_last_error')", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const map = {};
    (rows || []).forEach((r) => { map[r.key] = r.value; });
    res.json({
      enabled: String(map.backup_enabled || '0') === '1',
      time: map.backup_time || '02:30',
      lastRun: map.backup_last_run || '',
      lastError: map.backup_last_error || ''
    });
  });
});

router.post('/backups/settings', authenticateToken, requireSuperAdmin, (req, res) => {
  const enabled = !!req.body?.enabled;
  const time = String(req.body?.time || '').trim();
  if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    return res.status(400).json({ message: '时间格式需为 HH:mm' });
  }
  const finalTime = time || '02:30';
  db.serialize(() => {
    db.run("INSERT OR REPLACE INTO site_config (key, value) VALUES ('backup_enabled', ?)", [enabled ? '1' : '0']);
    db.run("INSERT OR REPLACE INTO site_config (key, value) VALUES ('backup_time', ?)", [finalTime], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      addLog(req.user.username, 'UPDATE_BACKUP_SETTINGS', `自动备份: ${enabled ? '开启' : '关闭'} ${finalTime}`);
      res.json({ message: '已保存', enabled, time: finalTime });
    });
  });
});

router.get('/backups', authenticateToken, requireSuperAdmin, (req, res) => {
  try {
    ensureBackupDirs();
    const dbList = listBackups('db');
    const uploadsList = listBackups('uploads');
    res.json({ db: dbList, uploads: uploadsList });
  } catch (err) {
    res.status(500).json({ message: '加载备份列表失败', error: err.message });
  }
});

router.get('/backups/download', authenticateToken, requireSuperAdmin, (req, res) => {
  const { type, file } = req.query || {};
  const resolved = resolveBackupPath(type, file);
  if (!resolved) return res.status(404).json({ message: '备份文件不存在' });
  addLog(req.user.username, 'DOWNLOAD_BACKUP', `下载备份: ${resolved.type}/${resolved.fileName}`);
  res.download(resolved.filePath, resolved.fileName);
});

router.delete('/backups', authenticateToken, requireSuperAdmin, (req, res) => {
  const { type, file } = req.query || {};
  const resolved = resolveBackupPath(type, file);
  if (!resolved) return res.status(404).json({ message: '备份文件不存在' });
  fs.unlink(resolved.filePath, (err) => {
    if (err) return res.status(500).json({ error: err.message });
    addLog(req.user.username, 'DELETE_BACKUP', `删除备份: ${resolved.type}/${resolved.fileName}`);
    res.json({ message: '已删除' });
  });
});

router.post('/backups/run', authenticateToken, requireSuperAdmin, (req, res) => {
  runAutoBackup('manual')
    .then(() => res.json({ message: '备份完成' }))
    .catch((err) => res.status(500).json({ message: '备份失败', error: err.message }));
});

module.exports = router;
