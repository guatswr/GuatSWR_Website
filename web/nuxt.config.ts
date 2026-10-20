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
  // Fetch the next route on pointer/focus intent. Viewport prefetch on the
  // homepage otherwise downloads event validators before any navigation.
  experimental: {
    defaults: { nuxtLink: { prefetchOn: { visibility: false, interaction: true } } },
  },
  // Public pages do not need a session; only projected public reads are cached.
  // Admin middleware will explicitly fetch its BFF session when implemented.
  auth: { loadStrategy: 'none' },
  typescript: {
    strict: true,
    tsConfig: { compilerOptions: { noUncheckedIndexedAccess: true } },
  },
  runtimeConfig: {
    apiBase: 'http://127.0.0.1:8088',
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
    bffAdmin: {
      backupDownloadMaxBytes: 20 * 1024 ** 3,
      backupDownloadTimeoutMs: 900_000,
      maxConcurrentDownloads: 2,
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
  sitemap: {
    // Disabled on preview; release rehearsal enables this same XML owner.
    enabled: false,
    excludeAppSources: true,
    sources: ['/api/__sitemap__/urls'],
    cacheMaxAgeSeconds: 0,
    autoLastmod: false,
  },
  ogImage: { enabled: false },
  schemaOrg: { enabled: true, defaults: false, reactive: false },
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
    // nuxt-security's xssValidator runs as a Nitro middleware and, for POST,
    // consumes the request stream with `readBody(event)`. The BFF reads the
    // request body itself as a bounded raw stream, so the validator left every
    // write with an empty body (400 `invalid_request`). It is disabled only for
    // the BFF write namespace, which enforces its own exact origin, JSON
    // content type, byte/time bounds and Zod validation, and whose rendered
    // output is sanitized or escaped. On these routes the validator could only
    // reject legitimate content (any body whose JSON changes after HTML-entity
    // filtering) while breaking every write.
    '/api/bff/**': {
      security: { xssValidator: false },
      headers: { 'Cache-Control': 'no-store' },
    },
    '/api/bff/guest/upload/**': {
      // Match the frozen 50 MiB file allowance plus multipart overhead. The
      // stream parser still enforces exact file/total byte and time limits;
      // nuxt-security's default 8 MB would reject legitimate uploads first.
      security: { requestSizeLimiter: { maxUploadFileRequestInBytes: 51 * 1024 * 1024 } },
    },
    '/api/bff/admin/upload': {
      security: { requestSizeLimiter: { maxUploadFileRequestInBytes: 51 * 1024 * 1024 } },
    },
    '/api/bff/admin/events/*/avatar': {
      security: { requestSizeLimiter: { maxUploadFileRequestInBytes: 51 * 1024 * 1024 } },
    },
    '/**': { headers: { 'X-Robots-Tag': 'noindex, nofollow' } },
  },
  security: {
    rateLimiter: false,
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
