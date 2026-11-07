import { defineConfig } from 'vitest/config'
export default defineConfig({ test: {
  environment: 'node', include: ['tests/contracts/*.test.mjs', 'tests/postgres/**/*.test.mjs', 'tests/bff/*.test.mjs',
    'tests/integration/{activities-module,members-module,history-module,logs-module,config-module,admin-module,events-module,event-state,event-content-policy,event-submission-idempotency,signup,signup-transactions,article-revisions,published-revision-log,bot-platform,bot-openapi,bot-on-this-day,bot-secret-vault,member-sync,member-native-binding,auth-security,security-revocation,asset-publication,asset-cleanup,asset-inventory,asset-shadow-index,ban-cache,ban-expiry,health}.test.mjs'], maxWorkers: 1,
  testTimeout: 60000, hookTimeout: 15000, sequence: { concurrent: false },
} })
