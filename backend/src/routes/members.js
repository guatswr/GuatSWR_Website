const express = require('express');
const path = require('path');
const fs = require('fs');
const { db, addLog, IMG_ROOT_DIR } = require('../models/db');
const { authenticateToken, optionalAuth, requireSuperAdmin } = require('../middlewares/auth');
const { validate } = require('../utils');
const { memberSchema } = require('../controllers/schemas');
const { moveStagedFile, resolveUploadsPath, toUploadsUrl } = require('../utils/storage');
const { notifyMemberAdded } = require('../utils/bot');

const router = express.Router();

const buildThumbUrl = (url) => {
  if (!url || typeof url !== 'string') return url;
  if (url.includes('-thumb.webp')) return url;
  let origin = '';
  let pathname = url;
  try {
    if (/^https?:\/\//i.test(url)) {
      const parsed = new URL(url);
      origin = parsed.origin;
      pathname = parsed.pathname || '';
    }
  } catch {
    // ignore parse errors
  }
  if (!pathname.startsWith('/uploads/')) return url;
  const abs = resolveUploadsPath(pathname);
  if (!abs) return url;
  const base = path.parse(abs).name;
  const thumbAbs = path.join(path.dirname(abs), `${base}-thumb.webp`);
  if (!fs.existsSync(thumbAbs)) return url;
  const thumbUrl = toUploadsUrl(thumbAbs);
  return origin ? `${origin}${thumbUrl}` : thumbUrl;
};

// [新增功能] 获取按学校分组的成员数量统计
// 路由放在 /:id 之前，避免被 /:id 误匹配
router.get('/stats/schools', (req, res) => {
  // 仅统计未删除的成员
  const sql = `
    SELECT school, COUNT(*) as count 
    FROM members 
    WHERE deleted_at IS NULL 
    GROUP BY school 
    ORDER BY count DESC, school ASC
  `;
  db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    // 将空字符串学校名称转换为 "其他" 或保持原样，视需求而定，这里保持原样
    res.json(rows);
  });
});

// [修改功能] 获取成员列表 (支持 ?school=... 筛选)
router.get('/', optionalAuth, (req, res) => {
  const includeDeleted = req.query.includeDeleted === '1';
  const preferOriginal = req.query.original === '1';
  const filterSchool = req.query.school; // 获取学校筛选参数

  let query = "SELECT * FROM members";
  const params = [];
  const conditions = [];

  // 1. 构建筛选条件
  // 逻辑：如果是超级管理员且请求包含删除数据，则不加 deleted_at 限制；否则只显示未删除的
  if (!(includeDeleted && req.user?.role === 'super_admin')) {
    conditions.push("deleted_at IS NULL");
  }

  // 逻辑：如果存在学校参数，加入筛选
  if (filterSchool) {
    conditions.push("school = ?");
    params.push(filterSchool);
  }

  // 2. 组装 SQL
  if (conditions.length > 0) {
    query += " WHERE " + conditions.join(" AND ");
  }

  query += " ORDER BY sort_order ASC, id ASC";

  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message }); // 增加简单的错误处理

    const list = (rows || []).map((row) => ({
      ...row,
      avatar_thumb: buildThumbUrl(row.avatar),
      avatar_original: row.avatar
    }));
    if (preferOriginal) return res.json(list);
    return res.json(list.map((row) => ({
      ...row,
      avatar: row.avatar_thumb || row.avatar
    })));
  });
});

router.post('/', authenticateToken, (req, res) => {
  const validated = validate(memberSchema, req.body);
  if (!validated.ok) return res.status(400).json({ message: validated.error });
  const { name, role, bio, avatar, school, sort_order } = validated.data;
  const userDir = path.join(IMG_ROOT_DIR, 'user');
  (async () => {
    const movedAvatar = await moveStagedFile(avatar, userDir);
    db.run("INSERT INTO members (name, role, bio, avatar, school, sort_order) VALUES (?, ?, ?, ?, ?, ?)", [name, role, bio, movedAvatar, school || '', sort_order || 0], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      addLog(req.user.username, 'CREATE_MEMBER', `添加成员: ${name}`);
      notifyMemberAdded({
        id: this.lastID,
        name,
        role,
        school: school || '',
        avatar: movedAvatar || ''
      }, req.user).catch(() => {});
      res.json({ id: this.lastID });
    });
  })().catch((moveErr) => res.status(500).json({ error: moveErr.message }));
});

router.put('/:id', authenticateToken, (req, res) => {
  const validated = validate(memberSchema, req.body);
  if (!validated.ok) return res.status(400).json({ message: validated.error });
  const { name, role, bio, avatar, school, sort_order } = validated.data;
  const userDir = path.join(IMG_ROOT_DIR, 'user');
  (async () => {
    const movedAvatar = await moveStagedFile(avatar, userDir);
    db.run("UPDATE members SET name=?, role=?, bio=?, avatar=?, school=?, sort_order=? WHERE id=?", [name, role, bio, movedAvatar, school || '', sort_order || 0, req.params.id], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      addLog(req.user.username, 'UPDATE_MEMBER', `更新成员: ${name}`);
      res.json({ message: "成员更新成功" });
    });
  })().catch((moveErr) => res.status(500).json({ error: moveErr.message }));
});

router.delete('/:id', authenticateToken, (req, res) => {
  db.get("SELECT name, avatar FROM members WHERE id = ?", [req.params.id], (err, row) => {
    const name = row ? row.name : 'Unknown';
    db.run("UPDATE members SET deleted_at = CURRENT_TIMESTAMP, deleted_by = ? WHERE id = ?", [req.user.id, req.params.id], async (delErr) => {
      if (delErr) return res.status(500).json({ error: delErr.message });
      addLog(req.user.username, 'DELETE_MEMBER', `软删除成员: ${name}`);
      res.json({ message: "已软删除" });
    });
  });
});

router.post('/:id/restore', authenticateToken, requireSuperAdmin, (req, res) => {
  db.get("SELECT name FROM members WHERE id = ?", [req.params.id], (err, row) => {
    const name = row ? row.name : 'Unknown';
    db.run("UPDATE members SET deleted_at = NULL, deleted_by = NULL WHERE id = ?", [req.params.id], (restoreErr) => {
      if (restoreErr) return res.status(500).json({ error: restoreErr.message });
      addLog(req.user.username, 'RESTORE_MEMBER', `恢复成员: ${name}`);
      res.json({ message: "已恢复" });
    });
  });
});

module.exports = router;