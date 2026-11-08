import { defineConfig } from 'vitest/config'
const suite = process.env.PG_TEST_SUITE || 'all'
const core = ['tests/unit/**/*.test.mjs','tests/integration/**/*.test.mjs','tests/contracts/**/*.test.mjs','tests/postgres/lifecycle.test.mjs','tests/postgres/migration.test.mjs']
const includes = {
  all: [...core,'tests/postgres/release.test.mjs','tests/bff/**/*.test.mjs'], core,
  unit: ['tests/unit/**/*.test.mjs'], integration: ['tests/integration/**/*.test.mjs'],
  contracts: ['tests/contracts/**/*.test.mjs'], bootstrap: ['tests/postgres/lifecycle.test.mjs'],
  release: ['tests/postgres/release.test.mjs'], packaged:['tests/postgres/packaged.test.mjs'], bff: ['tests/bff/**/*.test.mjs'], ui: ['tests/ui/**/*.test.mjs'],
}
if (!includes[suite]) throw Error('UNKNOWN_TEST_SUITE')
export default defineConfig({ test: {
  environment:'node', include:includes[suite], maxWorkers:1,
  testTimeout:60000, hookTimeout:15000, sequence:{concurrent:false},
} })
