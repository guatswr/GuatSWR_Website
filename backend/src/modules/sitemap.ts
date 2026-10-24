import type { Row, SqlExecutor } from '../database/sqlite.js'
interface Request { protocol: string; get(name: string): string | undefined }
interface Response { status(code: number): Response; setHeader(name: string, value: string): void; send(body: string): unknown }
interface Item { loc: string; lastmod?: unknown; changefreq?: string; priority?: number }
const staticUrls: Item[] = [
  { loc: '/', changefreq: 'daily', priority: 1 },
  { loc: '/events', changefreq: 'daily', priority: 0.8 },
  { loc: '/activities', changefreq: 'daily', priority: 0.8 },
  { loc: '/members', changefreq: 'weekly', priority: 0.6 },
  { loc: '/history', changefreq: 'weekly', priority: 0.6 },
  { loc: '/social', changefreq: 'monthly', priority: 0.4 },
  { loc: '/join', changefreq: 'monthly', priority: 0.5 },
  { loc: '/logs', changefreq: 'weekly', priority: 0.4 }
]
const escapeXml = (value: unknown) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
const lastmod = (value: unknown) => {
  if (!value) return null
  if (/^\d{4}-\d{2}-\d{2}/.test(String(value))) return String(value).slice(0, 10)
  const date = new Date(typeof value === 'number' ? value : String(value))
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10)
}
export function createSitemapController(store: SqlExecutor, siteUrl: () => string | undefined, report: (error: unknown) => void) {
  return async (req: Request, res: Response) => {
    const base = (siteUrl() || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '')
    let rows: (Row & { id: number; date: string | null; created_at: string | null })[]
    try { rows = await store.all("SELECT id,date,created_at FROM activities WHERE (status='published' OR status IS NULL) AND deleted_at IS NULL ORDER BY date DESC") }
    catch (error) { report(error); return res.status(500).send('Server Error') }
    const urls: Item[] = [...staticUrls, ...rows.map(row => ({ loc: `/activity/${row.id}`, lastmod: row.date || row.created_at, changefreq: 'weekly', priority: 0.7 }))]
    const body = urls.map(item => {
      const date = lastmod(item.lastmod)
      return ['  <url>', `    <loc>${escapeXml(base + item.loc)}</loc>`, date ? `    <lastmod>${date}</lastmod>` : null,
        item.changefreq ? `    <changefreq>${item.changefreq}</changefreq>` : null, item.priority !== undefined ? `    <priority>${item.priority}</priority>` : null, '  </url>'].filter(Boolean).join('\n')
    }).join('\n')
    res.setHeader('Content-Type', 'application/xml; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
    res.setHeader('Pragma', 'no-cache'); res.setHeader('Expires', '0')
    return res.send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`)
  }
}
