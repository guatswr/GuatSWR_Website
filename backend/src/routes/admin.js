module.exports = (context) => {
const express = require('express');
const path = require('path');

const net = require('net');
const { db, addLog } = context;
const { authenticateToken, requireSuperAdmin } = context.auth;


const { runAutoBackup } = context.scheduler;
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
const { createBackupFilesController } = require(path.join(context.BACKEND_ROOT, 'dist/src/backup/files-controller'));
const backupFiles = createBackupFilesController(context.backup, addLog, error => context.logger.warn('backup.failed', { error }));
const router = express.Router();

const { createAdminService } = require(path.join(context.BACKEND_ROOT, 'dist/src/admin/service'));
const { createAdminController } = require(path.join(context.BACKEND_ROOT, 'dist/src/admin/controller'));
const report = error => context.logger.error('http.failed', { error, route: '/api/admin' });
const admin = createAdminController(createAdminService({ main: context.sql.main, audit: context.sql.audit, security: context.security, log: addLog, report }), report);
const handle = fn => (req, res, next) => fn(req, res).catch(next);
router.get('/users', authenticateToken, requireSuperAdmin, handle(admin.users));
router.delete('/users/:id', authenticateToken, requireSuperAdmin, handle(admin.deleteUser));
router.put('/users/:id/password', authenticateToken, requireSuperAdmin, handle(admin.resetPassword));
router.put('/users/:id/twofa/reset', authenticateToken, requireSuperAdmin, handle(admin.resetSecondPassword));
router.post('/token-version/refresh', authenticateToken, requireSuperAdmin, handle(admin.refreshVersion));
router.get('/logs', authenticateToken, handle(admin.logs));
router.delete('/logs/:id', authenticateToken, requireSuperAdmin, handle(admin.deleteLog));

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
router.get('/backups', authenticateToken, requireSuperAdmin, (req, res, next) => backupFiles.list(req, res).catch(next));
router.get('/backups/download', authenticateToken, requireSuperAdmin, (req, res, next) => backupFiles.download(req, res).catch(next));
router.delete('/backups', authenticateToken, requireSuperAdmin, (req, res, next) => backupFiles.remove(req, res).catch(next));
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
router.get('/events/pending', authenticateToken, handle(admin.pending));

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
