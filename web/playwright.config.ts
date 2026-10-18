import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:3100', trace: 'retain-on-failure',
    launchOptions: { args: ['--disable-lcd-text', '--font-render-hinting=none'] },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    {
      command: 'node tests/fixtures/legacy.mjs',
      url: 'http://127.0.0.1:5174/social',
      reuseExistingServer: false,
    },
    {
      command: 'node tests/fixtures/upstream.mjs',
      url: 'http://127.0.0.1:3181/health',
      reuseExistingServer: false,
    },
    {
      command: 'node .output/server/index.mjs',
      url: 'http://127.0.0.1:3100/api/health',
      reuseExistingServer: false,
      env: { PORT: '3100', HOST: '127.0.0.1', NUXT_API_BASE: 'http://127.0.0.1:3181' },
    },
  ],
})
