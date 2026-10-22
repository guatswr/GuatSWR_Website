module.exports = (context) => {
  const fs = require('node:fs/promises');
  const path = require('node:path');
  const sharp = require('sharp');
  // libvips is process-wide. Never retain input file handles across requests.
  sharp.cache({ files: 0 });
  const { isSafePath } = require('./storageBoundary');
  const formats = new Map([['image/jpeg','jpeg'],['image/png','png'],['image/gif','gif'],['image/webp','webp'],['image/svg+xml','svg']]);
  const maxPixels = 40_000_000;
  const validateUploadedFile = async (file) => {
    try {
      if (!isSafePath(context.PRIVATE_UPLOADS_DIR, file.path)) return false;
      const options = { limitInputPixels: maxPixels, failOn: 'warning' };
      const meta = await sharp(file.path, options).metadata();
      if (meta.format !== formats.get(file.mimetype) || !meta.width || !meta.height || meta.width * meta.height * (meta.pages || 1) > maxPixels || (meta.pages || 1) > 200) return false;
      // Parse pixels before publication, including avatars which need no thumbnail.
      await sharp(file.path, options).resize({ width: 1, height: 1, fit: 'inside' }).raw().toBuffer();
      return true;
    } catch { return false; }
  };
  const moveVerifiedFile = async (source, destination) => {
    if (!isSafePath(context.PRIVATE_UPLOADS_DIR, source) || !isSafePath(context.PUBLIC_DIR, destination)) throw new Error('Unsafe storage path');
    try { await fs.rename(source, destination); }
    catch (error) {
      if (error.code !== 'EXDEV') throw error;
      await fs.copyFile(source, destination, require('node:fs').constants.COPYFILE_EXCL);
      try { await fs.unlink(source); }
      catch (unlinkError) { await fs.unlink(destination).catch(() => {}); throw unlinkError; }
    }
  };
  const publishStagingFile = async (file, thumbPath) => {
    const moved = [];
    try {
      for (const source of [file.path, thumbPath].filter(Boolean)) {
        const destination = path.join(context.UPLOADS_DIR, path.basename(source));
        await moveVerifiedFile(source, destination);
        moved.push(destination);
        await fs.chmod(destination, 0o644);
      }
      file.path = moved[0];
    } catch (error) {
      await Promise.all(moved.map(filename => fs.unlink(filename).catch(() => {})));
      throw error;
    }
  };
  return { validateUploadedFile, moveVerifiedFile, publishStagingFile, maxPixels };
};
