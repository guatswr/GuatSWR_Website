// Also usable as a reviewed read-only bind mount in the b343784 bridge image.
// Install before importing the application so every independently opened SQLite
// connection is query-only, including best-effort audit writes from GET routes.
const sqlite = require('sqlite3');
const NativeDatabase = sqlite.Database;
let installed = false;
function installQueryOnly() {
  if (installed) return;
  installed = true;
  sqlite.Database = class QueryOnlyDatabase extends NativeDatabase {
    constructor(filename, mode, callback) {
      if (typeof mode === 'function') { callback = mode; mode = undefined; }
      super(filename, mode ?? sqlite.OPEN_READWRITE, function (error) {
        if (error) { callback?.call(this, error); return; }
        this.exec('PRAGMA query_only=ON', error => {
          if (error) this.close(() => callback?.call(this, error));
          else callback?.call(this, null);
        });
      });
    }
  };
}
async function createReadOnlyApplication(options) {
  installQueryOnly();
  const instance = await require('../dist/src/app.js').createApplication({ ...options, backgroundTasks: false, externalServices: false });
  const dispatch = instance.app.handle.bind(instance.app);
  instance.app.handle = (request, response, next) => {
    if (request.method === 'GET' || request.method === 'HEAD') return dispatch(request, response, next);
    response.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify({ message: '只读回退模式' }));
  };
  return instance;
}
if (require.main === module) {
  createReadOnlyApplication({ env: process.env }).then(async instance => {
    try {
      await instance.listen();
      const close = () => instance.close().catch(() => { process.exitCode = 1; });
      process.once('SIGTERM', close); process.once('SIGINT', close);
    } catch (error) { await instance.close(); throw error; }
  }).catch(() => { console.error('Read-only application failed; inspect configuration, schema and volume permissions.'); process.exitCode = 1; });
}
module.exports = { createReadOnlyApplication };
