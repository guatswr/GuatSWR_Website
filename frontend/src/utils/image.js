import Compressor from 'compressorjs'

export const compressImage = (file, options = {}) => new Promise((resolve, reject) => {
  if (!file || !file.type || !file.type.startsWith('image/')) return resolve(file)
  if (file.size && file.size < 300 * 1024) return resolve(file)
  new Compressor(file, {
    quality: 0.75,
    maxWidth: 1920,
    maxHeight: 1920,
    ...options,
    success(result) {
      const compressed = new File([result], file.name, { type: result.type || file.type })
      resolve(compressed)
    },
    error(err) {
      reject(err)
    }
  })
})

export const getThumbUrl = (url) => {
  if (!url || typeof url !== 'string') return url
  if (url.includes('-thumb.webp')) return url
  const hasThumbDir = url.includes('/uploads/') || url.includes('/img/user/') || url.includes('/public/img/user/')
  if (!hasThumbDir) return url
  const clean = url.split('?')[0]
  const lastSlash = clean.lastIndexOf('/')
  if (lastSlash === -1) return url
  const prefix = clean.slice(0, lastSlash)
  const filename = clean.slice(lastSlash + 1)
  const dot = filename.lastIndexOf('.')
  const base = dot > 0 ? filename.slice(0, dot) : filename
  return `${prefix}/${base}-thumb.webp`
}
