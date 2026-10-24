// Same synthetic workload for the bridge and candidate. Never use original data.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os');
const { performance, monitorEventLoopDelay } = require('node:perf_hooks');
const { execFile } = require('node:child_process');
const execute = require('node:util').promisify(execFile);
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==', 'base64');
const percentile = (values, percent) => [...values].sort((a, b) => a - b)[Math.max(0, Math.ceil(values.length * percent) - 1)];
async function sizes(root) {
  let bytes = 0, files = 0;
  for (const entry of await fs.readdir(root, { withFileTypes: true })) {
    const filename = path.join(root, entry.name);
    if (entry.isDirectory()) { const child = await sizes(filename); bytes += child.bytes; files += child.files; }
    else if (entry.isFile()) { bytes += (await fs.stat(filename)).size; files++; }
  }
  return { bytes, files };
}
(async () => {
  const output = process.argv[2];
  if (!output || !path.isAbsolute(output)) throw new Error('Explicit absolute metrics output required');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'guatswr-performance-'));
  const paths = { data: path.join(root, 'data'), public: path.join(root, 'public'), backups: path.join(root, 'backups') };
  const env = { NODE_ENV: 'test', JWT_SECRET: 'synthetic-performance-key', TRUST_PROXY_CIDRS: '127.0.0.1/32' };
  await require('./initialize-databases.cjs').initializeDatabases(env, paths);
  const cold = performance.now();
  const instance = await require('../dist/src/app.js').createApplication({ env, paths, backgroundTasks: false, externalServices: false });
  const server = await instance.listen(0, '127.0.0.1'), coldStartMs = performance.now() - cold;
  try {
    const sql = instance.context.sql.main;
    const password = require('bcryptjs').hashSync('synthetic-password', 10);
    await sql.transaction(async tx => {
      await tx.run('INSERT INTO users(id,username,password,role) VALUES(1,?,?,?)', ['performance-owner', password, 'super_admin']);
      for (let index = 0; index < 1000; index++) {
        await tx.run("INSERT INTO activities(title,tag,date,images,status) VALUES(?,?,?,'[]','published')", ['synthetic article ' + index, 'STG', '2026-01-01']);
        await tx.run("INSERT INTO members(name,role,tags) VALUES(?,'member','[]')", ['synthetic member ' + index]);
      }
      await tx.run("INSERT INTO events(id,type,title,status,content) VALUES(1,'STG','synthetic competition','published','{}')");
    });
    await fs.writeFile(path.join(paths.public, 'avatar.png'), png);
    const origin = `http://127.0.0.1:${server.address().port}`;
    const bearer = require('jsonwebtoken').sign({ id: 1, token_version: 0, user_token_version: 0 }, env.JWT_SECRET);
    let sequence = 0, failures = 0, rssPeak = process.memoryUsage().rss;
    const sampleMemory = setInterval(() => { rssPeak = Math.max(rssPeak, process.memoryUsage().rss); }, 10);
    const loop = monitorEventLoopDelay({ resolution: 10 }); loop.enable();
    const cpuStart = process.cpuUsage(), wallStart = performance.now();
    const call = async (route, options = {}) => {
      const response = await fetch(origin + route, { ...options, signal: AbortSignal.timeout(10000), headers: { authorization: 'Bearer ' + bearer, 'x-forwarded-for': '198.51.100.' + (++sequence % 5 + 1), ...options.headers } });
      const body = await response.arrayBuffer();
      if (response.status !== 200) { failures++; throw new Error('Synthetic workload HTTP ' + response.status); }
      return body;
    };
    const list = () => call('/api/activities?page=1&limit=20');
    const login = () => call('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'performance-owner', password: 'synthetic-password' }) });
    const signup = () => call('/api/event/1/signup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ common_id: 'synthetic pilot', qq: '12345', avatar: '/uploads/avatar.png' }) });
    const upload = () => { const body = new FormData(); body.set('file', new Blob([png], { type: 'image/png' }), 'synthetic.png'); return call('/api/upload', { method: 'POST', body }); };
    const measurements = {};
    async function measure(name, count, concurrency, work) {
      const times = [];
      for (let offset = 0; offset < count; offset += concurrency) {
        await Promise.all(Array.from({ length: Math.min(concurrency, count - offset) }, async () => { const start = performance.now(); await work(); times.push(performance.now() - start); }));
      }
      measurements[name] = { requests: count, concurrency, p50Ms: percentile(times, .5), p95Ms: percentile(times, .95), p99Ms: percentile(times, .99) };
    }
    try {
      await list(); await login(); await signup(); await upload();
      await measure('list', 60, 4, list);
      await measure('login', 30, 2, login);
      await measure('upload', 20, 2, upload);
      await measure('signup', 30, 4, signup);
      let backupSequence = 0;
      await measure('backupWithConcurrentReadsAndSignup', 3, 1, async () => {
        const scriptEnv = { ...process.env, DATA_DIR: paths.data, PUBLIC_DIR: paths.public, BACKUP_ROOT: paths.backups, BACKUP_DATE_TAG: '20500101_00000' + (++backupSequence), BACKUP_NODE_BIN: process.execPath };
        await Promise.all([execute('/bin/bash', [path.join(__dirname, 'backup_all.sh')], { env: scriptEnv }), list(), signup()]);
      });
      const rssRounds = [];
      for (let round = 0; round < 3; round++) {
        await Promise.all(Array.from({ length: 30 }, (_, index) => index % 2 ? list() : signup()));
        rssRounds.push(process.memoryUsage().rss);
      }
      const cpu = process.cpuUsage(cpuStart), wal = {};
      for (const name of ['guatswr_web_main.db', 'guatswr_web_logs.db']) wal[name] = await fs.stat(path.join(paths.data, name + '-wal')).then(value => value.size).catch(() => 0);
      const report = { label: process.env.CANDIDATE_LABEL || 'unspecified', node: process.version, platform: process.platform, schema: { main: instance.context.mainSchemaVersion, audit: instance.context.auditSchemaVersion }, seed: { activities: 1000, members: 1000 }, coldStartMs, warmup: 'one request per workload excluded', measurements, failures, wallMs: performance.now() - wallStart, cpuMs: { user: cpu.user / 1000, system: cpu.system / 1000 }, rssPeak, rssRounds, eventLoopDelayMs: { p50: loop.percentile(50) / 1e6, p95: loop.percentile(95) / 1e6, p99: loop.percentile(99) / 1e6 }, wal, disk: await sizes(root) };
      assert.equal(failures, 0);
      await fs.writeFile(output, JSON.stringify(report, null, 2));
      console.log(JSON.stringify({ completed: true, failures, workloads: Object.keys(measurements).length }));
    } finally { clearInterval(sampleMemory); loop.disable(); }
  } finally { await instance.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
