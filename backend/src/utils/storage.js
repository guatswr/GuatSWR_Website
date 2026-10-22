module.exports = (context) => {
const fs = require('fs');
const path = require('path');
const { PUBLIC_DIR, IMG_ROOT_DIR } = context;
const { isSafePath } = require('./storageBoundary');

const PUBLIC_DIR_RESOLVED = path.resolve(PUBLIC_DIR);

const ensureDir = async (dir) => {
  await fs.promises.mkdir(dir, { recursive: true });
};

const toUploadsUrl = (absPath) => {
  if (!isSafePath(PUBLIC_DIR_RESOLVED, absPath)) throw new Error('Unsafe storage path');
  const rel = path.relative(PUBLIC_DIR, absPath).split(path.sep).join('/');
  return `/uploads/${rel}`;
};

const resolveUploadsPath = (url) => {
  if (!url || typeof url !== 'string') return null;
  if (!url.startsWith('/uploads/')) return null;
  try {
    const rel = decodeURIComponent(url.slice('/uploads/'.length));
    if (!rel || rel.includes('\\') || /[\0?#]/.test(rel) || rel.split('/').some(part => part === '.' || part === '..')) return null;
    const abs = path.resolve(PUBLIC_DIR, rel);
    return isSafePath(PUBLIC_DIR_RESOLVED, abs) ? abs : null;
  } catch { return null; }
};

const isStagingUrl = (url) => typeof url === 'string' && url.startsWith('/uploads/upload/');

const moveFileSafe = async (src, dest) => {
  try {
    await fs.promises.rename(src, dest);
  } catch (err) {
    if (err.code === 'EXDEV') {
      await fs.promises.copyFile(src, dest);
      await fs.promises.unlink(src);
    } else {
      throw err;
    }
  }
};

const uniqueDestPath = (targetDir, filename) => {
  const ext = path.extname(filename);
  const base = path.basename(filename, ext);
  let candidate = path.join(targetDir, filename);
  if (!fs.existsSync(candidate)) return candidate;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  candidate = path.join(targetDir, `${base}-${suffix}${ext}`);
  return candidate;
};

const moveStagedFile = async (url, targetDir) => {
  if (!isStagingUrl(url)) return url;
  const srcPath = resolveUploadsPath(url);
  if (!srcPath) return url;
  if (!fs.existsSync(srcPath)) return url;

  if (!isSafePath(PUBLIC_DIR_RESOLVED, targetDir)) throw new Error('Unsafe storage path');
  await ensureDir(targetDir);
  if (!isSafePath(PUBLIC_DIR_RESOLVED, targetDir)) throw new Error('Unsafe storage path');
  const filename = path.basename(srcPath);
  const isThumb = filename.endsWith('-thumb.webp');
  const base = isThumb ? filename.replace(/-thumb\.webp$/i, '') : path.parse(filename).name;

  const findOriginalInStaging = () => {
    const exts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
    for (const ext of exts) {
      const p = path.join(path.dirname(srcPath), `${base}${ext}`);
      if (fs.existsSync(p)) return p;
    }
    return null;
  };

  let destPath = null;
  if (isThumb) {
    const origSrc = findOriginalInStaging();
    if (origSrc) {
      const origDest = uniqueDestPath(targetDir, path.basename(origSrc));
      await moveFileSafe(origSrc, origDest);
      destPath = origDest;
      const thumbDest = path.join(targetDir, `${path.parse(origDest).name}-thumb.webp`);
      await moveFileSafe(srcPath, thumbDest);
      return toUploadsUrl(thumbDest);
    }
  }

  destPath = uniqueDestPath(targetDir, filename);
  await moveFileSafe(srcPath, destPath);

  const thumbSrc = path.join(path.dirname(srcPath), `${base}-thumb.webp`);
  if (fs.existsSync(thumbSrc)) {
    const destBase = path.parse(destPath).name;
    const thumbDest = path.join(targetDir, `${destBase}-thumb.webp`);
    await moveFileSafe(thumbSrc, thumbDest);
  }

  return toUploadsUrl(destPath);
};

const moveStagedFiles = async (urls, targetDir) => {
  if (!Array.isArray(urls)) return urls;
  const results = [];
  for (const url of urls) {
    results.push(await moveStagedFile(url, targetDir));
  }
  return results;
};

const getHistoryDir = (dateStr) => {
  let year = 'unknown';
  let month = 'unknown';
  let day = 'unknown';
  if (dateStr) {
    const match = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      year = match[1];
      month = match[2];
      day = match[3];
    } else {
      const parsed = new Date(dateStr);
      if (!Number.isNaN(parsed.getTime())) {
        year = String(parsed.getFullYear());
        month = String(parsed.getMonth() + 1).padStart(2, '0');
        day = String(parsed.getDate()).padStart(2, '0');
      }
    }
  }
  return path.join(IMG_ROOT_DIR, 'History', year, month, day);
};

const deletePathSafe = async (absPath) => {
  if (!absPath) return;
  if (!isSafePath(PUBLIC_DIR_RESOLVED, absPath)) return;
  if (!fs.existsSync(absPath)) return;
  const stat = await fs.promises.lstat(absPath);
  if (stat.isDirectory()) {
    await fs.promises.rm(absPath, { recursive: true, force: true });
  } else {
    await fs.promises.unlink(absPath).catch(() => {});
  }
};

const deleteByUrl = async (url) => {
  const abs = resolveUploadsPath(url);
  if (!abs) return;
  await deletePathSafe(abs);
  const base = path.parse(abs).name;
  const thumb = path.join(path.dirname(abs), `${base}-thumb.webp`);
  await deletePathSafe(thumb);
};

const cleanupStaging = async (ttlMs) => {
  const stagingDir = path.join(PUBLIC_DIR, 'upload');
  if (!fs.existsSync(stagingDir)) return;
  const files = await fs.promises.readdir(stagingDir);
  const now = Date.now();
  await Promise.all(files.map(async (name) => {
    const abs = path.join(stagingDir, name);
    try {
      const stat = await fs.promises.stat(abs);
      if (now - stat.mtimeMs > ttlMs) {
        await deletePathSafe(abs);
      }
    } catch {
      // ignore
    }
  }));
  if (context.PRIVATE_UPLOADS_DIR) {
    for (const name of await fs.promises.readdir(context.PRIVATE_UPLOADS_DIR)) {
      const candidate = path.join(context.PRIVATE_UPLOADS_DIR, name);
      if (!isSafePath(context.PRIVATE_UPLOADS_DIR, candidate)) continue;
      const stat = await fs.promises.lstat(candidate);
      if (stat.isFile() && now - stat.mtimeMs > ttlMs) await fs.promises.unlink(candidate);
    }
  }
};

const moveStagedUrlsInText = async (text, targetDir) => {
  if (!text || typeof text !== 'string') return text;
  const urls = text.match(/\/uploads\/upload\/[^\s)"']+/g) || [];
  if (urls.length === 0) return text;
  let updated = text;
  for (const url of urls) {
    const newUrl = await moveStagedFile(url, targetDir);
    if (newUrl && newUrl !== url) {
      updated = updated.split(url).join(newUrl);
    }
  }
  return updated;
};

const getConfigDir = (key) => {
  const map = {
    home_bg: path.join(IMG_ROOT_DIR, 'bg', 'home'),
    join_bg: path.join(IMG_ROOT_DIR, 'bg', 'join'),
    badge_image: path.join(IMG_ROOT_DIR, 'assets', 'badge'),
    mascot_image: path.join(IMG_ROOT_DIR, 'assets', 'mascot'),
    qq_qr_image: path.join(IMG_ROOT_DIR, 'Join_QR')
  };
  return map[key] || path.join(IMG_ROOT_DIR, 'assets', 'misc');
};

return {
  moveStagedFile,
  moveStagedFiles,
  moveStagedUrlsInText,
  getHistoryDir,
  getConfigDir,
  isStagingUrl,
  deleteByUrl,
  cleanupStaging,
  deletePathSafe,
  resolveUploadsPath,
  toUploadsUrl
};

};
