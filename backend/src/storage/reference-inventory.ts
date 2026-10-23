import path from 'node:path'
import fs from 'node:fs/promises'
import type { SqlExecutor } from '../database/sqlite.js'

const key = (filename: string) => process.platform === 'win32' ? filename.toLowerCase() : filename
export function localAssetPath(root: string, url: string): string | undefined {
  if (!path.isAbsolute(root) || !url.startsWith('/uploads/')) return undefined
  try {
    const relative = decodeURIComponent(url.slice('/uploads/'.length))
    if (!relative || /[\\\0?#]/.test(relative) || relative.split('/').some(part => !part || part === '.' || part === '..')) return undefined
    const filename = path.resolve(root, relative), boundary = path.relative(root, filename)
    if (!boundary || boundary.startsWith('..') || path.isAbsolute(boundary)) return undefined
    return key(filename)
  } catch { return undefined }
}

// One SELECT sees a consistent database snapshot, including soft-deleted rows which
// may still be restored. Keep this list in sync when adding an asset-bearing column.
export async function assetReferences(db: SqlExecutor, root: string) {
  const rows = await db.all<{ value: unknown }>(`
    SELECT avatar AS value FROM users UNION ALL SELECT avatar FROM members
    UNION ALL SELECT image FROM history UNION ALL SELECT cover_image FROM activities
    UNION ALL SELECT images FROM activities UNION ALL SELECT content FROM activities
    UNION ALL SELECT description FROM activities UNION ALL SELECT content FROM events
    UNION ALL SELECT avatar FROM event_participants UNION ALL SELECT value FROM site_config
  `)
  const references = new Set<string>()
  let invalidLocalUrls = 0
  for (const row of rows) {
    if (typeof row.value !== 'string') continue
    // Extract from JSON, HTML/Markdown and plain URL columns without interpreting
    // unknown historical JSON. False positives retain files, never authorize deletion.
    const texts = [row.value]
    try {
      const pending: unknown[] = [JSON.parse(row.value)]
      while (pending.length) {
        const value = pending.pop()
        if (typeof value === 'string') texts.push(value)
        else if (Array.isArray(value)) pending.push(...value)
        else if (value && typeof value === 'object') pending.push(...Object.values(value))
      }
    } catch { /* Plain text and malformed historical JSON remain searchable. */ }
    const candidates = new Set<string>()
    for (const text of texts) {
      if (text.startsWith('/uploads/')) candidates.add(text)
      for (const candidate of text.match(/\/uploads\/[^\s"'<>()[\]{},]+/g) || []) candidates.add(candidate)
    }
    for (const candidate of candidates) {
      const filename = localAssetPath(root, candidate)
      if (filename) references.add(filename)
      else invalidLocalUrls++
    }
  }
  return { references, invalidLocalUrls }
}

export async function scanAssetOrphans(db: SqlExecutor, root: string) {
  if (!path.isAbsolute(root)) throw new Error('ASSET_ROOT_REQUIRED')
  const stat = await fs.lstat(root)
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('ASSET_ROOT_UNSAFE')
  const { references, invalidLocalUrls } = await assetReferences(db, root)
  const files: string[] = []
  let skipped = 0
  const walk = async (directory: string) => {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const filename = path.join(directory, entry.name)
      // Recheck with lstat; the inventory never follows symlinks or modifies files.
      const current = await fs.lstat(filename)
      if (current.isSymbolicLink()) { skipped++; continue }
      if (current.isDirectory()) await walk(filename)
      else if (current.isFile()) files.push(filename)
      else skipped++
    }
  }
  await walk(root)
  const family = (filename: string) => key(path.join(path.dirname(filename), path.basename(filename, path.extname(filename)).replace(/-thumb$/, '')))
  const retainedFamilies = new Set([...references].map(family))
  const candidates = files.filter(filename => !references.has(key(filename)) && !retainedFamilies.has(family(filename)))
  // This is a live diagnostic, not deletion authorization. Concurrent writes or
  // unsupported references require revalidation by the future cleanup worker.
  return { dryRun: true as const, files: files.length, retained: files.length - candidates.length, skipped, invalidLocalUrls, candidates }
}
