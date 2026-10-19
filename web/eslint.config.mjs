import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt({
  // The isolated E2E runner writes Playwright reports and trace-viewer bundles
  // here; they are generated artifacts, not source.
  ignores: ['.output/**', 'test-results/**', 'playwright-report/**', '.e2e-isolated/**'],
})
