module.exports = (context) => {
const express = require('express');
const fs = require('fs');
const path = require('path');
const { upload } = context.upload;
const sharp = require('sharp');
const { uploadLimiter } = context.limiter;
const { authenticateToken } = context.auth;
const { addLog, IMG_ROOT_DIR, ICON_SVG_DIR } = context;
const { moveStagedFile } = context.storage;
const { positiveId } = require('../utils/storageBoundary');

const router = express.Router();

const { validateUploadedFile, publishStagingFile } = context.images;

router.post('/', authenticateToken, uploadLimiter, (req, res, next) => {
  if (req.query.activityId !== undefined && !positiveId(req.query.activityId)) return res.status(400).json({ message: 'Invalid activity id' });
  next();
}, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: '文件上传失败' });
  let thumbUrl = null;
  let thumbPath = null;
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
      thumbPath = path.join(path.dirname(req.file.path), thumbName);
      await sharp(req.file.path)
        .resize({ width: 640, height: 640, fit: 'inside' })
        .webp({ quality: 75 })
        .toFile(thumbPath);
      await fs.promises.chmod(thumbPath, 0o644);
      thumbUrl = `/uploads/upload/${thumbName}`;
    }
    await publishStagingFile(req.file, thumbPath);
  } catch (err) {
    if (thumbPath) await fs.promises.unlink(thumbPath).catch(() => {});
    await fs.promises.unlink(req.file.path).catch(() => {});
    return res.status(400).json({ message: '文件校验失败' });
  }

  addLog(req.user.username, 'UPLOAD', `上传文件: ${req.file.filename}`);
  let url = `/uploads/upload/${req.file.filename}`;
  try {
    if (category === 'icon_svg') {
      url = await moveStagedFile(url, ICON_SVG_DIR);
    } else if (activityId) {
      const activityDir = path.join(IMG_ROOT_DIR, 'activity', String(activityId));
      url = await moveStagedFile(url, activityDir);
      if (thumbUrl) {
        thumbUrl = url.replace(/(\.[a-z0-9]+)$/i, '-thumb.webp');
      }
    }
    res.json({ url, thumbUrl });
  } catch (error) {
    await fs.promises.unlink(req.file.path).catch(() => {});
    return res.status(500).json({ message: '文件保存失败' });
  }
});

return router;

};
