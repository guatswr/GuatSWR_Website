const express = require('express');
const { db, addLog } = require('../models/db');
const { authenticateToken, requireSuperAdmin } = require('../middlewares/auth');
const { validate } = require('../utils');
const { configSchema } = require('../controllers/schemas');
const { moveStagedFile, getConfigDir, isStagingUrl } = require('../utils/storage');

const router = express.Router();

router.get('/', authenticateToken, requireSuperAdmin, (req, res) => {
  db.all("SELECT * FROM site_config", [], (err, rows) => {
    const config = {};
    if (rows) rows.forEach(r => config[r.key] = r.value);
    res.json(config);
  });
});

router.post('/', authenticateToken, requireSuperAdmin, (req, res) => {
  const validated = validate(configSchema, req.body);
  if (!validated.ok) return res.status(400).json({ message: validated.error });
  const { key, value } = validated.data;
  (async () => {
    let finalValue = value;
    if (isStagingUrl(value)) {
      const targetDir = getConfigDir(key);
      finalValue = await moveStagedFile(value, targetDir);
    }
    db.run("INSERT OR REPLACE INTO site_config (key, value) VALUES (?, ?)", [key, finalValue], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      addLog(req.user.username, 'UPDATE_CONFIG', `修改配置: ${key}`);
      res.json({ message: "已保存" });
    });
  })().catch((moveErr) => res.status(500).json({ error: moveErr.message }));
});

module.exports = router;
