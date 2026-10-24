import fs from 'node:fs'
import path from 'node:path'
import { isSafePath } from '../utils/storage-boundary.js'
export function createFileStorage(context: { PUBLIC_DIR: string; IMG_ROOT_DIR: string; PRIVATE_UPLOADS_DIR?: string }) {
const { PUBLIC_DIR, IMG_ROOT_DIR } = context;

const PUBLIC_DIR_RESOLVED = path.resolve(PUBLIC_DIR);

const ensureDir = async (dir: string) => {
  await fs.promises.mkdir(dir, { recursive: true });
};

const toUploadsUrl = (absPath: string) => {
  if (!isSafePath(PUBLIC_DIR_RESOLVED, absPath)) throw new Error('Unsafe storage path');
  const rel = path.relative(PUBLIC_DIR, absPath).split(path.sep).join('/');
  return `/uploads/${rel}`;
};

const resolveUploadsPath = (url: unknown): string | null => {
  if (!url || typeof url !== 'string') return null;
  if (!url.startsWith('/uploads/')) return null;
  try {
    const rel = decodeURIComponent(url.slice('/uploads/'.length));
    if (!rel || rel.includes('\\') || /[\0?#]/.test(rel) || rel.split('/').some(part => part === '.' || part === '..')) return null;
    const abs = path.resolve(PUBLIC_DIR, rel);
    return isSafePath(PUBLIC_DIR_RESOLVED, abs) ? abs : null;
  } catch { return null; }
};

const isStagingUrl = (url: unknown): url is string => typeof url === 'string' && url.startsWith('/uploads/upload/');

const moveFileSafe = async (src: string, dest: string) => {
  try {
    await fs.promises.rename(src, dest);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EXDEV') {
      await fs.promises.copyFile(src, dest);
      await fs.promises.unlink(src);
    } else {
      throw err;
    }
  }
};

const uniqueDestPath = (targetDir: string, filename: string, reserveThumb = false) => {
  const ext = path.extname(filename);
  const base = path.basename(filename, ext);
  let candidate = path.join(targetDir, filename);
  const thumb = path.join(targetDir, `${base}-thumb.webp`);
  if (!fs.existsSync(candidate) && !(reserveThumb && fs.existsSync(thumb))) return candidate;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  candidate = path.join(targetDir, `${base}-${suffix}${ext}`);
  return candidate;
};

const moveCacheKey = (filename: string) => process.platform === 'win32' ? path.resolve(filename).toLowerCase() : path.resolve(filename);
const moveStagedFile = async <T>(url: T, targetDir: string, movedUrls?: Map<string, string>): Promise<T | string> => {
  if (!isStagingUrl(url)) return url;
  const srcPath = resolveUploadsPath(url);
  if (!srcPath) return url;
  const cached = movedUrls?.get(moveCacheKey(srcPath));
  if (cached) return cached;
  if (!fs.existsSync(srcPath)) return url;
  const remember = (source: string, destination: string) => movedUrls?.set(moveCacheKey(source), toUploadsUrl(destination));

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

  if (isThumb) {
    const origSrc = findOriginalInStaging();
    if (origSrc) {
      const origDest = uniqueDestPath(targetDir, path.basename(origSrc), true);
      await moveFileSafe(origSrc, origDest);
      remember(origSrc, origDest);
      const thumbDest = path.join(targetDir, `${path.parse(origDest).name}-thumb.webp`);
      await moveFileSafe(srcPath, thumbDest);
      remember(srcPath, thumbDest);
      return toUploadsUrl(thumbDest);
    }
  }

  const destPath = uniqueDestPath(targetDir, filename, !isThumb);
  await moveFileSafe(srcPath, destPath);
  remember(srcPath, destPath);

  const thumbSrc = path.join(path.dirname(srcPath), `${base}-thumb.webp`);
  if (fs.existsSync(thumbSrc)) {
    const destBase = path.parse(destPath).name;
    const thumbDest = path.join(targetDir, `${destBase}-thumb.webp`);
    await moveFileSafe(thumbSrc, thumbDest);
    remember(thumbSrc, thumbDest);
  }

  return toUploadsUrl(destPath);
};

const moveStagedFiles = async (urls: string[], targetDir: string, movedUrls?: Map<string, string>): Promise<string[]> => {
  if (!Array.isArray(urls)) return urls;
  const results = [];
  for (const url of urls) {
    results.push(await moveStagedFile(url, targetDir, movedUrls));
  }
  return results;
};

const getHistoryDir = (dateStr?: string | null) => {
  let year = 'unknown';
  let month = 'unknown';
  let day = 'unknown';
  if (dateStr) {
    const match = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match && match[1] !== undefined && match[2] !== undefined && match[3] !== undefined) {
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

const deletePathSafe = async (absPath: string | null | undefined) => {
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

const deleteByUrl = async (url: unknown) => {
  const abs = resolveUploadsPath(url);
  if (!abs) return;
  await deletePathSafe(abs);
  const base = path.parse(abs).name;
  const thumb = path.join(path.dirname(abs), `${base}-thumb.webp`);
  await deletePathSafe(thumb);
};

const cleanupStaging = async (ttlMs: number) => {
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

const moveStagedUrlsInText = async <T>(text: T, targetDir: string, movedUrls?: Map<string, string>): Promise<T | string> => {
  if (!text || typeof text !== 'string') return text;
  const urls = text.match(/\/uploads\/upload\/[^\s)"']+/g) || [];
  if (urls.length === 0) return text;
  let updated: string = text;
  for (const url of urls) {
    const newUrl = await moveStagedFile(url, targetDir, movedUrls);
    if (newUrl && newUrl !== url) {
      updated = updated.split(url).join(newUrl);
    }
  }
  return updated;
};

const getConfigDir = (key: string) => {
  const map: Record<string, string> = {
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
