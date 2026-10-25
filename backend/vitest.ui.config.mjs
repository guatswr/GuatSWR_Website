import { defineConfig } from 'vitest/config'
export default defineConfig({test:{environment:'node',include:['tests/ui/**/*.test.mjs'],maxWorkers:1,testTimeout:60000,hookTimeout:15000}})
