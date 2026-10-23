module.exports = (context) => {
  const env = context.env;
const { execFile } = require('child_process');
const { db, addLog } = context;
const { FULL_BACKUP_SCRIPT } = context.backup;

const CHECK_INTERVAL_MS = 30 * 1000;
let timer = null;

const dbGet = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
});

const dbRun = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function(err) {
    if (err) return reject(err);
    resolve(this);
  });
});

const getSetting = async (key, fallback) => {
  const row = await dbGet('SELECT value FROM site_config WHERE key = ?', [key]);
  return row?.value ?? fallback;
};

const setSetting = async (key, value) => {
  await dbRun('INSERT OR REPLACE INTO site_config (key, value) VALUES (?, ?)', [key, value]);
};

const runScript = (scriptPath) => new Promise((resolve, reject) => {
  context.trackChild(execFile('/bin/bash', [scriptPath], { env: { ...env, DATA_DIR: context.DATA_DIR, PUBLIC_DIR: context.PUBLIC_DIR, BACKUP_ROOT: context.BACKUP_ROOT, DB_PATH: context.dbPath, LOG_DB_PATH: context.logDbPath }, detached: process.platform !== 'win32' }, (err, stdout, stderr) => {
    if (err) return reject(new Error(stderr || err.message));
    resolve(stdout);
  }), { processGroup: true });
});

const getLocalDate = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const value = (type) => parts.find(part => part.type === type).value;
  return `${value('year')}-${value('month')}-${value('day')}`;
};
const runAutoBackup = async (trigger = 'schedule') => {
  if (!context.externalServices) throw new Error('External services disabled');
  await runScript(FULL_BACKUP_SCRIPT);
  const today = getLocalDate();
  await setSetting('backup_last_run', today);
  await setSetting('backup_last_error', '');
  addLog('System', 'AUTO_BACKUP', `自动备份执行: ${trigger}`);
};

const checkAndRun = async () => {
  try {
    const enabled = String(await getSetting('backup_enabled', '0')) === '1';
    if (!enabled) return;
    const time = String(await getSetting('backup_time', '02:30'));
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return;
    const now = new Date();
    const [hh, mm] = time.split(':').map((v) => Number(v));
    const local = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
    const nowMinutes = Number(local.find(part => part.type === 'hour').value) * 60 + Number(local.find(part => part.type === 'minute').value);
    const scheduleMinutes = hh * 60 + mm;
    if (nowMinutes < scheduleMinutes) return;
    const today = getLocalDate(now);
    const lastRun = String(await getSetting('backup_last_run', ''));
    if (lastRun === today) return;
    await runAutoBackup('schedule');
  } catch (err) {
    context.logger.warn('backup.failed', { error: err });
    try {
      await setSetting('backup_last_error', err.message);
      addLog('System', 'AUTO_BACKUP_FAILED', err.message);
    } catch {
      // ignore
    }
  }
};

const startBackupScheduler = () => {
  if (timer) return;
  timer = context.every(checkAndRun, CHECK_INTERVAL_MS);
  context.track(checkAndRun);
};

return { startBackupScheduler, runAutoBackup };

};
