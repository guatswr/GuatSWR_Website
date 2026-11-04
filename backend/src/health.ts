import { createReadinessProbe } from '@guatswr/shared'
import type { SqlExecutor } from './database/sqlite.js'

export function createBackendHealth(options: { main: SqlExecutor; audit: SqlExecutor; isClosing(): boolean }) {
  const probe = createReadinessProbe({
    service: 'guatswr-backend',
    checks: {
      mainDatabase: async () => { await options.main.get('SELECT EXISTS(SELECT 1 FROM site_config LIMIT 1) AS reachable') },
      auditDatabase: async () => { await options.audit.get('SELECT EXISTS(SELECT 1 FROM audit_logs LIMIT 1) AS reachable') },
    },
  })
  return {
    live: () => ({ status: options.isClosing() ? 'shutting_down' : 'ok', service: 'guatswr-backend' }),
    ready: () => options.isClosing()
      ? Promise.resolve({ status: 'not_ready', service: 'guatswr-backend', checks: { lifecycle: 'failed' } })
      : probe(),
  }
}
