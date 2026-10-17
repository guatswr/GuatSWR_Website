// Only explicit web URLs may become outbound links. Legacy image paths are
// intentionally kept separate from this rule.
export const safeHttpUrl = (value) => {
  if (typeof value !== 'string' || !/^https?:\/\//i.test(value.trim())) return ''
  try {
    const url = new URL(value.trim())
    return ['http:', 'https:'].includes(url.protocol) ? url.href : ''
  } catch {
    return ''
  }
}

export const DEFAULT_JOIN_QUESTION = '你是怎么入坑东方的？'

const DEFAULT_SOCIAL_LINKS = [
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
    iconText: '🎮'
  }
]

export const parseHomeLinks = (value) => {
  let links = DEFAULT_SOCIAL_LINKS
  if (value) {
    try {
      const parsed = typeof value === 'string' ? JSON.parse(value) : value
      if (Array.isArray(parsed)) links = parsed
    } catch {
      // Keep the existing public accounts available when older config is invalid.
    }
  }
  return links
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({ ...item, url: safeHttpUrl(item.url) }))
    .filter((item) => item.url)
}
