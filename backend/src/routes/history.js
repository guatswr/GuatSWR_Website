module.exports = (context) => {
const express = require('express');
const { db, addLog } = context;
const { authenticateToken, optionalAuth, requireSuperAdmin } = context.auth;
const { validate } = require('../utils');
const { historySchema } = require('../controllers/schemas');
const { moveStagedFile, getHistoryDir } = context.storage;
const { notifyHistoryUpdated } = context.bot;

const router = express.Router();

router.get('/', optionalAuth, (req, res) => {
  const includeDeleted = req.query.includeDeleted === '1';
  const sql = includeDeleted && req.user?.role === 'super_admin'
    ? "SELECT * FROM history ORDER BY date ASC, sort_order ASC"
    : "SELECT * FROM history WHERE deleted_at IS NULL ORDER BY date ASC, sort_order ASC";
  db.all(sql, [], (err, rows) => res.json(rows || []));
});

router.post('/', authenticateToken, (req, res) => {
  const validated = validate(historySchema, req.body);
  if (!validated.ok) return res.status(400).json({ message: validated.error });
  const { date, title, description, image, sort_order } = validated.data;
  const historyDir = getHistoryDir(date);
  (async () => {
    const movedImage = await moveStagedFile(image, historyDir);
    db.run("INSERT INTO history (date, title, description, image, sort_order) VALUES (?, ?, ?, ?, ?)", 
      [date, title, description, movedImage, sort_order || 0], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        addLog(req.user.username, 'CREATE_HISTORY', `添加群史: ${title}`);
        notifyHistoryUpdated({
          id: this.lastID,
          date,
          title,
          description: description || '',
          image: movedImage || '',
          sort_order: sort_order || 0
        }, req.user, 'create').catch(() => {});
        res.json({ id: this.lastID });
      });
  })().catch((moveErr) => res.status(500).json({ error: moveErr.message }));
});

router.put('/:id', authenticateToken, (req, res) => {
  const validated = validate(historySchema, req.body);
  if (!validated.ok) return res.status(400).json({ message: validated.error });
  const { date, title, description, image, sort_order } = validated.data;
  const historyDir = getHistoryDir(date);
  (async () => {
    const movedImage = await moveStagedFile(image, historyDir);
    db.run("UPDATE history SET date=?, title=?, description=?, image=?, sort_order=? WHERE id=?", 
      [date, title, description, movedImage, sort_order, req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        addLog(req.user.username, 'UPDATE_HISTORY', `更新群史: ${title}`);
        notifyHistoryUpdated({
          id: Number(req.params.id),
          date,
          title,
          description: description || '',
          image: movedImage || '',
          sort_order: sort_order || 0
        }, req.user, 'update').catch(() => {});
        res.json({ message: "更新成功" });
      });
  })().catch((moveErr) => res.status(500).json({ error: moveErr.message }));
});

router.delete('/:id', authenticateToken, (req, res) => {
  db.get("SELECT title, image FROM history WHERE id = ?", [req.params.id], (err, row) => {
    const title = row ? row.title : 'Unknown';
    db.run("UPDATE history SET deleted_at = CURRENT_TIMESTAMP, deleted_by = ? WHERE id = ?", [req.user.id, req.params.id], async (delErr) => {
      if (delErr) return res.status(500).json({ error: delErr.message });
      addLog(req.user.username, 'DELETE_HISTORY', `软删除群史: ${title}`);
      res.json({ message: "已软删除" });
    });
  });
});

router.post('/:id/restore', authenticateToken, requireSuperAdmin, (req, res) => {
  db.get("SELECT title FROM history WHERE id = ?", [req.params.id], (err, row) => {
    const title = row ? row.title : 'Unknown';
    db.run("UPDATE history SET deleted_at = NULL, deleted_by = NULL WHERE id = ?", [req.params.id], (restoreErr) => {
      if (restoreErr) return res.status(500).json({ error: restoreErr.message });
      addLog(req.user.username, 'RESTORE_HISTORY', `恢复群史: ${title}`);
      res.json({ message: "已恢复" });
    });
  });
});

return router;

};
