import fs from 'node:fs/promises'
import { AppError } from '../../errors.js'

export const BOT_IMAGE_LIMIT = 50
const BOT_IMAGE_CANDIDATE_LIMIT = 256
export const BOT_IMAGE_SOURCE_LIMIT = 262144
export interface BotImageOptions {
  assetBaseUrl(): string
  siteUrl(): string
  resolveUploadsPath(url: string): string | null
}
const entities = (text: string) => text.replace(/&(?:amp|quot|apos|lt|gt|#\d{1,7}|#x[\da-f]{1,6});/gi, value => {
  const named: Record<string,string> = { '&amp;':'&','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>' }
  if (named[value.toLowerCase()]) return named[value.toLowerCase()]!
  const hex = value.toLowerCase().startsWith('&#x')
  const code = Number.parseInt(value.slice(hex ? 3 : 2,-1),hex ? 16 : 10)
  return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : ''
})
const plainDestination = (value: string) => entities(value.replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\]\\^_`{|}~])/g,'$1'))
const referenceKey = (value: string) => value.trim().replace(/\s+/g,' ').toLowerCase()
const withoutHtmlCode = (text: string) => {
  const opening = /<(script|style|pre|code)(?=[\s>])/gi
  const lower = text.toLowerCase()
  let result = '', position = 0, match: RegExpExecArray | null
  while ((match = opening.exec(text))) {
    result += text.slice(position,match.index)
    const tagEnd = text.indexOf('>',opening.lastIndex)
    if (tagEnd === -1) return result
    const close = lower.indexOf(`</${match[1]!.toLowerCase()}`,tagEnd+1)
    if (close === -1) return result
    const end = text.indexOf('>',close)
    if (end === -1) return result
    position = end+1; opening.lastIndex = position
  }
  return result + text.slice(position)
}
// Extract destinations without rendering content or following links. This covers
// common inline/reference Markdown and HTML img src; code examples are omitted.
export function embeddedImages(input: string): string[] {
  let fence = '', fenceLength = 0
  const text = withoutHtmlCode(input.split(/\r?\n/).map(line => {
    const match = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line)
    if (fence) {
      if (match && match[1]![0] === fence && match[1]!.length >= fenceLength && !match[2]!.trim()) fence = ''
      return ''
    }
    if (match) { fence = match[1]![0]!; fenceLength = match[1]!.length; return '' }
    return /^(?: {4}|\t)/.test(line) ? '' : line
  }).join('\n').replace(/<!--[\s\S]*?(?:-->|$)/g,''))
    .replace(/(`+)[^`\n]*\1/g,'')
  const candidates: { index: number; value: string }[] = []
  const definitions = new Map<string,string>()
  for (const match of text.matchAll(/^ {0,3}\[([^\]\n]{1,1024})\]:\s*(?:<([^>\n]+)>|(\S+))/gm)) {
    const key = referenceKey(match[1]!)
    if (!definitions.has(key)) definitions.set(key,match[2] || match[3] || '')
  }
  const lower = text.toLowerCase()
  let htmlPosition = 0
  while (htmlPosition < text.length) {
    const start = lower.indexOf('<img',htmlPosition)
    if (start === -1) break
    const end = text.indexOf('>',start+4)
    if (end === -1) break
    htmlPosition = end+1
    if (!/\s/.test(text[start+4] || '') || end-start > 8192) continue
    const attribute = /\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(text.slice(start,end))
    if (attribute) candidates.push({ index:start,value:attribute[1] ?? attribute[2] ?? attribute[3] ?? '' })
  }
  let position = 0
  while (position < text.length) {
    const start = text.indexOf('![',position)
    if (start === -1) break
    if (start > 0 && text[start-1] === '\\') { position = start+2; continue }
    let end = start+2, depth = 1
    for (; end < text.length && depth; end++) {
      if (text[end] === '\\') { end++; continue }
      if (text[end] === '[') depth++
      if (text[end] === ']') depth--
    }
    if (depth) break
    const alt = text.slice(start+2,end-1)
    let value = ''
    if (text[end] === '(') {
      let cursor = end+1, nesting = 0
      while (/\s/.test(text[cursor] || '') && cursor < text.length) cursor++
      const angle = text[cursor] === '<'
      if (angle) cursor++
      for (; cursor < text.length; cursor++) {
        const char = text[cursor]!
        if (char === '\\' && cursor+1 < text.length) { value += text.slice(cursor,cursor+2); cursor++; continue }
        if (angle && (char === '>' || char === '\n')) break
        if (!angle) {
          if (char === '(') nesting++
          if (char === ')') { if (!nesting) break; nesting-- }
          if (/\s/.test(char) && !nesting) break
        }
        value += char
      }
      position = Math.max(end,cursor)
    } else if (text[end] === '[') {
      const close = text.indexOf(']',end+1)
      if (close !== -1) { value = definitions.get(referenceKey(text.slice(end+1,close) || alt)) || ''; end = close+1 }
      position = end
    } else { value = definitions.get(referenceKey(alt)) || ''; position = end }
    if (value) candidates.push({ index:start,value })
  }
  return candidates.sort((a,b) => a.index-b.index).map(item => plainDestination(item.value))
}

function publicOrigin(value: string): string {
  try {
    const url = new URL(value)
    if (!['http:','https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('origin')
    return url.origin
  } catch { throw new AppError('Bot 图片公开域名配置无效','bot_asset_configuration',503) }
}
export function createBotImageProjection(options: BotImageOptions) {
  const origin = publicOrigin(options.assetBaseUrl()), siteOrigin = publicOrigin(options.siteUrl())
  return async (cover: unknown, bodies: string[], sourceTruncated: boolean) => {
    const candidates: unknown[] = [cover,...bodies.flatMap(embeddedImages)]
    const images: string[] = [], seen = new Set<string>()
    let truncated = sourceTruncated || candidates.length > BOT_IMAGE_CANDIDATE_LIMIT
    for (const value of candidates.slice(0,BOT_IMAGE_CANDIDATE_LIMIT)) {
      if (typeof value !== 'string' || !value || value.length > 2048) continue
      const raw = value.trim()
      if (/[\r\n\t\\]/.test(raw) || raw.startsWith('//')) continue
      let pathname: string
      if (raw.startsWith('/uploads/')) pathname = raw.split(/[?#]/)[0]!
      else {
        let url: URL
        try { url = new URL(raw) } catch { continue }
        if (![origin,siteOrigin].includes(url.origin) || url.username || url.password) continue
        // Check the original path before URL dot-segment normalization.
        pathname = /^https?:\/\/[^/]+(\/[^?#]*)/i.exec(raw)?.[1] || ''
      }
      if (!pathname.startsWith('/uploads/') || !/\.(?:png|jpe?g|gif|webp|avif|bmp)$/i.test(pathname)) continue
      if (pathname.split('/').some(part => part.startsWith('.asset-prepare-'))) continue
      const filename = options.resolveUploadsPath(pathname)
      if (!filename) continue
      const canonical = '/' + decodeURIComponent(pathname).split('/').filter(Boolean).map(encodeURIComponent).join('/')
      const url = new URL(canonical,origin).href
      if (seen.has(url)) continue
      seen.add(url)
      try { const stat = await fs.lstat(filename); if (!stat.isFile() || stat.isSymbolicLink()) continue }
      catch { continue }
      if (images.length >= BOT_IMAGE_LIMIT) { truncated = true; break }
      images.push(url)
    }
    return { images,image_url:images[0] || '',images_truncated:truncated }
  }
}
