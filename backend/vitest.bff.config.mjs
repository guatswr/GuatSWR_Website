import { defineConfig } from 'vitest/config'
export default defineConfig({ test: { environment:'node', include:['tests/bff/**/*.test.mjs'], maxWorkers:1,testTimeout:30000,hookTimeout:15000 } })
