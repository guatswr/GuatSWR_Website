const express = require('express');
const path = require('path');
const { db, addLog, DATA_DIR } = require('../models/db');
const { authenticateToken, optionalAuth, requireSuperAdmin } = require('../middlewares/auth');
const { validate } = require('../utils');
const { memberSchema } = require('../controllers/schemas');
const { moveStagedFile } = require('../utils/storage');
const { notifyMemberAdded } = require('../utils/bot');

const router = express.Router();

router.get('/', optionalAuth, (req, res) => {
  const includeDeleted = req.query.includeDeleted === '1';
  const sql = includeDeleted && req.user?.role === 'super_admin'
    ? "SELECT * FROM members ORDER BY sort_order ASC, id ASC"
    : "SELECT * FROM members WHERE deleted_at IS NULL ORDER BY sort_order ASC, id ASC";
  db.all(sql, [], (err, rows) => res.json(rows || []));
});

router.post('/', authenticateToken, (req, res) => {
  const validated = validate(memberSchema, req.body);
  if (!validated.ok) return res.status(400).json({ message: validated.error });
  const { name, role, bio, avatar, school, sort_order } = validated.data;
  const userDir = path.join(DATA_DIR, 'img', 'user');
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
  const userDir = path.join(DATA_DIR, 'img', 'user');
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
