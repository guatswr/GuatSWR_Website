module.exports = (context) => {
const express = require('express');
const path = require('node:path');
const { db, addLog, IMG_ROOT_DIR } = context;
const { authenticateToken, optionalAuth, requireAdmin } = context.auth;
const { callBotHook } = require('../utils/botHooks');
const { moveStagedFile } = context.storage;
const { createEventContentPersister, assertVisitorContent } = require(path.join(context.BACKEND_ROOT, 'dist/src/utils/eventContentStorage.js'));

const { publicEvent } = require('../utils/publicEvent');
const signupModule = path.join(context.BACKEND_ROOT, 'dist/src/modules/events/signup');
const { createSignupRepository } = require(path.join(signupModule, 'repository'));
const { createSignupService } = require(path.join(signupModule, 'service'));
const { createSignupController } = require(path.join(signupModule, 'controller'));
const signupController = createSignupController(
  createSignupService({ repository: createSignupRepository(context.sql.main), notify: callBotHook }),
  error => context.logger.error('http.failed', { error, route: '/api/event/:id/signup' })
);
const stateModule = path.join(context.BACKEND_ROOT, 'dist/src/modules/events/state');
const { createEventStateRepository } = require(path.join(stateModule, 'repository'));
const { createEventStateService, eventStatuses } = require(path.join(stateModule, 'service'));
const { createEventStateController } = require(path.join(stateModule, 'controller'));
const stateController = createEventStateController(createEventStateService({
  repository: createEventStateRepository(context.sql.main), audit: addLog,
  notify: require('../utils/botHooks').callBotHook,
  reportAuditFailure: error => context.logger.error('audit.failed', { error })
}), error => context.logger.error('http.failed', { error, route: '/api/event/state' }));
const router = express.Router();
const persistEventContent = createEventContentPersister({ imageRoot: IMG_ROOT_DIR, moveStagedFile });

const PUBLIC_STATUSES = ['published', 'ongoing', 'ended', 'settled'];

const ADMIN_STATUSES = eventStatuses;

const dbGet = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
});
const dbAll = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || [])));
});
const dbRun = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function(err) {
    if (err) return reject(err);
    resolve(this);
  });
});

const parseContent = (row) => {
  const next = { ...row };
  try { next.content = JSON.parse(row.content || '{}'); } catch (e) { next.content = {}; }
  return next;
};

const normalizeStatusList = (raw) => {
  if (!raw) return ADMIN_STATUSES;
  const tokens = String(raw).split(',').map((s) => s.trim()).filter(Boolean);
  const filtered = tokens.filter((s) => ADMIN_STATUSES.includes(s));
  return filtered.length > 0 ? filtered : ADMIN_STATUSES;
};

const isPublicStatus = (status) => PUBLIC_STATUSES.includes(status);

const getActor = (req) => (req.user ? { id: req.user.id, username: req.user.username, role: req.user.role } : null);
// ==========================================
//  访客/公共接口
// ==========================================

// 1. 创建草稿 (获取 EID)
router.post('/draft', optionalAuth, context.guestGateway, context.guestProof.check('draft'), (req, res) => {
  const userId = req.user ? req.user.id : null;
  const ip = req.ip;

  const sql = `INSERT INTO events (status, created_by, visitor_ip) VALUES ('draft', ?, ?)`;

  db.run(sql, [userId, ip], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    const newEventId = this.lastID;
    res.json({
      id: newEventId,
      message: '草稿创建成功'
    });
  });
});

