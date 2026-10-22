module.exports = (context) => {
const express = require('express');
const path = require('path');
const { db, addLog, IMG_ROOT_DIR } = context;
const { authenticateToken, optionalAuth, requireSuperAdmin } = context.auth;
const { validate, normalizeImages } = require('../utils');
const { activitySchema } = require('../controllers/schemas');
const { moveStagedFile, moveStagedFiles, moveStagedUrlsInText } = context.storage;
const { notifyActivityPublished } = context.bot;

const router = express.Router();

router.get('/', optionalAuth, (req, res) => {
  const includeAll = req.query.all === '1';
  const includeDeleted = req.query.includeDeleted === '1';
  if (includeAll && !req.user) return res.status(401).json({ message: '未登录' });

  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limitRaw = parseInt(req.query.limit, 10) || 20;
  const limit = Math.min(100, Math.max(1, limitRaw));
  const offset = (page - 1) * limit;

  let where = '';
  if (includeAll) {
    if (includeDeleted && req.user?.role === 'super_admin') {
      where = '1=1';
    } else {
      where = 'deleted_at IS NULL';
    }
  } else {
    where = "(status = 'published' OR status IS NULL) AND deleted_at IS NULL";
  }

  const sqlBase = `FROM activities WHERE ${where}`;
  db.get(`SELECT COUNT(*) as count ${sqlBase}`, [], (countErr, countRow) => {
    if (countErr) return res.status(500).json({ error: countErr.message });
    const total = countRow?.count || 0;
    db.all(`SELECT * ${sqlBase} ORDER BY date DESC LIMIT ? OFFSET ?`, [limit, offset], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({
        total,
        page,
        limit,
        items: rows.map(r => ({ ...r, images: normalizeImages(r.images) }))
      });
    });
  });
});

router.get('/:id', optionalAuth, (req, res) => {
  const sql = `
    SELECT 
      a.*, 
      u1.username as created_by_name, 
      u1.avatar as created_by_avatar,
      u2.username as updated_by_name, 
      u2.avatar as updated_by_avatar
    FROM activities a
    LEFT JOIN users u1 ON a.created_by = u1.id
    LEFT JOIN users u2 ON a.updated_by = u2.id
    WHERE a.id = ?
  `;
  db.get(sql, [req.params.id], (err, row) => {
    if (!row) return res.status(404).json({ message: "Not Found" });
    if (row.deleted_at && req.user?.role !== 'super_admin') return res.status(404).json({ message: "Not Found" });
    if (row.status === 'draft' && !req.user) return res.status(404).json({ message: "Not Found" });
    row.images = normalizeImages(row.images);
    row.created_by = row.created_by_name; 
    row.updated_by = row.updated_by_name;
    res.json(row);
  });
});

router.post('/draft', authenticateToken, (req, res) => {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  db.run(
    "INSERT INTO activities (title, tag, date, description, content, cover_image, images, created_by, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ['(草稿)', '', date, '', '', '', '[]', req.user.id, 'draft'],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID });
    }
  );
});

router.post('/', authenticateToken, (req, res) => {
  const validated = validate(activitySchema, req.body);
  if (!validated.ok) return res.status(400).json({ message: validated.error });
  const { title, tag, date, description, content, cover_image, images } = validated.data;
  const normalizedImages = normalizeImages(images);

  db.run("INSERT INTO activities (title, tag, date, description, content, cover_image, images, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", 
    [title, tag, date, description, content, cover_image, JSON.stringify(normalizedImages), req.user.id], 
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      const activityId = this.lastID;
      const activityDir = path.join(IMG_ROOT_DIR, 'activity', String(activityId));
      (async () => {
        const movedCover = await moveStagedFile(cover_image, activityDir);
        const movedImages = await moveStagedFiles(normalizedImages, activityDir);
        const movedContent = await moveStagedUrlsInText(content, activityDir);
        db.run("UPDATE activities SET cover_image=?, images=?, content=? WHERE id=?",
          [movedCover, JSON.stringify(movedImages), movedContent, activityId], (updateErr) => {
            if (updateErr) return res.status(500).json({ error: updateErr.message });
            addLog(req.user.username, 'CREATE_ACTIVITY', `发布活动: ${title}`);
            notifyActivityPublished({
              id: activityId,
              title,
              tag,
              date,
              description: description || '',
              cover_image: movedCover || ''
            }, req.user).catch(() => {});
            res.json({ id: activityId, message: "发布成功" });
          });
      })().catch((moveErr) => res.status(500).json({ error: moveErr.message }));
    });
});

router.put('/:id', authenticateToken, (req, res) => {
  const validated = validate(activitySchema, req.body);
  if (!validated.ok) return res.status(400).json({ message: validated.error });
  const { title, tag, date, description, content, cover_image, images } = validated.data;
  const normalizedImages = normalizeImages(images);

  const activityDir = path.join(IMG_ROOT_DIR, 'activity', String(req.params.id));
  (async () => {
    const movedCover = await moveStagedFile(cover_image, activityDir);
    const movedImages = await moveStagedFiles(normalizedImages, activityDir);
    const movedContent = await moveStagedUrlsInText(content, activityDir);
    db.run("UPDATE activities SET title=?, tag=?, date=?, description=?, content=?, cover_image=?, images=?, updated_by=?, status=? WHERE id=?", 
      [title, tag, date, description, movedContent, movedCover, JSON.stringify(movedImages), req.user.id, 'published', req.params.id], 
      (err) => {
        if (err) return res.status(500).json({ error: err.message });
        addLog(req.user.username, 'UPDATE_ACTIVITY', `更新活动: ${title}`);
        res.json({ message: "更新成功" });
      });
  })().catch((moveErr) => res.status(500).json({ error: moveErr.message }));
});

router.delete('/:id', authenticateToken, (req, res) => {
  db.get("SELECT title, cover_image, images FROM activities WHERE id = ?", [req.params.id], (err, row) => {
    const title = row ? row.title : 'Unknown';
    db.run("UPDATE activities SET deleted_at = CURRENT_TIMESTAMP, deleted_by = ? WHERE id = ?", [req.user.id, req.params.id], (delErr) => {
      if (delErr) return res.status(500).json({ error: delErr.message });
      addLog(req.user.username, 'DELETE_ACTIVITY', `软删除活动: ${title}`);
      res.json({ message: "已软删除" });
    });
  });
});

router.post('/:id/restore', authenticateToken, requireSuperAdmin, (req, res) => {
  db.get("SELECT title FROM activities WHERE id = ?", [req.params.id], (err, row) => {
    const title = row ? row.title : 'Unknown';
    db.run("UPDATE activities SET deleted_at = NULL, deleted_by = NULL WHERE id = ?", [req.params.id], (restoreErr) => {
      if (restoreErr) return res.status(500).json({ error: restoreErr.message });
      addLog(req.user.username, 'RESTORE_ACTIVITY', `恢复活动: ${title}`);
      res.json({ message: "已恢复" });
    });
  });
});

return router;

};
