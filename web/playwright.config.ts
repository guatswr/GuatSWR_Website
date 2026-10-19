import { defineConfig, devices } from '@playwright/test'

/**
 * The fixture/app ports are derived from one base so that parallel workers on
 * the same machine never collide. The defaults reproduce the original fixed
 * ports exactly (3100 / 3181 / 5174), with the authentication fixture on 3182.
 */
const portBase = Number(process.env.E2E_PORT_BASE ?? 3100)
const appPort = portBase
const upstreamPort = portBase + 81
const authPort = portBase + 82
const legacyPort = portBase + 2074
const origin = (port: number) => `http://127.0.0.1:${port}`

/**
 * Fixture-only session secret for the isolated test servers. It protects
 * nothing: the servers it seals cookies for exist only inside this test run and
 * are bound to loopback. Production sets its own through the environment, and
 * the BFF fails closed on a missing or short secret.
 */
const fixtureSessionPassword =
  process.env.NUXT_SESSION_PASSWORD ?? 'guatswr-e2e-fixture-session-secret-not-a-credential'

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
      // The archived app's reads and uploads, served to the archive pages.
      command: 'node tests/fixtures/upstream.mjs',
      url: `${origin(upstreamPort)}/health`,
      reuseExistingServer: false,
      env: { PORT: String(upstreamPort) },
    },
    {
      // The frozen backend's auth endpoints. It delegates every non-auth path to
      // the public-data fixture, so the app can use it as its only upstream.
      command: 'node tests/fixtures/auth-upstream.mjs',
      url: `${origin(authPort)}/health`,
      reuseExistingServer: false,
      env: { PORT: String(authPort) },
    },
    {
      command: 'node .output/server/index.mjs',
      url: `${origin(appPort)}/api/health`,
      reuseExistingServer: false,
      env: {
        PORT: String(appPort),
        HOST: '127.0.0.1',
        NUXT_API_BASE: origin(authPort),
        NUXT_BFF_AUTH_ALLOWED_ORIGINS: JSON.stringify([origin(appPort)]),
        NUXT_SESSION_PASSWORD: fixtureSessionPassword,
      },
    },
  ],
})
