const express = require('express');
const { db, addLog } = require('../models/db');
const { authenticateToken, optionalAuth } = require('../middlewares/auth');

const router = express.Router();

// 初始化 events 表
db.run(`
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL DEFAULT 'general',
    title TEXT,
    content TEXT DEFAULT '{}',
    status TEXT DEFAULT 'draft',
    created_by INTEGER, 
    visitor_ip TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`, (err) => {
  if (err) console.error('Failed to create events table:', err);
});

// ==========================================
//  访客/公共接口
// ==========================================

// 1. 创建草稿 (获取 EID)
router.post('/draft', optionalAuth, (req, res) => {
  const userId = req.user ? req.user.id : null;
  const ip = req.ip; 
  
  const sql = `INSERT INTO events (status, created_by, visitor_ip) VALUES ('draft', ?, ?)`;
  
  db.run(sql, [userId, ip], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    const newEventId = this.lastID;
    res.json({ 
      id: newEventId, 
      message: "草稿创建成功" 
    });
  });
});

// 2. 提交/更新事件
router.put('/:id', optionalAuth, (req, res) => {
  const { type, title, content, submit } = req.body;
  const eventId = req.params.id;

  db.get("SELECT id, status FROM events WHERE id = ?", [eventId], (checkErr, row) => {
    if (checkErr) return res.status(500).json({ error: checkErr.message });
    if (!row) return res.status(404).json({ message: "Event not found" });

    // 已发布状态下，普通访客不可修改
    if (row.status === 'published' && !req.user) {
      return res.status(403).json({ message: "事件已发布，无法修改" });
    }

    let updates = [];
    let params = [];

    if (type) { updates.push('type = ?'); params.push(type); }
    if (title) { updates.push('title = ?'); params.push(title); }
    if (content) { updates.push('content = ?'); params.push(JSON.stringify(content)); }
    
    // 提交审核：draft -> pending
    if (submit === true) {
      updates.push('status = ?');
      params.push('pending');
    }

    if (updates.length === 0) return res.status(400).json({ message: "No fields to update" });

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(eventId);

    const sql = `UPDATE events SET ${updates.join(', ')} WHERE id = ?`;

    db.run(sql, params, function(err) {
      if (err) return res.status(500).json({ error: err.message });
      
      const username = req.user ? req.user.username : 'Visitor';
      if (submit) {
        addLog(username, 'SUBMIT_EVENT', `提交事件审核 EID: ${eventId}`);
      }
      
      res.json({ message: "保存成功", id: eventId });
    });
  });
});

// 3. 获取已发布列表 (Public)
router.get('/', optionalAuth, (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const offset = (page - 1) * limit;
  const type = req.query.type; 

  let whereClause = "status = 'published'";
  const params = [];

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
      const items = rows.map(row => {
        try { row.content = JSON.parse(row.content); } catch (e) { row.content = {}; }
        return row;
      });
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
    if (!row) return res.status(404).json({ message: "Not Found" });

    // 权限控制：只有管理员、作者本人可以看非发布状态的事件
    const isAdmin = req.user && (req.user.role === 'admin' || req.user.role === 'super_admin');
    const isOwner = req.user && req.user.id === row.created_by;
    
    if (row.status !== 'published' && !isAdmin && !isOwner) {
      return res.status(403).json({ message: "事件审核中或未公开" });
    }

    try { row.content = JSON.parse(row.content); } catch (e) { row.content = {}; }
    res.json(row);
  });
});

module.exports = router;