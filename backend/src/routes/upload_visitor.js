const express = require('express');
const fs = require('fs');
const path = require('path');
const { upload } = require('../middlewares/upload');
const sharp = require('sharp');
const { uploadLimiter } = require('../middlewares/limiter');
const { db, IMG_ROOT_DIR } = require('../models/db'); // 引入 IMG_ROOT_DIR

const router = express.Router();

// 定义事件图片存储根目录: backend/data/public/img/events
const EVENT_IMG_ROOT = path.join(IMG_ROOT_DIR, 'events');

// 确保根目录存在
if (!fs.existsSync(EVENT_IMG_ROOT)) {
  fs.mkdirSync(EVENT_IMG_ROOT, { recursive: true });
}

// 基础文件校验
const isMagicValid = (buffer, mimetype) => {
  if (!buffer || buffer.length < 4) return false;
  const sig = buffer;
  if (mimetype === 'image/jpeg') return sig[0] === 0xff && sig[1] === 0xd8 && sig[2] === 0xff;
  if (mimetype === 'image/png') return sig.slice(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]));
  if (mimetype === 'image/gif') return sig.slice(0, 6).toString('ascii') === 'GIF87a' || sig.slice(0, 6).toString('ascii') === 'GIF89a';
  if (mimetype === 'image/webp') return sig.slice(0, 4).toString('ascii') === 'RIFF' && sig.slice(8, 12).toString('ascii') === 'WEBP';
  if (mimetype === 'image/svg+xml') return sig.toString('utf8').toLowerCase().includes('<svg');
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

/**
 * 校验 EID 是否允许上传
 * 规则：EID 必须存在，且状态必须是 'draft' 或 'pending'
 */
const checkEidAllowed = (eid) => {
  return new Promise((resolve, reject) => {
    if (!eid || isNaN(eid)) return resolve({ allowed: false, msg: 'Invalid EID' });
    
    db.get("SELECT id, status FROM events WHERE id = ?", [eid], (err, row) => {
      if (err) return reject(err);
      if (!row) return resolve({ allowed: false, msg: 'Event not found' });
      
      const allowedStatus = ['draft', 'pending'];
      if (!allowedStatus.includes(row.status)) {
        return resolve({ allowed: false, msg: `Event status is '${row.status}', upload not allowed` });
      }
      
      resolve({ allowed: true });
    });
  });
};

router.post('/', uploadLimiter, upload.single('file'), async (req, res) => {
  // 清理函数
  const cleanup = async (thumbPath) => {
    if (req.file && fs.existsSync(req.file.path)) await fs.promises.unlink(req.file.path).catch(() => {});
    if (thumbPath && fs.existsSync(thumbPath)) await fs.promises.unlink(thumbPath).catch(() => {});
  };

  if (!req.file) return res.status(400).json({ message: '文件上传失败' });

  const eid = req.body.eid || req.query.eid;
  if (!eid) {
    await cleanup();
    return res.status(400).json({ message: '缺少 Event ID' });
  }

  let thumbPathTmp = null;

  try {
    // 1. 状态校验
    const check = await checkEidAllowed(eid);
    if (!check.allowed) {
      await cleanup();
      return res.status(403).json({ message: check.msg || '禁止上传' });
    }

    // 2. 文件内容校验
    const ok = await validateUploadedFile(req.file);
    if (!ok) {
      await cleanup();
      return res.status(400).json({ message: '不支持的文件内容' });
    }

    // 3. 生成临时缩略图
    if (req.file.mimetype !== 'image/svg+xml') {
      const parsed = path.parse(req.file.filename);
      const thumbName = `${parsed.name}-thumb.webp`;
      thumbPathTmp = path.join(path.dirname(req.file.path), thumbName);
      
      await sharp(req.file.path)
        .resize({ width: 640, height: 640, fit: 'inside' })
        .webp({ quality: 75 })
        .toFile(thumbPathTmp);
    }

    // 4. 存入目录: backend/data/public/img/events/{eid}
    const eventDir = path.join(EVENT_IMG_ROOT, String(eid));
    if (!fs.existsSync(eventDir)) {
      await fs.promises.mkdir(eventDir, { recursive: true });
    }

    const finalFileName = req.file.filename;
    const finalFilePath = path.join(eventDir, finalFileName);
    await fs.promises.rename(req.file.path, finalFilePath);
    await fs.promises.chmod(finalFilePath, 0o644);

    let finalThumbName = null;
    if (thumbPathTmp && fs.existsSync(thumbPathTmp)) {
      finalThumbName = path.basename(thumbPathTmp);
      const finalThumbPath = path.join(eventDir, finalThumbName);
      await fs.promises.rename(thumbPathTmp, finalThumbPath);
      await fs.promises.chmod(finalThumbPath, 0o644);
    }

    // 5. 生成 URL
    // 假设 backend/data/public 被 express.static 映射为 /uploads
    // 且 IMG_ROOT_DIR 是 data/public/img
    // 那么文件的 URL 路径应该是 /uploads/img/events/{eid}/{filename}
    const publicUrlBase = `/uploads/img/events/${eid}`;
    
    res.json({
      message: 'Upload success',
      eid: eid,
      url: `${publicUrlBase}/${finalFileName}`,
      thumbUrl: finalThumbName ? `${publicUrlBase}/${finalThumbName}` : null
    });

  } catch (err) {
    console.error('Visitor upload error:', err);
    await cleanup(thumbPathTmp);
    return res.status(500).json({ message: '服务器内部错误' });
  }
});

// 访客头像上传 (报名头像)
router.post('/avatar', uploadLimiter, upload.single('file'), async (req, res) => {
  const cleanup = async () => {
    if (req.file && fs.existsSync(req.file.path)) await fs.promises.unlink(req.file.path).catch(() => {});
  };

  if (!req.file) return res.status(400).json({ message: '文件上传失败' });

  const eid = req.body.eid || req.query.eid;
  if (!eid) {
    await cleanup();
    return res.status(400).json({ message: '缺少 Event ID' });
  }

  try {
    const eventRow = await new Promise((resolve, reject) => {
      db.get('SELECT id, status FROM events WHERE id = ?', [eid], (err, row) => {
        if (err) return reject(err);
        resolve(row || null);
      });
    });

    if (!eventRow) {
      await cleanup();
      return res.status(404).json({ message: 'Event not found' });
    }

    if (!['published', 'ongoing', 'ended', 'settled'].includes(eventRow.status)) {
      await cleanup();
      return res.status(403).json({ message: '当前状态不允许上传头像' });
    }

    const ok = await validateUploadedFile(req.file);
    if (!ok) {
      await cleanup();
      return res.status(400).json({ message: '不支持的文件内容' });
    }

    const avatarDir = path.join(EVENT_IMG_ROOT, String(eid), 'avatars');
    if (!fs.existsSync(avatarDir)) {
      await fs.promises.mkdir(avatarDir, { recursive: true });
    }

    const finalFileName = req.file.filename;
    const finalFilePath = path.join(avatarDir, finalFileName);
    await fs.promises.rename(req.file.path, finalFilePath);
    await fs.promises.chmod(finalFilePath, 0o644);

    const publicUrlBase = `/uploads/img/events/${eid}/avatars`;
    res.json({
      message: 'Upload success',
      eid,
      url: `${publicUrlBase}/${finalFileName}`
    });
  } catch (err) {
    console.error('Visitor avatar upload error:', err);
    await cleanup();
    res.status(500).json({ message: '服务器内部错误' });
  }
});

module.exports = router;