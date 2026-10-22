const fs = require('node:fs');
const path = require('node:path');
const isInside = (root, candidate, allowRoot = false) => {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return (allowRoot || relative !== '') && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
};
const isSafePath = (root, candidate) => {
  if (!isInside(root, candidate)) return false;
  try {
    const realRoot = fs.realpathSync.native(root);
    let ancestor = path.resolve(candidate);
    while (true) {
      try { fs.lstatSync(ancestor); break; }
      catch (error) {
        if (error.code !== 'ENOENT') return false;
        const parent = path.dirname(ancestor);
        if (parent === ancestor) return false;
        ancestor = parent;
      }
    }
    return isInside(realRoot, fs.realpathSync.native(ancestor), true);
  } catch { return false; }
};
const positiveId = (value) => typeof value === 'string' && /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value));
module.exports = { isInside, isSafePath, positiveId };
