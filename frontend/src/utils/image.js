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

export { getThumbUrl } from './imageUrl'
