// Shared production-artifact inspection.
//
// Kept dependency-free so the existing all-JS artifact gate can use it without
// pulling in the module lexer that the route-budget checker needs.
import { readdir, readFile } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import { gzipSync, constants as zlibConstants } from 'node:zlib'

// Nitro precompresses public assets with Z_BEST_COMPRESSION (level 9) and skips
// files below 1024 bytes; see nitropack's compressPublicAssets(). The fallback
// uses the same level so a recomputed size is comparable to a served `.gz`.
export const NITRO_GZIP_LEVEL = zlibConstants.Z_BEST_COMPRESSION

export const SOURCE_MAP_PATTERN = /\.map(?:\.(?:br|gz))?$/

/** Recursively list every file below `directory` (absolute paths). */
export async function walkFiles(directory) {
  const files = []
  async function walk(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = join(current, entry.name)
      if (entry.isDirectory()) await walk(path)
      else files.push(path)
    }
  }
  await walk(directory)
  return files
}

/** Production source maps are never allowed, in any compression variant. */
export function findSourceMaps(files) {
  return files.filter(path => SOURCE_MAP_PATTERN.test(path))
}

/** Convert an absolute file path below `root` into a forward-slash URL path. */
export function toUrlPath(root, file) {
  return `/${relative(root, file).split(sep).join('/')}`
}

/**
 * gzip size of a buffer. Level is explicit so callers can match the artifact
 * they describe: the legacy all-JS gate keeps Node's default level, the route
 * budget uses Nitro's level 9 (or, preferably, the precompressed `.gz` file).
 */
export function gzipSize(buffer, level = zlibConstants.Z_DEFAULT_COMPRESSION) {
  return gzipSync(buffer, { level }).byteLength
}

/** Read a file and return both its raw and gzip size. */
export async function measureFile(file) {
  const bytes = await readFile(file)
  return { rawBytes: bytes.length, gzipBytes: gzipSize(bytes) }
}
