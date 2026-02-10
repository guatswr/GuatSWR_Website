const { execFile } = require('child_process');
const { db, addLog } = require('../models/db');
const { FULL_BACKUP_SCRIPT } = require('./backup');

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
  execFile('/bin/bash', [scriptPath], { env: process.env }, (err, stdout, stderr) => {
    if (err) return reject(new Error(stderr || err.message));
    resolve(stdout);
  });
});

const getLocalDate = (date = new Date()) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const runAutoBackup = async (trigger = 'schedule') => {
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
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const scheduleMinutes = hh * 60 + mm;
    if (nowMinutes < scheduleMinutes) return;
    const today = getLocalDate(now);
    const lastRun = String(await getSetting('backup_last_run', ''));
    if (lastRun === today) return;
    await runAutoBackup('schedule');
  } catch (err) {
    console.warn('[Backup] 自动备份失败:', err.message);
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
  timer = setInterval(checkAndRun, CHECK_INTERVAL_MS);
  checkAndRun();
};

module.exports = { startBackupScheduler, runAutoBackup };
