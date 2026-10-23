// Prepare only whitelisted source files; the caller invokes Docker separately.
const fs = require('node:fs');
const path = require('node:path');
const backend = path.resolve(__dirname, '..');
const root = path.resolve(backend, '..');
if (!process.argv[2]) throw new Error('Usage: node prepare-test-context.cjs <new-context-directory>');
const output = path.resolve(process.argv[2]);
if (fs.existsSync(output)) throw new Error('Context directory must not already exist');
fs.mkdirSync(path.join(output, 'backend'), { recursive: true });
for (const name of ['src','tests','docs','scripts','package.json','package-lock.json','server.js','vitest.config.mjs','vitest.bff.config.mjs','tsconfig.json','tsconfig.build.json','eslint.config.mjs','legacy-javascript.json']) {
  fs.cpSync(path.join(backend,name),path.join(output,'backend',name),{recursive:true,filter:source=>path.basename(source)!=='__pycache__'&&!source.endsWith('.pyc')});
}
const evidence=path.join(output,'docs/backend-modernization/evidence');
fs.mkdirSync(evidence,{recursive:true});
fs.copyFileSync(path.join(root,'docs/backend-modernization/evidence/baseline.json'),path.join(evidence,'baseline.json'));
fs.copyFileSync(path.join(backend,'tests/Dockerfile.bootstrap'),path.join(output,'Dockerfile'));
console.log(output);
