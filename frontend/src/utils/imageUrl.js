// URL helpers stay independent of the upload-only image compressor.
export const getThumbUrl = (url) => {
  if (!url || typeof url !== 'string' || url.includes('-thumb.webp')) return url
  if (/\.svg(?:[?#]|$)/i.test(url)) return url
  if (!url.includes('/uploads/') && !url.includes('/img/user/') && !url.includes('/public/img/user/')) return url
  const clean = url.split(/[?#]/)[0]
  const lastSlash = clean.lastIndexOf('/')
  if (lastSlash === -1) return url
  const filename = clean.slice(lastSlash + 1)
  const dot = filename.lastIndexOf('.')
  return `${clean.slice(0, lastSlash)}/${dot > 0 ? filename.slice(0, dot) : filename}-thumb.webp`
}
