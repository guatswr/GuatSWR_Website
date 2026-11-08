// Offline historical fixtures only. Never imported by the production server.
const fs = require('node:fs/promises');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
async function initializeDatabases(_env = {}, paths) {
  await fs.mkdir(paths.data, { recursive: true });
  const { migrateDatabase } = require('./engine.ts');
  for (const [kind, name] of [['main', 'guatswr_web_main.db'], ['audit', 'guatswr_web_logs.db']]) {
    const db = new DatabaseSync(path.join(paths.data, name));
    const connection = {
      all(sql, params, cb) { try { cb(null, db.prepare(sql).all(...params)); } catch (error) { cb(error); } },
      run(sql, params, cb) { try { db.prepare(sql).run(...params); cb(null); } catch (error) { cb(error); } },
      exec(sql, cb) { try { db.exec(sql); cb(null); } catch (error) { cb(error); } },
    };
    try { await migrateDatabase(connection, __dirname, kind, { mode: 'initialize' }); }
    finally { db.close(); }
  }
}
module.exports = { initializeDatabases };
