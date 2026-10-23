module.exports = (context) => {
const express = require('express');
const path = require('path');
const fs = require('fs');
const net = require('net');
const bcrypt = require('bcryptjs');
const { db, logDb, addLog, IMG_ROOT_DIR } = context;
const { authenticateToken, requireSuperAdmin } = context.auth;
const { validate } = require('../utils');

const { listBackups, resolveBackupPath, ensureBackupDirs } = context.backup;
const { runAutoBackup } = context.scheduler;
const { resetPasswordSchema } = context.schemas;
const { banIp, unbanIp, cleanupExpired } = context.ban;

const stateModule = path.join(context.BACKEND_ROOT, 'dist/src/modules/events/state');
const { createEventStateRepository } = require(path.join(stateModule, 'repository'));
const { createEventStateService } = require(path.join(stateModule, 'service'));
const { createEventStateController } = require(path.join(stateModule, 'controller'));
const stateController = createEventStateController(createEventStateService({
  repository: createEventStateRepository(context.sql.main), audit: addLog,
  notify: require('../utils/botHooks').callBotHook,
  reportAuditFailure: error => context.logger.error('audit.failed', { error })
}), error => context.logger.error('http.failed', { error, route: '/api/event/state' }));
const { createRecycleService, RecycleError } = require(path.join(context.BACKEND_ROOT, 'dist/src/modules/recycle/service'));
const recycle = createRecycleService(context.sql.main, context.PUBLIC_DIR, path.join(context.DATA_DIR, 'asset-quarantine'));
const requireCleanupSchema = (req, res, next) => context.mainSchemaVersion >= 2 ? next() : res.status(503).json({ message: '请先升级数据库' });
const { createBackupSettingsController } = require(path.join(context.BACKEND_ROOT, 'dist/src/backup/controller'));
const backupSettings = createBackupSettingsController(context.scheduler, addLog, error => context.logger.error('backup.failed', { error }));
const router = express.Router();

// ==============================================================================
// 1. 用户管理模块 (User Management)
// ==============================================================================

/**
 * 获取所有管理员列表
 */
router.get('/users', authenticateToken, requireSuperAdmin, (req, res) => {
  db.all("SELECT id, username, role, avatar, twofa_enabled FROM users ORDER BY id ASC", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

/**
 * 删除管理员
 */
router.delete('/users/:id', authenticateToken, requireSuperAdmin, (req, res) => {
  if (parseInt(req.params.id) === req.user.id) return res.status(400).json({ message: "无法删除自己" });
  context.security.deleteAdmin(req.params.id, req.user.id).then(async (deleted) => {
    if (!deleted) {
      const target = await new Promise((resolve, reject) => db.get('SELECT role FROM users WHERE id=?', [req.params.id], (error, row) => error ? reject(error) : resolve(row)));
      return res.status(target ? 409 : 404).json({ message: target ? '不能删除最后一个超级管理员或使用已失效权限' : '用户不存在' });
    }
    addLog(req.user.username, 'DELETE_USER', `删除管理员: ${deleted.username}`);
    res.json({ message: '删除成功', target: deleted.username });
  }).catch(() => res.status(503).json({ message: '管理员删除暂时不可用' }));
});

/**
 * 强制重置管理员密码
 */
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

/**
 * 重置用户的二步验证 (2FA)
 */
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

// ==============================================================================
// 2. 系统安全模块 (System Security)
// ==============================================================================

/**
 * 强制刷新 Token 版本
 */
router.post('/token-version/refresh', authenticateToken, requireSuperAdmin, (req, res) => {
  context.security.incrementVersion().then((version) => {
    addLog(req.user.username, 'REFRESH_TOKEN_VERSION', `强制刷新登录: version=${version}`);
    res.json({ message: '已强制刷新登录状态', version });
  }).catch(() => res.status(503).json({ message: '登录状态刷新暂时不可用' }));
});

// ==============================================================================
// 3. 审计日志模块 (Audit Logs)
// ==============================================================================

/**
 * 获取审计日志
 */
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
    logDb.all(
      `SELECT id, username, action, details,
        strftime('%Y-%m-%dT%H:%M:%S+08:00', created_at, '+8 hours') as created_at
       ${sqlBase}
       ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset],
      (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ total, logs: rows });
    });
  });
});

/**
 * 删除单条日志记录
 */
router.delete('/logs/:id', authenticateToken, requireSuperAdmin, (req, res) => {
  logDb.run("DELETE FROM audit_logs WHERE id = ?", [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    addLog(req.user.username, 'DELETE_LOG', `删除日志: ${req.params.id}`);
    res.json({ message: "删除成功" });
  });
});

// ==============================================================================
// 4. 数据清理模块 (Data Maintenance)
// ==============================================================================

/**
 * 清空回收站
 */
router.post('/recycle-bin/purge', authenticateToken, requireSuperAdmin, requireCleanupSchema, async (req, res) => {
  try {
    const result = await recycle.purge();
    addLog(req.user.username, 'PURGE_RECYCLE_BIN', `清空回收站并清理图片: activities=${result.activities}, members=${result.members}, history=${result.history}`);
    res.json({ message: '已清空回收站', result });
  } catch (error) {
    context.logger.error('storage.failed', { error });
    res.status(500).json({ message: '服务器错误' });
  }
});
// ==============================================================================
// 5. 封禁管理模块 (IP Ban Management)
// ==============================================================================

/**
 * 获取被封禁的 IP 列表
 */
router.get('/bans', authenticateToken, requireSuperAdmin, (req, res) => {
  cleanupExpired(() => {
    db.all('SELECT * FROM banned_ips ORDER BY created_at DESC', [], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ bans: rows || [] });
    });
  });
});

/**
 * 手动添加 IP 封禁
 */
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

/**
 * 解除 IP 封禁
 */
router.delete('/bans/:ip', authenticateToken, requireSuperAdmin, (req, res) => {
  const ip = String(req.params.ip || '').trim();
  if (!net.isIP(ip)) return res.status(400).json({ message: 'IP 格式不正确' });
  unbanIp(ip, req.user.username, (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: '已解封', ip });
  });
});

// ==============================================================================
// 6. 系统备份模块 (Backup Management)
// ==============================================================================

/**
 * 获取备份设置
 */
router.get('/backups/settings', authenticateToken, requireSuperAdmin, (req, res, next) => backupSettings.read(req, res).catch(next));
router.post('/backups/settings', authenticateToken, requireSuperAdmin, (req, res, next) => backupSettings.update(req, res).catch(next));
/**
 * 获取备份文件列表
 */
router.get('/backups', authenticateToken, requireSuperAdmin, (req, res) => {
  try {
    ensureBackupDirs();
    const fullList = listBackups('full');
    res.json({ full: fullList });
  } catch (err) {
    res.status(500).json({ message: '加载备份列表失败', error: err.message });
  }
});

/**
 * 下载备份文件
 */
router.get('/backups/download', authenticateToken, requireSuperAdmin, (req, res) => {
  const { type, file } = req.query || {};
  if (type && type !== 'full') return res.status(400).json({ message: '仅支持完整备份下载' });
  const resolved = resolveBackupPath(type, file);
  if (!resolved) return res.status(404).json({ message: '备份文件不存在' });
  addLog(req.user.username, 'DOWNLOAD_BACKUP', `下载备份: ${resolved.type}/${resolved.fileName}`);
  res.download(resolved.filePath, resolved.fileName);
});

/**
 * 删除备份文件
 */
router.delete('/backups', authenticateToken, requireSuperAdmin, (req, res) => {
  const { type, file } = req.query || {};
  if (type && type !== 'full') return res.status(400).json({ message: '仅支持完整备份删除' });
  const resolved = resolveBackupPath(type, file);
  if (!resolved) return res.status(404).json({ message: '备份文件不存在' });
  fs.unlink(resolved.filePath, (err) => {
    if (err) return res.status(500).json({ error: err.message });
    addLog(req.user.username, 'DELETE_BACKUP', `删除备份: ${resolved.type}/${resolved.fileName}`);
    res.json({ message: '已删除' });
  });
});

/**
 * 手动触发备份
 */
router.post('/backups/run', authenticateToken, requireSuperAdmin, (req, res) => {
  runAutoBackup('manual')
    .then(() => res.json({ message: '备份完成' }))
    .catch((err) => res.status(500).json({ message: '备份失败', error: err.message }));
});

// ==============================================================================
// 7. 事件审核与管理模块 (Event Management)
// ==============================================================================

/**
 * 获取待审核的事件列表
 */
router.get('/events/pending', authenticateToken, (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = 20;
  const offset = (page - 1) * limit;

  db.get(`SELECT COUNT(*) as count FROM events WHERE status = 'pending'`, [], (err, countRow) => {
    if (err) return res.status(500).json({ error: err.message });
    
    const sql = `SELECT * FROM events WHERE status = 'pending' ORDER BY created_at ASC LIMIT ? OFFSET ?`;
    db.all(sql, [limit, offset], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      const items = rows.map(row => {
        try { row.content = JSON.parse(row.content); } catch (e) { row.content = {}; }
        return row;
      });
      res.json({ total: countRow.count, items });
    });
  });
});

/**
 * 审核事件 (通过/驳回)
 */
router.post('/events/:id/review', authenticateToken, (req, res, next) => stateController.review(req, res).catch(next));

/**
 * 物理删除事件 (含关联文件)
 * 警告: 此操作不可恢复，会同时删除数据库记录和存储的图片文件夹
 */
router.delete('/events/:id', authenticateToken, requireSuperAdmin, requireCleanupSchema, async (req, res) => {
  try {
    const { incomplete } = await recycle.removeEvent(req.params.id);
    addLog(req.user.username, 'DELETE_EVENT', `物理删除事件 EID: ${req.params.id} (含文件)`);
    res.json({ message: incomplete ? '数据库记录已删除，但部分文件可能残留' : '删除成功，关联文件已清理' });
  } catch (error) {
    if (error instanceof RecycleError) return res.status(error.status).json({ message: error.message });
    context.logger.error('storage.failed', { error });
    res.status(500).json({ message: '服务器错误' });
  }
});
return router;
};
