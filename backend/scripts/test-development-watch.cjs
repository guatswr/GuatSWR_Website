const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
(async () => {
  if (process.platform === 'win32') throw new Error('Run this process-group gate in the isolated Linux test image');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'guatswr-watch-'));
  const backend = path.resolve(__dirname, '..');
  const ready = [];
  let output = '';
  let pending = '';
  let child;
  try {
    const command = require('../package.json').scripts.dev;
    child = spawn('/bin/sh', ['-c', command], { cwd: backend, detached: true,
      env: { ...process.env, PATH: `${path.join(backend, 'node_modules/.bin')}:${process.env.PATH}`, NODE_ENV: 'development',
        JWT_SECRET: 'synthetic-development-key', BFF_BRIDGE_SECRET: 'synthetic-development-bridge-key-32-characters', PORT: '0', BIND_HOST: '127.0.0.1',
        DATA_DIR: path.join(root, 'data'), PUBLIC_DIR: path.join(root, 'public'), BACKUP_ROOT: path.join(root, 'backups') }, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', chunk => {
      output += chunk;
      pending += chunk;
      let newline;
      while ((newline = pending.indexOf('\n')) !== -1) {
        const line = pending.slice(0, newline);
        pending = pending.slice(newline + 1);
        try { const record = JSON.parse(line); if (record.event === 'application.ready') ready.push(record.port); } catch { /* CLI text */ }
      }
    });
    child.stderr.on('data', chunk => { output += chunk; });
    const wait = async count => {
      const deadline = Date.now() + 20000;
      while (ready.length < count) {
        if (child.exitCode !== null || Date.now() > deadline) throw new Error(`Development watch did not become ready: ${output.slice(-4000)}`);
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      assert.equal((await fetch(`http://127.0.0.1:${ready[count - 1]}/api/version`)).status, 200);
    };
    await wait(1);
    const now = new Date();
    await fs.utimes(path.join(backend, 'src/errors.ts'), now, now);
    await wait(2);
    console.log(JSON.stringify({ developmentStartup: true, typescriptChangeRestart: true, syntheticStateOnly: true }));
  } finally {
    if (child?.pid) {
      const exited = child.exitCode === null ? once(child, 'exit') : Promise.resolve();
      try { process.kill(-child.pid, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
      let deadline;
      await Promise.race([exited, new Promise(resolve => { deadline = setTimeout(resolve, 2000); })]);
      clearTimeout(deadline);
      try { process.kill(-child.pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
      await exited;
    }
    if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('guatswr-watch-')) throw new Error('Unsafe cleanup');
    await fs.rm(root, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
