// Prepare only whitelisted source files; the caller invokes Docker separately.
const fs = require('node:fs');
const path = require('node:path');
const backend = path.resolve(__dirname, '..');
const root = path.resolve(backend, '..');
if (!process.argv[2]) throw new Error('Usage: node prepare-test-context.cjs <new-context-directory>');
const output = path.resolve(process.argv[2]);
if (fs.existsSync(output)) throw new Error('Context directory must not already exist');
fs.mkdirSync(path.join(output, 'backend'), { recursive: true });
const ignored = new Set(['node_modules','dist','.nuxt','.output','.cache','.data','test-results','playwright-report','.e2e-isolated','blob-report','.lighthouseci','coverage','__pycache__']);
const sourceOnly = source => {
  const name = path.basename(source);
  const relative = path.relative(root, source).split(path.sep).join('/');
  if (/^(?:backend\/(?:data|backups|uploads)|data|backups|uploads)(?:\/|$)/.test(relative)) return false;
  return !ignored.has(name) && !name.startsWith('.env') && !name.startsWith('.build-cjs-') && !name.endsWith('.pyc') && !name.endsWith('.tsbuildinfo') && !fs.lstatSync(source).isSymbolicLink();
};
for (const name of ['src','tests','docs','scripts','package.json','server.js','vitest.config.mjs','vitest.bff.config.mjs','tsconfig.json','tsconfig.build.json','eslint.config.mjs','legacy-javascript.json']) {
  fs.cpSync(path.join(backend,name),path.join(output,'backend',name),{recursive:true,filter:sourceOnly});
}
for (const name of ['package.json','pnpm-lock.yaml','pnpm-workspace.yaml','.npmrc','.node-version','.dockerignore','patches','packages/shared','web','scripts/revamp']) {
  fs.cpSync(path.join(root,name),path.join(output,name),{recursive:true,filter:sourceOnly});
}
const evidence=path.join(output,'docs/backend-modernization/evidence');
fs.mkdirSync(evidence,{recursive:true});
fs.copyFileSync(path.join(root,'docs/backend-modernization/evidence/baseline.json'),path.join(evidence,'baseline.json'));
fs.copyFileSync(path.join(backend,'tests/Dockerfile.bootstrap'),path.join(output,'Dockerfile'));
console.log(output);
