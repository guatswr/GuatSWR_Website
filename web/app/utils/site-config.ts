/**
 * Port of the archived `frontend/src/utils/siteConfig.js`.
 *
 * Only explicit web URLs may become outbound links. Legacy image paths are
 * intentionally kept separate from this rule.
 */

export interface SocialLink {
  title?: string
  subtitle?: string
  extra?: string
  url: string
  iconText?: string
  iconUrl?: string
  iconBg?: string
  iconColor?: string
  showOnHome?: boolean
}

export const safeHttpUrl = (value: unknown): string => {
  if (typeof value !== 'string' || !/^https?:\/\//i.test(value.trim())) return ''
  try {
    const url = new URL(value.trim())
    return ['http:', 'https:'].includes(url.protocol) ? url.href : ''
  } catch {
    return ''
  }
}

const DEFAULT_SOCIAL_LINKS: readonly SocialLink[] = [
  {
    title: 'Bilibili 官方账号',
    subtitle: 'UID: 444257435',
    extra: '投稿联系管理员: Taropoi',
    url: 'https://space.bilibili.com/444257435',
    iconText: 'B'
  },
  {
    title: 'QQ 直播频道',
    subtitle: '游戏直播分享',
    extra: '点击加入频道',
    url: 'https://pd.qq.com/s/fxsvvaqqt',
    iconText: 'QQ'
  }
]

const TEXT_KEYS = [
  'title',
  'subtitle',
  'extra',
  'iconText',
  'iconUrl',
  'iconBg',
  'iconColor'
] as const

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const readText = (
  record: Record<string, unknown>,
  key: string
): string | undefined => {
  const value = record[key]
  return typeof value === 'string' ? value : undefined
}

export function parseHomeLinks(value: unknown): SocialLink[] {
  let raw: unknown = DEFAULT_SOCIAL_LINKS
  if (value) {
    try {
      const parsed: unknown = typeof value === 'string' ? JSON.parse(value) : value
      if (Array.isArray(parsed)) raw = parsed
    } catch {
      // Keep the existing public accounts available when older config is invalid.
    }
  }
  const items: unknown[] = Array.isArray(raw) ? raw : []
  const links: SocialLink[] = []
  for (const item of items) {
    if (!isRecord(item)) continue
    const url = safeHttpUrl(item.url)
    if (!url) continue
    const link: SocialLink = { url }
    for (const key of TEXT_KEYS) {
      const text = readText(item, key)
      if (text) link[key] = text
    }
    if (typeof item.showOnHome === 'boolean') link.showOnHome = item.showOnHome
    links.push(link)
  }
  return links
}

/** The archived pages only accept a plain 5–12 digit QQ group number. */
export const normalizedGroupNumber = (value: unknown): string =>
  typeof value === 'string' && /^\d{5,12}$/.test(value) ? value : ''
