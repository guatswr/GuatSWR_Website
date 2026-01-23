const express = require('express');
const fs = require('fs');
const path = require('path');
const { upload } = require('../middlewares/upload');
const sharp = require('sharp');
const { uploadLimiter } = require('../middlewares/limiter');
const { authenticateToken } = require('../middlewares/auth');
const { addLog, DATA_DIR, ICON_SVG_DIR } = require('../models/db');
const { moveStagedFile } = require('../utils/storage');

const router = express.Router();

const isMagicValid = (buffer, mimetype) => {
  if (!buffer || buffer.length < 4) return false;
  const sig = buffer;
  if (mimetype === 'image/jpeg') return sig[0] === 0xff && sig[1] === 0xd8 && sig[2] === 0xff;
  if (mimetype === 'image/png') return sig.slice(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]));
  if (mimetype === 'image/gif') return sig.slice(0, 6).toString('ascii') === 'GIF87a' || sig.slice(0, 6).toString('ascii') === 'GIF89a';
  if (mimetype === 'image/webp') {
    return sig.slice(0, 4).toString('ascii') === 'RIFF' && sig.slice(8, 12).toString('ascii') === 'WEBP';
  }
  if (mimetype === 'image/svg+xml') {
    const text = sig.toString('utf8').toLowerCase();
    return text.includes('<svg');
  }
  return false;
};

const validateUploadedFile = async (file) => {
  const filePath = file.path;
  const fd = await fs.promises.open(filePath, 'r');
  try {
    const { buffer } = await fd.read(Buffer.alloc(256), 0, 256, 0);
    return isMagicValid(buffer, file.mimetype);
  } finally {
    await fd.close();
  }
};

router.post('/', authenticateToken, uploadLimiter, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: '文件上传失败' });
  let thumbUrl = null;
  const activityId = req.query.activityId;
  const category = req.query.category;
  try {
    const ok = await validateUploadedFile(req.file);
    if (!ok) {
      await fs.promises.unlink(req.file.path);
      return res.status(400).json({ message: '不支持的文件内容' });
    }
    await fs.promises.chmod(req.file.path, 0o644);
    if (req.file.mimetype !== 'image/svg+xml') {
      const parsed = path.parse(req.file.filename);
      const thumbName = `${parsed.name}-thumb.webp`;
      const thumbPath = path.join(path.dirname(req.file.path), thumbName);
      await sharp(req.file.path)
        .resize({ width: 640, height: 640, fit: 'inside' })
        .webp({ quality: 75 })
        .toFile(thumbPath);
      await fs.promises.chmod(thumbPath, 0o644);
      thumbUrl = `/uploads/upload/${thumbName}`;
    }
  } catch (err) {
    await fs.promises.unlink(req.file.path).catch(() => {});
    return res.status(400).json({ message: '文件校验失败' });
  }

  addLog(req.user.username, 'UPLOAD', `上传文件: ${req.file.filename}`);
  let url = `/uploads/upload/${req.file.filename}`;
  if (category === 'icon_svg') {
    url = await moveStagedFile(url, ICON_SVG_DIR);
  } else if (activityId) {
    const activityDir = path.join(DATA_DIR, 'img', 'activity', String(activityId));
    url = await moveStagedFile(url, activityDir);
    if (thumbUrl) {
      thumbUrl = url.replace(/(\.[a-z0-9]+)$/i, '-thumb.webp');
    }
  }
  res.json({ url, thumbUrl });
});

module.exports = router;
