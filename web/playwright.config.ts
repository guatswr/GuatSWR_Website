import { defineConfig, devices } from '@playwright/test'

/**
 * The three fixture/app ports are derived from one base so that parallel
 * workers on the same machine never collide. The defaults reproduce the
 * original fixed ports exactly (3100 / 3181 / 5174).
 */
const portBase = Number(process.env.E2E_PORT_BASE ?? 3100)
const appPort = portBase
const upstreamPort = portBase + 81
const legacyPort = portBase + 2074
const origin = (port: number) => `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: origin(appPort), trace: 'retain-on-failure',
    launchOptions: { args: ['--disable-lcd-text', '--font-render-hinting=none'] },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    {
      command: 'node tests/fixtures/legacy.mjs',
      url: `${origin(legacyPort)}/social`,
      reuseExistingServer: false,
      env: { PORT: String(legacyPort) },
    },
    {
      command: 'node tests/fixtures/upstream.mjs',
      url: `${origin(upstreamPort)}/health`,
      reuseExistingServer: false,
      env: { PORT: String(upstreamPort) },
    },
    {
      command: 'node .output/server/index.mjs',
      url: `${origin(appPort)}/api/health`,
      reuseExistingServer: false,
      env: { PORT: String(appPort), HOST: '127.0.0.1', NUXT_API_BASE: origin(upstreamPort) },
    },
  ],
})
