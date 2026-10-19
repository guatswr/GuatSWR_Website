import type { PublicActivity, PublicEvent } from '@guatswr/shared'

export const SEO_SITE_NAME = '桂航绯想天'
export const SEO_DEFAULT_DESCRIPTION = '桂航绯想天是桂林航天工业学院东方 Project 同好会，记录活动、成员与群史，欢迎校内外同好一起加入。'
export const SEO_DEFAULT_IMAGE = '/og-image.png'

/** Actual content routes only: omit redirects, login, admin and internal tools. */
export const PUBLIC_INDEX_PAGES = [
  { path: '/', title: '首页' },
  { path: '/activities', title: '社团活动记录' },
  { path: '/members', title: '绯想天住民名录' },
  { path: '/history', title: '绯想天群史' },
  { path: '/logs', title: '日志档案' },
  { path: '/social', title: '博丽大结界' },
  { path: '/join', title: '加入我们' },
  { path: '/events/bounty', title: '悬赏令' },
  { path: '/events/betting', title: '对赌协议' },
  { path: '/events/stg', title: 'STG' },
  { path: '/events/zetime', title: '则则' },
  { path: '/events/party', title: '线下聚会' },
] as const

/** Configuration, never request Host/XFH, is the sole source of SEO origins. */
export function trustedSeoOrigin(value: string): string {
  const url = new URL(value)
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Invalid SEO origin')
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) throw new Error('Invalid SEO protocol')
  return url.origin
}

export function seoUrl(path: string, configuredOrigin: string): string {
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')
    || [...path].some(character => character.codePointAt(0)! < 32 || character.codePointAt(0) === 127)) throw new Error('Invalid SEO path')
  const origin = trustedSeoOrigin(configuredOrigin)
  const url = new URL(path, origin)
  if (url.origin !== origin) throw new Error('Invalid SEO path')
  return url.href
}

export function xmlText(value: string): string {
  return [...value].filter(character => {
    const code = character.codePointAt(0)!
    return code === 9 || code === 10 || code === 13
      || (code >= 32 && code <= 0xd7ff) || (code >= 0xe000 && code <= 0xfffd) || code >= 0x10000
  }).join('')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

/** Mirror the display boundary; invalid stored covers must not break SSR SEO. */
export function seoImageUrl(value: string | null | undefined, origin: string): string {
  const pathname = value?.split(/[?#]/)[0] ?? ''
  const traversal = /%2e/i.test(pathname) || pathname.split('/').some(segment => segment === '.' || segment === '..')
  if (value && !traversal && (value.startsWith('/uploads/') || value.startsWith('/brand/'))) {
    try { return seoUrl(value, origin) } catch { /* use the shipped fallback */ }
  }
  return seoUrl(SEO_DEFAULT_IMAGE, origin)
}

/** Explicit ISO or a validated frozen timestamp, never a free-form schedule. */
function knownInstant(value: string | undefined, fallbackZone: string): string | undefined {
  if (!value) return undefined
  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?$/.exec(value)
  if (!match) return undefined
  const [, year, month, day, hour, minute, second = '00', fraction = '', authoredZone] = match
  const zone = authoredZone || fallbackZone
  const stamp = `${year}-${month}-${day}T${hour}:${minute}:${second}${fraction}${zone}`
  const number = Date.parse(stamp)
  // Date.parse normalizes Feb 30. Check the authored calendar before accepting.
  const authored = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
  if (authored.getUTCFullYear() !== Number(year) || authored.getUTCMonth() + 1 !== Number(month) || authored.getUTCDate() !== Number(day)
    || Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59 || !Number.isFinite(number)) return undefined
  return stamp
}

/** User-authored event schedules use the frozen Beijing-time convention. */
export const knownBeijingInstant = (value: string | undefined): string | undefined => knownInstant(value, '+08:00')

/** activities.created_at defaults to SQLite CURRENT_TIMESTAMP (UTC). */
export const knownPublicationInstant = (value: string | undefined): string | undefined => knownInstant(value, 'Z')

export function activitySeoNode(activity: Pick<PublicActivity, 'id' | 'title' | 'description' | 'created_at' | 'cover_image' | 'created_by'>, origin: string) {
  const date = knownPublicationInstant(activity.created_at)
  return {
    '@type': 'Article' as const,
    '@id': `${seoUrl(`/activity/${activity.id}`, origin)}#article`,
    url: seoUrl(`/activity/${activity.id}`, origin),
    headline: activity.title,
    description: activity.description,
    ...(date ? { datePublished: date } : {}),
    image: seoImageUrl(activity.cover_image, origin),
    ...(activity.created_by ? { author: { '@type': 'Person' as const, name: activity.created_by } } : {}),
    inLanguage: 'zh-CN',
  }
}

/** Do not invent a venue, end date, price or event URL for a card-only event. */
export function eventSeoNode(event: Pick<PublicEvent, 'id' | 'title'> & { content: Partial<PublicEvent['content']> }, path: string, origin: string) {
  const content = event.content
  const startDate = knownBeijingInstant(typeof content.time === 'string' ? content.time : undefined)
  // A submission deadline is not the event's start time. Without a known start
  // time, emit an ordinary creative work instead of an invalid rich Event.
  return {
    '@type': startDate ? 'Event' as const : 'CreativeWork' as const,
    '@id': `${seoUrl(path, origin)}#event-${event.id}`,
    url: seoUrl(path, origin),
    name: event.title,
    ...(startDate ? { startDate } : {}),
    ...(typeof content.copy === 'string' ? { description: content.copy } : {}),
    ...(typeof content.location === 'string' && content.location ? {
      location: { '@type': 'Place' as const, name: content.location },
    } : {}),
    inLanguage: 'zh-CN',
  }
}

/** Bounded recent feed, in the frozen API's activity-date ordering. */
export function recentActivitiesRss(activities: readonly PublicActivity[], origin: string): string {
  const base = trustedSeoOrigin(origin)
  // More than the frozen UI's 20 × (200-char title + 2000-char description),
  // checked before entity expansion. Oversize data is an explicit failure.
  const metadataUnits = activities.reduce((size, activity) => size + activity.title.length + activity.description.length + activity.created_at.length, 0)
  if (activities.length > 20 || metadataUnits > 64_000) throw new RangeError('RSS metadata exceeds its public bound')
  const items = activities.map(activity => {
    const link = xmlText(seoUrl(`/activity/${activity.id}`, base))
    const published = knownPublicationInstant(activity.created_at)
    // RSS readers may interpret description as escaped HTML. Escape for that
    // layer too, so authored markup remains literal text after XML decoding.
    return `<item><title>${xmlText(activity.title)}</title><link>${link}</link><guid isPermaLink="true">${link}</guid><description>${xmlText(xmlText(activity.description))}</description>${published ? `<pubDate>${new Date(published).toUTCString()}</pubDate>` : ''}</item>`
  }).join('')
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>${SEO_SITE_NAME} · 最近活动记录</title><link>${xmlText(base)}/activities</link><description>最近 20 条公开活动记录，按活动日期排序。</description><language>zh-CN</language><atom:link href="${xmlText(base)}/rss.xml" rel="self" type="application/rss+xml"/>${items}</channel></rss>`
}
