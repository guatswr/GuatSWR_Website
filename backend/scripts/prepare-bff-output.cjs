// Copy a built Nitro runtime without workspace junction/symlink dependencies.
const fs = require('node:fs');
const path = require('node:path');
const source = path.resolve(process.argv[2] || 'web/.output');
if (!process.argv[3]) throw new Error('Explicit new runtime output directory required');
const target = path.resolve(process.argv[3]);
const relative = path.relative(source, target);
if (fs.existsSync(target) || !fs.existsSync(path.join(source, 'server/index.mjs')) || !relative || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))) throw new Error('Invalid runtime copy destination');
fs.cpSync(source, target, { recursive: true, dereference: true, errorOnExist: true, force: false });
console.log('Standalone BFF runtime copied; no dependencies installed.');