// 2. 提交/更新事件
router.put('/:id', optionalAuth, context.guestGateway, context.guestProof.check('save'), (req, res) => {
  const { type, title, content, submit } = req.body;
  const eventId = req.params.id;

  db.get('SELECT id, status FROM events WHERE id = ?', [eventId], async (checkErr, row) => {
    if (checkErr) return res.status(500).json({ error: checkErr.message });
    if (!row) return res.status(404).json({ message: 'Event not found' });

    // 已发布状态下，普通访客不可修改
    if (row.status === 'published' && !req.user) {
      return res.status(403).json({ message: '事件已发布，无法修改' });
    }

    if (content && !['admin', 'super_admin'].includes(req.user?.role)) {
      try { assertVisitorContent(content); }
      catch (error) {
        if ([400, 413].includes(error.status)) return res.status(error.status).json({ message: error.message });
        return res.status(500).json({ message: '服务器错误' });
      }
    }

    let storedContent;
    try {
      if (content) storedContent = await persistEventContent(content, row.id);
    } catch (error) {
      return res.status(500).json({ message: '活动图片保存失败，请重试' });
    }

    const updates = [];
    const params = [];

    if (type) { updates.push('type = ?'); params.push(type); }
    if (title) { updates.push('title = ?'); params.push(title); }
    if (content) { updates.push('content = ?'); params.push(JSON.stringify(storedContent)); }

    // 提交审核：draft -> pending
    if (submit === true) {
      updates.push('status = ?');
      params.push('pending');
    }

    if (updates.length === 0) return res.status(400).json({ message: 'No fields to update' });

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(eventId);

    const sql = `UPDATE events SET ${updates.join(', ')} WHERE id = ?`;

    try {
      // File preparation is complete. Recheck eligibility under the writer lock,
      // so an earlier snapshot cannot undo a committed approval or deletion.
      const outcome = await context.sql.main.transaction(async (tx) => {
        const current = await tx.get('SELECT id, status FROM events WHERE id = ?', [eventId]);
        if (!current) return 404;
        if (current.status === 'published' && !req.user) return 403;
        await tx.run(sql, params);
        return 200;
      });
      if (outcome === 404) return res.status(404).json({ message: 'Event not found' });
      if (outcome === 403) return res.status(403).json({ message: '事件已发布，无法修改' });
      const username = req.user ? req.user.username : 'Visitor';
      if (submit) {
        addLog(username, 'SUBMIT_EVENT', `提交事件审核 EID: ${eventId}`);
      }

      res.json({ message: '保存成功', id: eventId });
    } catch (error) {
      context.logger.error('http.failed', { error, route: '/api/event/:id' });
      res.status(500).json({ message: '服务器错误' });
    }
  });
});

// 3. 获取已发布列表 (Public)
router.get('/', optionalAuth, (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const offset = (page - 1) * limit;
  const type = req.query.type;

  const statusParams = [...PUBLIC_STATUSES];
  let whereClause = `status IN (${statusParams.map(() => '?').join(',')})`;
  const params = [...statusParams];

  if (type) {
    whereClause += ' AND type = ?';
    params.push(type);
  }

  db.get(`SELECT COUNT(*) as count FROM events WHERE ${whereClause}`, params, (countErr, countRow) => {
    if (countErr) return res.status(500).json({ error: countErr.message });
    const total = countRow?.count || 0;

    const sql = `
      SELECT e.*, u.username as created_by_name, u.avatar as created_by_avatar
      FROM events e
      LEFT JOIN users u ON e.created_by = u.id
      WHERE ${whereClause}
      ORDER BY e.created_at DESC
      LIMIT ? OFFSET ?
    `;

    db.all(sql, [...params, limit, offset], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      const items = rows.map(parseContent).map(publicEvent);
      res.json({ total, page, limit, items });
    });
  });
});

// 4. 获取详情 (Public)
router.get('/:id', optionalAuth, (req, res) => {
  const sql = `
    SELECT e.*, u.username as created_by_name, u.avatar as created_by_avatar
    FROM events e
    LEFT JOIN users u ON e.created_by = u.id
    WHERE e.id = ?
  `;
  db.get(sql, [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ message: 'Not Found' });

    // 权限控制：只有管理员、作者本人可以看非发布状态的事件
    const isAdmin = req.user && (req.user.role === 'admin' || req.user.role === 'super_admin');
    const isOwner = req.user && req.user.id === row.created_by;

    if (!isPublicStatus(row.status) && !isAdmin && !isOwner) {
      return res.status(403).json({ message: '事件审核中或未公开' });
    }

    res.vary('Authorization');
    if (isAdmin || isOwner) {
      res.setHeader('Cache-Control', 'private, no-store');
      return res.json(parseContent(row));
    }
    res.json(publicEvent(parseContent(row)));
  });
});

// 5–8. Typed signup service; eligibility and upsert share one transaction.
router.post('/:id/signup', optionalAuth, context.guestGateway, (req, res, next) => signupController.signup(req, res).catch(next));
router.get('/:id/signup', optionalAuth, context.guestGateway, (req, res, next) => signupController.find(req, res).catch(next));
router.delete('/:id/signup', optionalAuth, context.guestGateway, (req, res, next) => signupController.remove(req, res).catch(next));
router.get('/:id/participants/public', optionalAuth, (req, res, next) => signupController.list(req, res).catch(next));
// ==========================================
//  管理员接口
// ==========================================

