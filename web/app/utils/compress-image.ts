/**
 * Client-side image compression for event uploads.
 *
 * Port of the archived `utils/image.js`: images under 300 KB are sent untouched,
 * everything else is re-encoded at quality 0.75 with a 1920 px bound. GIF and SVG
 * are never re-encoded (the archived form kept them byte-identical), and
 * `compressorjs` is imported lazily so it stays out of the public bundle.
 */

export const COMPRESS_MIN_BYTES = 300 * 1024
export const COMPRESS_QUALITY = 0.75
export const COMPRESS_MAX_DIMENSION = 1920

export interface CompressImageOptions {
  quality?: number
  maxWidth?: number
  maxHeight?: number
}

export async function compressUploadImage(
  file: File,
  options: CompressImageOptions = {}
): Promise<File> {
  if (!file.type?.startsWith('image/')) return file
  if (file.type === 'image/gif' || file.type === 'image/svg+xml') return file
  if (file.size && file.size < COMPRESS_MIN_BYTES) return file
  const { default: Compressor } = await import('compressorjs')
  return await new Promise<File>((resolve, reject) => {
    void new Compressor(file, {
      quality: COMPRESS_QUALITY,
      maxWidth: COMPRESS_MAX_DIMENSION,
      maxHeight: COMPRESS_MAX_DIMENSION,
      ...options,
      success(result) {
        resolve(new File([result], file.name, { type: result.type || file.type }))
      },
      error(error: Error) {
        reject(error)
      }
    })
  })
}
