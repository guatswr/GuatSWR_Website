/** Preserve the existing v1 thumbnail naming convention, without importing a compressor. */
export function getThumbUrl(url = ''): string {
  if (!url || url.includes('-thumb.webp') || /\.svg(?:[?#]|$)/i.test(url)) return url
  if (!url.includes('/uploads/') && !url.includes('/img/user/') && !url.includes('/public/img/user/')) return url
  const clean = url.split(/[?#]/)[0] || url
  const lastSlash = clean.lastIndexOf('/')
  if (lastSlash === -1) return url
  const filename = clean.slice(lastSlash + 1)
  const dot = filename.lastIndexOf('.')
  return `${clean.slice(0, lastSlash)}/${dot > 0 ? filename.slice(0, dot) : filename}-thumb.webp`
}
