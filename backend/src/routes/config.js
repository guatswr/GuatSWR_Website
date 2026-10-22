module.exports = (context) => {
const express = require('express');
const { db, addLog } = context;
const { authenticateToken, requireAdmin, optionalAuth } = context.auth;
const { validate } = require('../utils');
const { configSchema } = require('../controllers/schemas');
const { moveStagedFile, getConfigDir, isStagingUrl } = context.storage;

const router = express.Router();

router.get('/', optionalAuth, (req, res) => {
  db.all("SELECT * FROM site_config", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const config = {};
    if (rows) rows.forEach(r => config[r.key] = r.value);

    if (req.user && (req.user.role === 'super_admin' || req.user.role === 'admin')) {
      return res.json(config);
    }

    const publicKeys = [
      'home_bg',
      'join_bg',
      'banner_text',
      'badge_image',
      'mascot_image',
      'qq_qr_image',
      'qq_group_number',
      'qq_join_url',
      'join_question',
      'home_links'
    ];

    const publicConfig = {};
    publicKeys.forEach((key) => {
      if (key in config) publicConfig[key] = config[key];
    });
    res.json(publicConfig);
  });
});

router.post('/', authenticateToken, requireAdmin, (req, res) => {
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

return router;

};
