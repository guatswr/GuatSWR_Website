import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineConfig } from 'vitest/config'
export default defineConfig({ cacheDir: join(tmpdir(), 'guatswr-backend-vitest'), test: {
  environment: 'node', include: ['tests/{unit,integration,contracts}/**/*.test.mjs'], maxWorkers: 1,
  testTimeout: 15000, hookTimeout: 15000, sequence: { concurrent: false },
} })
