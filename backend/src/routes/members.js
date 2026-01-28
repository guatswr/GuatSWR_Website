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

router.get('/', optionalAuth, (req, res) => {
  const includeDeleted = req.query.includeDeleted === '1';
  const preferOriginal = req.query.original === '1';
  const sql = includeDeleted && req.user?.role === 'super_admin'
    ? "SELECT * FROM members ORDER BY sort_order ASC, id ASC"
    : "SELECT * FROM members WHERE deleted_at IS NULL ORDER BY sort_order ASC, id ASC";
  db.all(sql, [], (err, rows) => {
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
