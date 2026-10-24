import { defineConfig } from 'vitest/config'
export default defineConfig({ test: { environment:'node', include:['tests/bff/**/*.test.mjs'], maxWorkers:1,testTimeout:60000,hookTimeout:15000 } })
