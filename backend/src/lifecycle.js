const { createDatabase } = require('./models/db');

const createApplication = async (options = {}) => {
  // No dotenv here: only the executable entry point reads a production env file.
  const env = { ...(options.env || process.env) };
  if (!env.JWT_SECRET) throw new Error('JWT_SECRET is required');
  if (env.NODE_ENV === 'test' && (!options.paths?.data || !options.paths?.public || !options.paths?.backups)) {
    throw new Error('Tests require explicit data, public and backup paths');
  }
  const database = await createDatabase({ env, paths: options.paths });
  const timers = new Set();
  const jobs = new Set();
  const disposers = [];
  let closing;
  let server;
  let listening = false;
  let pendingListen;
  const context = {
    ...database, env, timers, disposers,
    externalServices: options.externalServices ?? env.NODE_ENV !== 'test',
    track(promise) {
      const tracked = Promise.resolve(promise);
      jobs.add(tracked);
      tracked.then(() => jobs.delete(tracked), () => jobs.delete(tracked));
      return tracked;
    },
    every(task, delay) {
      const timer = setInterval(() => context.track(Promise.resolve().then(task)).catch((error) => {
        console.error('[Background] task failed:', error.code || error.message);
      }), delay);
      timers.add(timer);
      return timer;
    }
  };
  const close = () => {
    if (!closing) closing = (async () => {
      for (const timer of timers) clearInterval(timer);
      timers.clear();
      if (pendingListen) await pendingListen.catch(() => {});
      if (server?.listening) {
        await new Promise((resolve, reject) => {
          server.close((error) => error ? reject(error) : resolve());
          server.closeIdleConnections();
        });
      }
      await Promise.allSettled([...jobs]);
      for (const dispose of disposers.reverse()) await dispose();
      await database.close();
    })();
    return closing;
  };
  try {
    for (const [key, filename] of [
      ['security', './models/security'], ['storage', './utils/storage'], ['images', './utils/imageUpload'], ['backup', './utils/backup'], ['bot', './utils/bot'],
      ['ban', './middlewares/ban'], ['auth', './middlewares/auth'], ['limiter', './middlewares/limiter'],
      ['upload', './middlewares/upload'], ['scheduler', './utils/backupScheduler']
    ]) context[key] = require(filename)(context);
    const { app, PORT } = require('./app').buildApp(context);
    const listen = (port = PORT, host) => {
      if (closing || listening) return Promise.reject(new Error('Application already listening or closed'));
      listening = true;
      pendingListen = new Promise((resolve, reject) => {
        server = app.listen(port, host);
        server.once('error', (error) => { listening = false; reject(error); });
        server.once('listening', () => {
          if (!closing && (options.backgroundTasks ?? env.NODE_ENV !== 'test')) {
            context.startLoginCleanup();
            context.startStagingCleanup();
            context.scheduler.startBackupScheduler();
          }
          resolve(server);
        });
        server.on('clientError', (error, socket) => socket.destroy());
      });
      return pendingListen;
    };
    return { app, context, listen, close };
  } catch (error) {
    await close();
    throw error;
  }
};
module.exports = { createApplication };
