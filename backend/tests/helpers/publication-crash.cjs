const fs = require('node:fs/promises');
const path = require('node:path');
const [data, publicRoot, backups, phase] = process.argv.slice(2);
(async () => {
  const app = await require('../../src/app').createApplication({ env: { NODE_ENV: 'test', JWT_SECRET: 'synthetic-publication-crash' },
    paths: { data, public: publicRoot, backups }, backgroundTasks: false, externalServices: false });
  if (phase === 'committed') {
    const unlink = fs.unlink;
    fs.unlink = filename => {
      if (path.dirname(filename) === path.join(data, 'asset-publications') && filename.endsWith('.json')) {
        process.stdout.write('COMMITTED'); setInterval(() => {}, 1000); return new Promise(() => {});
      }
      return unlink(filename);
    };
  }
  await app.context.storage.publication.publish(['/uploads/upload/crash.png'], async () => {
    const value = await app.context.storage.moveStagedFile('/uploads/upload/crash.png', app.context.storage.getConfigDir('home_bg'));
    if (phase === 'prepared') { process.stdout.write('PREPARED'); setInterval(() => {}, 1000); await new Promise(() => {}); }
    return value;
  }, (value, tx) => tx.run("INSERT OR REPLACE INTO site_config(key,value) VALUES('home_bg',?)", [value]));
})().catch(() => { process.stderr.write('PUBLICATION_CRASH_FIXTURE_FAILED'); process.exitCode = 1; });
