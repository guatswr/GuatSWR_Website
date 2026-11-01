import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

/**
 * Nuxt resolves `~` to `web/app` and `#shared` to `web/shared`; plain Vitest
 * does not, so a module under test that imports either cannot load. The
 * aliases keep unit tests able to exercise those modules directly instead of
 * forcing every module to use relative paths that then break the Nitro bundle.
 */
export default defineConfig({
  resolve: {
    alias: {
      '#shared': fileURLToPath(new URL('./shared', import.meta.url)),
      '~': fileURLToPath(new URL('./app', import.meta.url)),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    // Keep hosted runners and CPU-limited Docker builds from oversubscribing
    // workers, which can starve otherwise synchronous security assertions.
    maxWorkers: process.env.CI ? 2 : undefined,
  },
})
