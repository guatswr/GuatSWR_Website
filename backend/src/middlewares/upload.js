module.exports = (context) => {
const multer = require('multer');
const path = require('path');
const { PRIVATE_UPLOADS_DIR } = context;
const { randomUUID } = require('node:crypto');

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml'
]);
const ALLOWED_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg']);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, PRIVATE_UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `img-${randomUUID()}${ext}`);
  }
});

const parser = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024, files: 1, fields: 8, parts: 10, fieldSize: 16 * 1024, fieldNameSize: 100 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_MIME_TYPES.has(file.mimetype) || !ALLOWED_EXTS.has(ext)) {
      return cb(new Error('不支持的文件类型'));
    }
    cb(null, true);
  }
});

let active = 0;
const upload = { single(field) {
  const parse = parser.single(field);
  return (req, res, next) => {
    if (active >= 8) return res.status(429).json({ message: '上传并发过多，请稍后再试' });
    active += 1;
    let released = false;
    const release = () => {
      if (released) return;
      released = true; active -= 1;
      res.removeListener('finish', release); res.removeListener('close', release); req.removeListener('aborted', release);
    };
    res.once('finish', release); res.once('close', release); req.once('aborted', release);
    parse(req, res, error => { if (error) release(); next(error); });
  };
} };
return { upload };

};
