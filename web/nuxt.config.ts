import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  compatibilityDate: '2026-10-18',
  devtools: { enabled: false },
  modules: ['@nuxt/eslint', '@pinia/nuxt', '@nuxtjs/mdc', '@nuxtjs/seo', 'nuxt-security', 'nuxt-auth-utils'],
  css: ['~/assets/css/main.css'],
  vite: { plugins: [tailwindcss()] },
  build: { transpile: ['@guatswr/shared'] },
  sourcemap: { server: false, client: false },
  features: { inlineStyles: true },
  // Cached public pages do not need a session. Admin middleware will explicitly
  // fetch its BFF session when that stage is implemented.
  auth: { loadStrategy: 'none' },
  typescript: {
    strict: true,
    tsConfig: { compilerOptions: { noUncheckedIndexedAccess: true } },
  },
  runtimeConfig: {
    apiBase: 'http://127.0.0.1:8080',
    session: {
      password: '',
      name: 'guatswr-next',
      maxAge: 60 * 60 * 24,
      cookie: { httpOnly: true, sameSite: 'lax', secure: !import.meta.dev },
    },
    public: {},
  },
  site: {
    url: 'https://next.guatswr.top',
    name: '桂航绯想天',
    description: '桂林航天工业学院东方同好社群',
    indexable: false,
    defaultLocale: 'zh-CN',
  },
  // Enable indexability only in the separately approved cutover change.
  robots: { disallow: ['/'] },
  sitemap: { enabled: false },
  ogImage: { enabled: false },
  schemaOrg: { enabled: false },
  linkChecker: { enabled: false },
  aiReady: { enabled: false },
  skewProtection: { enabled: false },
  routeRules: {
    '/': { swr: 60 },
    '/activities': { swr: 120 },
    '/activity/**': { swr: 120 },
    '/events': { swr: 60 },
    '/events/**': { swr: 60 },
    '/members': { swr: 300 },
    '/history': { swr: 300 },
    '/social': { swr: 300 },
    '/join': { headers: { 'Cache-Control': 'no-store' } },
    '/logs': { swr: 30 },
    '/admin': { ssr: false, headers: { 'Cache-Control': 'no-store' } },
    '/admin/**': { ssr: false, headers: { 'Cache-Control': 'no-store' } },
    '/api/**': { headers: { 'Cache-Control': 'no-store' } },
    '/**': { headers: { 'X-Robots-Tag': 'noindex, nofollow' } },
  },
  security: {
    headers: {
      contentSecurityPolicy: {
        'img-src': ["'self'", 'data:'],
        'connect-src': ["'self'"],
        'form-action': ["'self'"],
        'frame-ancestors': ["'none'"],
      },
      crossOriginEmbedderPolicy: 'unsafe-none',
    },
  },
  nitro: {
    preset: 'node-server',
    compressPublicAssets: true,
    externals: { inline: ['pinia', 'reka-ui'] },
  },
  app: {
    head: {
      htmlAttrs: { lang: 'zh-CN' },
      title: '桂航绯想天',
      meta: [{ name: 'theme-color', content: '#38bdf8' }],
      link: [{ rel: 'icon', type: 'image/png', sizes: '64x64', href: '/favicon.png' }],
    },
  },
})
