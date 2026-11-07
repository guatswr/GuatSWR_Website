import { defineConfig } from 'vitest/config'
export default defineConfig({ test: {
  environment: 'node', include: ['tests/database/**/*.test.mjs'], maxWorkers: 1,
  testTimeout: 15000, hookTimeout: 15000, sequence: { concurrent: false },
} })
