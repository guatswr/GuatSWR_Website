import { describe, expect, it } from 'vitest'
import { COMPRESS_MIN_BYTES, compressUploadImage } from '../app/utils/compress-image'

/**
 * The archived upload guard: GIF and SVG are never re-encoded (the archived form
 * kept them byte-identical), non-images and sub-300 KB images are sent untouched.
 *
 * Only the early-return paths are covered here: the re-encode path needs
 * `compressorjs` and a canvas, so it stays a browser/E2E item.
 */

describe('guest upload compression guard', () => {
  it('never re-encodes GIF or SVG, however large', async () => {
    const gif = new File([new Uint8Array(COMPRESS_MIN_BYTES + 1)], 'a.gif', { type: 'image/gif' })
    const svg = new File(['<svg xmlns="http://www.w3.org/2000/svg"/>'], 'a.svg', { type: 'image/svg+xml' })
    expect(gif.size).toBeGreaterThan(COMPRESS_MIN_BYTES)
    expect(await compressUploadImage(gif)).toBe(gif)
    expect(await compressUploadImage(svg)).toBe(svg)
  })

  it('leaves non-images and sub-threshold images untouched', async () => {
    const text = new File(['not an image'], 'a.txt', { type: 'text/plain' })
    const small = new File([new Uint8Array(1024)], 'a.png', { type: 'image/png' })
    const untyped = new File([new Uint8Array(COMPRESS_MIN_BYTES + 1)], 'a.bin')
    expect(await compressUploadImage(text)).toBe(text)
    expect(await compressUploadImage(small)).toBe(small)
    expect(await compressUploadImage(untyped)).toBe(untyped)
  })
})
