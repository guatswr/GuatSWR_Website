import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt({ ignores: ['.output/**', 'test-results/**', 'playwright-report/**'] })
