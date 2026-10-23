// Linux production-image check; all writable state is synthetic and temporary.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');

async function scenario(blocked) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'guatswr-signal-'));
  let child;
  let watchdog;
  try {
    await require('./initialize-databases.cjs').initializeDatabases({}, { data: path.join(root, 'data') });
    const script = blocked
      ? "require('./dist/server').start().then(i => { i.context.track(new Promise(() => {})); setInterval(() => {}, 1000); })"
      : "require('./dist/server').start()";
    child = spawn(process.execPath, ['-e', script], { cwd: path.resolve(__dirname, '..'),
      env: { ...process.env, NODE_ENV: 'production', JWT_SECRET: 'synthetic-signal-test', BFF_BRIDGE_SECRET: 'synthetic-signal-bridge-key-32-characters',
        DATA_DIR: path.join(root, 'data'), PUBLIC_DIR: path.join(root, 'public'), BACKUP_ROOT: path.join(root, 'backups'),
        PORT: '0', BIND_HOST: '127.0.0.1', SHUTDOWN_TIMEOUT_MS: '200' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    let errors = '';
    child.stderr.on('data', chunk => { errors += chunk; });
    const exited = once(child, 'exit');
    const port = await new Promise((resolve, reject) => {
      watchdog = setTimeout(() => reject(new Error('Signal child startup timeout')), 10000);
      child.once('error', reject);
      child.once('exit', () => reject(new Error(`Child exited before ready: ${errors}`)));
      child.stdout.on('data', chunk => {
        output += chunk;
        for (const line of output.split('\n')) {
          try {
            const record = JSON.parse(line);
            if (record.event === 'application.ready' && Number.isInteger(record.port)) { clearTimeout(watchdog); resolve(record.port); }
          } catch { /* A partial JSON line is completed by the next chunk. */ }
        }
      });
    });
    assert.equal((await fetch(`http://127.0.0.1:${port}/api/version`)).status, 200);
    child.kill('SIGTERM');
    const result = await Promise.race([exited, new Promise((resolve, reject) => {
      watchdog = setTimeout(() => reject(new Error('Signal child exit timeout')), 5000);
    })]);
    clearTimeout(watchdog);
    assert.equal(result[0], blocked ? 1 : 0, errors);
    assert.equal(result[1], null);
    if (blocked) assert.match(output + errors, /SHUTDOWN_TIMEOUT/);
    const sqlite = require('sqlite3');
    for (const filename of ['guatswr_web_main.db', 'guatswr_web_logs.db']) {
      const db = await new Promise((resolve, reject) => {
        const connection = new sqlite.Database(path.join(root, 'data', filename), error => error ? reject(error) : resolve(connection));
      });
      try {
        const row = await new Promise((resolve, reject) => db.get('PRAGMA integrity_check', (error, value) => error ? reject(error) : resolve(value)));
        assert.equal(row.integrity_check, 'ok');
      } finally { await new Promise((resolve, reject) => db.close(error => error ? reject(error) : resolve())); }
    }
  } finally {
    clearTimeout(watchdog);
    if (child && child.exitCode === null && child.signalCode === null) {
      const stopped = once(child, 'exit');
      child.kill('SIGKILL');
      await stopped;
    }
    if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('guatswr-signal-')) throw new Error('Unsafe cleanup');
    await fs.rm(root, { recursive: true, force: true });
  }
}
(async () => {
  if (process.platform === 'win32') throw new Error('This gate requires POSIX signals; run in the Linux production image');
  await scenario(false);
  await scenario(true);
  console.log(JSON.stringify({ gracefulSigterm: true, deadlineExit: true, dualDatabaseIntegrity: true }));
})().catch(error => { console.error(error); process.exitCode = 1; });