// 9. 管理员列表
router.get('/admin/list', authenticateToken, requireAdmin, async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const offset = (page - 1) * limit;
  const type = String(req.query.type || '').trim();
  const statuses = normalizeStatusList(req.query.status);

  const whereParts = [];
  const params = [];
  if (statuses.length > 0) {
    whereParts.push(`status IN (${statuses.map(() => '?').join(',')})`);
    params.push(...statuses);
  }
  if (type) {
    whereParts.push('type = ?');
    params.push(type);
  }
  const whereClause = whereParts.length ? whereParts.join(' AND ') : '1=1';

  try {
    const countRow = await dbGet(`SELECT COUNT(*) as count FROM events WHERE ${whereClause}`, params);
    const sql = `
      SELECT e.*, u.username as created_by_name, u.avatar as created_by_avatar
      FROM events e
      LEFT JOIN users u ON e.created_by = u.id
      WHERE ${whereClause}
      ORDER BY e.created_at DESC
      LIMIT ? OFFSET ?
    `;
    const rows = await dbAll(sql, [...params, limit, offset]);
    res.json({ total: countRow?.count || 0, page, limit, items: rows.map(parseContent) });
  } catch (err) {
    res.status(500).json({ message: '加载失败', error: err.message });
  }
});

// 10. 管理员创建活动
router.post('/admin', authenticateToken, requireAdmin, async (req, res) => {
  const { type, title, content, status } = req.body || {};
  if (!type) return res.status(400).json({ message: '缺少活动类型' });

  const finalStatus = ADMIN_STATUSES.includes(status) ? status : 'published';
  try {
    const result = await dbRun(
      'INSERT INTO events (type, title, content, status, created_by, visitor_ip) VALUES (?, ?, ?, ?, ?, ?)',
      [type, title || '', JSON.stringify(content || {}), 'draft', req.user.id, req.ip]
    );
    let storedContent;
    try {
      storedContent = await persistEventContent(content || {}, result.lastID);
      await dbRun('UPDATE events SET content = ?, status = ? WHERE id = ?', [JSON.stringify(storedContent), finalStatus, result.lastID]);
    } catch (error) {
      await dbRun('DELETE FROM events WHERE id = ?', [result.lastID]);
      throw error;
    }
    addLog(req.user.username, 'CREATE_EVENT', `管理员发布活动 EID: ${result.lastID}`);
    if (finalStatus === 'published') {
      callBotHook('event.published', { eventId: result.lastID, type, title, content: storedContent }, getActor(req)).catch(() => {});
    }
    res.json({ id: result.lastID, message: '创建成功' });
  } catch (err) {
    res.status(500).json({ message: '创建失败', error: err.message });
  }
});

// 11–16. Shared typed state rules; legacy broad transitions are preserved.
router.post('/:id/approve', authenticateToken, requireAdmin, (req, res, next) => stateController.approve(req, res).catch(next));
router.post('/:id/reject', authenticateToken, requireAdmin, (req, res, next) => stateController.reject(req, res).catch(next));
router.post('/:id/status', authenticateToken, requireAdmin, (req, res, next) => stateController.status(req, res).catch(next));
router.post('/:id/delete', authenticateToken, requireAdmin, (req, res, next) => stateController.remove(req, res).catch(next));
router.post('/:id/settle', authenticateToken, requireAdmin, (req, res, next) => stateController.settle(req, res).catch(next));
router.post('/:id/set_result', authenticateToken, requireAdmin, (req, res, next) => stateController.result(req, res).catch(next));
// 17. 查看报名列表
router.get('/:id/participants', authenticateToken, requireAdmin, async (req, res) => {
  const eventId = Number(req.params.id || 0);
  if (!Number.isInteger(eventId) || eventId <= 0) return res.status(400).json({ message: 'Invalid event id' });

  try {
    const rows = await dbAll(
      'SELECT * FROM event_participants WHERE event_id = ? ORDER BY created_at ASC',
      [eventId]
    );
    res.json({ items: rows });
  } catch (err) {
    res.status(500).json({ message: '加载失败', error: err.message });
  }
});

return router;

};
