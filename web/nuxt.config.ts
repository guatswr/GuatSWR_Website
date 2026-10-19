import tailwindcss from '@tailwindcss/vite'

// Public HTML is rendered fresh for every GET/HEAD so each response carries a
// new CSP nonce. `private, no-cache` (rather than `no-store`) keeps it eligible
// for the HTML compression middleware while forbidding shared reuse without a
// validator; no ETag/304 may replay a nonce-bearing body. Browser JSON API
// responses remain no-store; only the server-side projected-data cache is SWR.
const publicHtmlHeaders = {
  'Cache-Control': 'private, no-cache, max-age=0, must-revalidate',
}

export default defineNuxtConfig({
  compatibilityDate: '2026-10-18',
  devtools: { enabled: false },
  modules: ['@nuxt/eslint', '@pinia/nuxt', '@nuxtjs/mdc', '@nuxtjs/seo', 'nuxt-security', 'nuxt-auth-utils'],
  css: ['~/assets/css/main.css'],
  vite: { plugins: [tailwindcss()] },
  build: { transpile: ['@guatswr/shared'] },
  sourcemap: { server: false, client: false },
  features: { inlineStyles: true },
  // Public pages do not need a session; only projected public reads are cached.
  // Admin middleware will explicitly fetch its BFF session when implemented.
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
      // Cookie-only transport: never accept a sealed session through a header.
      sessionHeader: false,
      cookie: { httpOnly: true, sameSite: 'lax', secure: !import.meta.dev },
    },
    // Private BFF auth defaults. Everything fails closed: no write origin is
    // trusted and no proxy is trusted until explicitly configured.
    // Override with NUXT_BFF_AUTH_* env values (arrays as JSON).
    bffAuth: {
      allowedOrigins: [] as string[],
      trustedProxyCidrs: [] as string[],
      allowInsecureLoopbackCookies: false,
      sessionMaxAgeSeconds: 60 * 60 * 24,
      csrfMaxAgeSeconds: 60 * 60 * 2,
      maxJsonBytes: 16 * 1024,
      maxLogoutBytes: 1024,
      memorySessionLimit: 10_000,
      loginRateLimitMax: 10,
      loginRateLimitWindowMs: 60 * 1000,
      bodyTimeoutMs: 5_000,
      upstreamTimeoutMs: 8_000,
      maxUpstreamResponseBytes: 64 * 1024,
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
    // Fresh SSR for every public page: data SWR lives in the server adapters,
    // never in a rendered-HTML cache that would repeat a CSP nonce.
    '/': { headers: { ...publicHtmlHeaders } },
    '/activities': { headers: { ...publicHtmlHeaders } },
    '/activity/**': { headers: { ...publicHtmlHeaders } },
    '/events': { headers: { ...publicHtmlHeaders } },
    '/events/**': { headers: { ...publicHtmlHeaders } },
    '/members': { headers: { ...publicHtmlHeaders } },
    '/history': { headers: { ...publicHtmlHeaders } },
    '/social': { headers: { ...publicHtmlHeaders } },
    '/logs': { headers: { ...publicHtmlHeaders } },
    '/join': { headers: { 'Cache-Control': 'no-store' } },
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
