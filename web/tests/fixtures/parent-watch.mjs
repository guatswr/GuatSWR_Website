/**
 * Exit a fixture server when the process that started it goes away.
 *
 * Playwright's `webServer` does not reliably reap these fixtures when a batch
 * ends, and a leftover listener on a fixture port makes the *next* batch's
 * `webServer` fail to start (`reuseExistingServer: false`), which surfaces as a
 * missing Playwright report rather than as a port conflict. The isolated E2E
 * runner starts a fresh fixture for every two tests, so one leak aborts a whole
 * suite run.
 *
 * The parent is polled rather than signalled, because the parent may be killed
 * outright. Call this only from a fixture's command-line entry point, so an
 * importing test never installs it. `unref()` keeps the timer from holding the
 * event loop open.
 */
export function exitWithParent(intervalMs = 2000) {
  const parentPid = process.ppid
  const watchdog = setInterval(() => {
    try {
      process.kill(parentPid, 0)
    }
    catch {
      process.exit(0)
    }
  }, intervalMs)
  watchdog.unref()
  return watchdog
}
