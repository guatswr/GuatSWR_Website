const { createDatabase, resolvePaths } = require('./models/db');
const path = require('node:path');

const createApplication = async (options = {}) => {
  // No dotenv here: only the executable entry point reads a production env file.
  const env = { ...(options.env || process.env) };
  if (env.NODE_ENV === 'test' && (!options.paths?.data || !options.paths?.public || !options.paths?.backups)) {
    throw new Error('Tests require explicit data, public and backup paths');
  }
  // Native CJS consumption of compiled strict TS; never require TypeScript source.
  const root = resolvePaths(env).BACKEND_ROOT;
  const { parseEnvironment } = require(path.join(root, 'dist/src/config/environment.js'));
  const configuration = parseEnvironment({ ...env,
    ...(options.paths?.data ? { DATA_DIR: options.paths.data } : {}),
    ...(options.paths?.public ? { PUBLIC_DIR: options.paths.public } : {}),
    ...(options.paths?.backups ? { BACKUP_ROOT: options.paths.backups } : {}),
  }, root);
  const { createDiagnosticLogger } = require(path.join(root, 'dist/src/diagnostics.js'));
  const logger = createDiagnosticLogger({ destination: options.logDestination, silent: configuration.nodeEnv === 'test' && !options.logDestination });
  const schemas = require('@guatswr/shared/backend-v1');
  const database = await createDatabase({ env, paths: configuration.paths, logger });
  const timers = new Set();
  const jobs = new Set();
  const children = new Set();
  const shutdown = new AbortController();
  const childGroups = new WeakSet();
  const stopChild = (child, signal) => {
    try {
      if (childGroups.has(child) && child.pid) process.kill(-child.pid, signal);
      else child.kill(signal);
    } catch (error) { if (error.code !== 'ESRCH') throw error; }
  };
  const disposers = [];
  let closing;
  let server;
  let listening = false;
  let pendingListen;
  const context = {
    ...database, env, configuration, logger, timers, disposers, shutdownSignal: shutdown.signal,
    schemas,
    isClosing: () => Boolean(closing),
    trackChild(child, options = {}) {
      children.add(child);
      if (options.processGroup && process.platform !== 'win32') childGroups.add(child);
      const remove = () => children.delete(child);
      child.once('exit', remove);
      child.once('error', remove);
      if (closing) stopChild(child, 'SIGTERM');
      return child;
    },
    externalServices: options.externalServices ?? env.NODE_ENV !== 'test',
    track(work) {
      return logger.task(() => {
        const started = performance.now();
        const tracked = typeof work === 'function' ? Promise.resolve().then(work) : Promise.resolve(work);
        jobs.add(tracked);
        logger.info('task.started');
        tracked.then(() => {
          jobs.delete(tracked);
          logger.info('task.completed', { durationMs: performance.now() - started });
        }, error => {
          jobs.delete(tracked);
          logger.error('task.failed', { error, durationMs: performance.now() - started });
        });
        return tracked;
      });
    },
    every(task, delay) {
      if (closing) throw new Error('Application is closing');
      const timer = setInterval(() => context.track(task).catch(() => {}), delay);
      timers.add(timer);
      return timer;
    }
  };
  const close = () => {
    if (!closing) {
      let deadline;
      const cleanup = (async () => {
      shutdown.abort();
      for (const timer of timers) clearInterval(timer);
      timers.clear();
      for (const child of children) stopChild(child, 'SIGTERM');
      if (pendingListen) await pendingListen.catch(() => {});
      if (server?.listening) {
        await new Promise((resolve, reject) => {
          server.close((error) => error ? reject(error) : resolve());
          server.closeIdleConnections();
        });
      }
      await Promise.allSettled([...jobs]);
      await Promise.allSettled([...children].map(child => new Promise(resolve => {
        child.once('exit', resolve);
        child.once('error', resolve);
      })));
      const results = await Promise.allSettled(disposers.reverse().map(dispose => Promise.resolve().then(dispose)));
      const databaseResult = await Promise.allSettled([database.close()]);
      const errors = [...results, ...databaseResult].filter(result => result.status === 'rejected').map(result => result.reason);
      if (errors.length) throw new AggregateError(errors, 'Application cleanup failed');
      })();
      const timeout = new Promise((resolve, reject) => {
        deadline = setTimeout(() => {
          server?.closeAllConnections();
          for (const child of children) stopChild(child, 'SIGKILL');
          const error = new Error('Application shutdown deadline exceeded');
          error.code = 'SHUTDOWN_TIMEOUT';
          reject(error);
        }, configuration.shutdownTimeoutMs);
      });
      closing = Promise.race([cleanup, timeout]).finally(() => clearTimeout(deadline));
    }
    return closing;
  };
  try {
    for (const [key, filename] of [
      ['security', './models/security'], ['storage', './utils/storage'], ['images', './utils/imageUpload'], ['backup', './utils/backup'], ['bot', './utils/bot'],
      ['ban', './middlewares/ban'], ['auth', './middlewares/auth'], ['guestGateway', './middlewares/guestGateway'], ['limiter', './middlewares/limiter'],
      ['upload', './middlewares/upload'], ['scheduler', './utils/backupScheduler']
    ]) context[key] = require(filename)(context);
    const { app } = require('./app').buildApp(context);
    const listen = (port = configuration.port, host = configuration.bindHost) => {
      if (closing || listening) return Promise.reject(new Error('Application already listening or closed'));
      listening = true;
      pendingListen = new Promise((resolve, reject) => {
        server = app.listen(port, host);
        server.once('error', (error) => { listening = false; reject(error); });
        server.once('listening', () => {
          try {
            if (!closing && (options.backgroundTasks ?? env.NODE_ENV !== 'test')) {
              context.startLoginCleanup();
              context.startStagingCleanup();
              context.scheduler.startBackupScheduler();
            }
            resolve(server);
          } catch (error) { reject(error); }
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
