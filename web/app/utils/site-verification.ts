export interface SiteVerificationMetaTag {
  name: string
  content: string
}

export interface SiteVerificationConfig {
  baidu?: string | null
  google?: string | null
  bing?: string | null
  sogou?: string | null
  so?: string | null
  custom?: string | null
  [key: string]: unknown
}

const META_NAME_PATTERN = /^[a-zA-Z0-9_.-]+$/

/**
 * Extracts and sanitizes the verification content attribute or token string.
 * Supports:
 * - Direct token: "codeva-g9JIawSEQ3"
 * - Full HTML tag: `<meta name="baidu-site-verification" content="codeva-g9JIawSEQ3" />`
 * - Quoted token: `"codeva-g9JIawSEQ3"` or `'codeva-g9JIawSEQ3'`
 */
export function extractMetaContent(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  const trimmed = raw.trim()
  if (!trimmed) return ''

  // Look for content="..." or content='...'
  const match = /content\s*=\s*["']([^"']+)["']/i.exec(trimmed)
  if (match?.[1]) {
    return sanitizeContent(match[1])
  }

  // Strip surrounding quotes if present
  const unquoted = trimmed.replace(/^["']|["']$/g, '').trim()
  return sanitizeContent(unquoted)
}

function sanitizeContent(value: string): string {
  return value.replace(/[\r\n\0<>]/g, '').trim().slice(0, 512)
}

export function isValidMetaName(name: string): boolean {
  return META_NAME_PATTERN.test(name)
}

/**
 * Parses custom verification metadata.
 * Supports:
 * - JSON array: `[{"name": "custom-code", "content": "123"}]`
 * - JSON object: `{"custom-code": "123"}`
 * - Delimited string: `custom-code=123, other=456; more=789`
 */
export function parseCustomVerification(raw: unknown): SiteVerificationMetaTag[] {
  if (typeof raw !== 'string') return []
  const trimmed = raw.trim()
  if (!trimmed) return []

  const results: SiteVerificationMetaTag[] = []

  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item && typeof item === 'object') {
            const name = String(item.name || item.property || '').trim()
            const content = extractMetaContent(item.content)
            if (isValidMetaName(name) && content) {
              results.push({ name, content })
            }
          }
        }
        return results
      } else if (parsed && typeof parsed === 'object') {
        for (const [key, val] of Object.entries(parsed)) {
          const name = key.trim()
          const content = extractMetaContent(val)
          if (isValidMetaName(name) && content) {
            results.push({ name, content })
          }
        }
        return results
      }
    } catch {
      // Fall through to delimiter parser on invalid JSON
    }
  }

  const entries = trimmed.split(/[,;\n]/)
  for (const entry of entries) {
    const trimmedEntry = entry.trim()
    if (!trimmedEntry) continue
    const eqIdx = trimmedEntry.indexOf('=')
    if (eqIdx > 0) {
      const name = trimmedEntry.slice(0, eqIdx).trim()
      const content = extractMetaContent(trimmedEntry.slice(eqIdx + 1))
      if (isValidMetaName(name) && content) {
        results.push({ name, content })
      }
    }
  }

  return results
}

/**
 * Resolves standard and custom verification tags from Nuxt public runtime config.
 */
export function resolveSiteVerificationMeta(publicConfig: Record<string, unknown> | undefined): SiteVerificationMetaTag[] {
  if (!publicConfig || typeof publicConfig !== 'object') return []

  const tags: SiteVerificationMetaTag[] = []
  const seenNames = new Set<string>()

  const addTag = (name: string, rawVal: unknown) => {
    if (seenNames.has(name)) return
    const content = extractMetaContent(rawVal)
    if (content && isValidMetaName(name)) {
      seenNames.add(name)
      tags.push({ name, content })
    }
  }

  const nested = (typeof publicConfig.siteVerification === 'object' && publicConfig.siteVerification !== null)
    ? (publicConfig.siteVerification as Record<string, unknown>)
    : {}

  // 1. Baidu
  addTag('baidu-site-verification', nested.baidu ?? publicConfig.siteVerificationBaidu ?? publicConfig.baiduSiteVerification)

  // 2. Google
  addTag('google-site-verification', nested.google ?? publicConfig.siteVerificationGoogle ?? publicConfig.googleSiteVerification)

  // 3. Bing / Microsoft
  addTag('msvalidate.01', nested.bing ?? publicConfig.siteVerificationBing ?? publicConfig.bingSiteVerification)

  // 4. Sogou
  addTag('sogou_site_verification', nested.sogou ?? publicConfig.siteVerificationSogou ?? publicConfig.sogouSiteVerification)

  // 5. 360 Search (so.com)
  addTag('360-site-verification', nested.so ?? nested['360'] ?? publicConfig.siteVerificationSo ?? publicConfig.siteVerification360)

  // 6. Custom tags
  const customRaw = nested.custom ?? publicConfig.siteVerificationCustom
  if (customRaw) {
    for (const tag of parseCustomVerification(customRaw)) {
      if (!seenNames.has(tag.name)) {
        seenNames.add(tag.name)
        tags.push(tag)
      }
    }
  }

  return tags
}
