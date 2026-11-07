import { tableNames, findTable } from '../database/sql.js'
import path from 'node:path'
import fs from 'node:fs/promises'
import type { SqlExecutor } from '../database/contracts.js'

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

export const assetFamilyKey = (filename: string): string => {
  const normalized = key(filename)
  const dir = path.dirname(normalized)
  const ext = path.extname(normalized)
  const base = path.basename(normalized, ext).replace(/-thumb$/, '')
  return path.join(dir, base)
}

/** Complete inventory of authoritative reference sources (ASSET-01). */
export const ASSET_REFERENCE_SOURCES = [
  'users',
  'members',
  'history',
  'activities',
  'events',
  'event_participants',
  'site_config',
  'activity_revisions',
] as const

export type AssetReferenceSource = (typeof ASSET_REFERENCE_SOURCES)[number]

export interface ExtractedReference {
  assetPath: string
  familyKey: string
  incomplete: boolean
}

export function extractReferencesFromValue(value: unknown, root: string): {
  references: ExtractedReference[]
  invalidLocalUrls: number
} {
  const references: ExtractedReference[] = []
  let invalidLocalUrls = 0
  if (value === null || value === undefined) {
    return { references, invalidLocalUrls }
  }

  const texts: string[] = []
  if (typeof value === 'string') {
    texts.push(value)
    try {
      const parsed = JSON.parse(value)
      const pending: unknown[] = [parsed]
      while (pending.length) {
        const item = pending.pop()
        if (typeof item === 'string') texts.push(item)
        else if (item && typeof item === 'object') {
          for (const sub of Object.values(item)) pending.push(sub)
        }
      }
    } catch {
      // Plain text or malformed JSON
    }
  } else if (typeof value === 'object') {
    const pending: unknown[] = [value]
    while (pending.length) {
      const item = pending.pop()
      if (typeof item === 'string') texts.push(item)
      else if (item && typeof item === 'object') {
        for (const sub of Object.values(item)) pending.push(sub)
      }
    }
  }

  const seenCandidates = new Set<string>()
  for (const text of texts) {
    if (text.startsWith('/uploads/')) seenCandidates.add(text)
    for (const quoted of text.matchAll(/["'](\/uploads\/[^"'<>\r\n]+)["']/g)) {
      if (quoted[1]) seenCandidates.add(quoted[1])
    }
    for (const candidate of text.match(/\/uploads\/[^\s"'<>()[\]{},]+/g) || []) {
      seenCandidates.add(candidate)
    }
  }

  const seenPaths = new Set<string>()
  for (const candidate of seenCandidates) {
    const filename = localAssetPath(root, candidate)
    if (filename) {
      if (!seenPaths.has(filename)) {
        seenPaths.add(filename)
        references.push({
          assetPath: filename,
          familyKey: assetFamilyKey(filename),
          incomplete: false,
        })
      }
    } else {
      invalidLocalUrls++
      // Unknown or unparseable upload candidate is recorded as incomplete
      // so it is NEVER treated as unreferenced or safe to purge.
      references.push({
        assetPath: candidate,
        familyKey: assetFamilyKey(candidate),
        incomplete: true,
      })
    }
  }

  return { references, invalidLocalUrls }
}

// One SELECT sees a consistent database snapshot, including soft-deleted rows which
// may still be restored. Keep this list in sync when adding an asset-bearing column.
export async function assetReferences(db: SqlExecutor, root: string) {
  const revisions = await findTable(db, 'activity_revisions')
  const rows = await db.all<{ value: unknown }>(`
    SELECT avatar AS value FROM users UNION ALL SELECT avatar FROM members
    UNION ALL SELECT image FROM history UNION ALL SELECT cover_image FROM activities
    UNION ALL SELECT images FROM activities UNION ALL SELECT content FROM activities
    UNION ALL SELECT description FROM activities UNION ALL SELECT content FROM events
    UNION ALL SELECT avatar FROM event_participants UNION ALL SELECT value FROM site_config
    ${revisions ? 'UNION ALL SELECT cover_image FROM activity_revisions UNION ALL SELECT images FROM activity_revisions UNION ALL SELECT content FROM activity_revisions UNION ALL SELECT description FROM activity_revisions' : ''}
  `)
  return referencesFromValues(rows.map(row => row.value), root)
}

export function referencesFromValues(values: unknown[], root: string) {
  const references = new Set<string>()
  let invalidLocalUrls = 0
  for (const textValue of values) {
    if (typeof textValue !== 'string') continue
    const texts = [textValue]
    try {
      const pending: unknown[] = [JSON.parse(textValue)]
      while (pending.length) {
        const value = pending.pop()
        if (typeof value === 'string') texts.push(value)
        else if (value && typeof value === 'object') for (const item of Object.values(value)) pending.push(item)
      }
    } catch { /* Plain text and malformed historical JSON remain searchable. */ }
    const candidates = new Set<string>()
    for (const text of texts) {
      if (text.startsWith('/uploads/')) candidates.add(text)
      for (const quoted of text.matchAll(/["'](\/uploads\/[^"'<>\r\n]+)["']/g)) if (quoted[1]) candidates.add(quoted[1])
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
  return { dryRun: true as const, files: files.length, retained: files.length - candidates.length, skipped, invalidLocalUrls, candidates }
}

/**
 * Sync asset references for a specific business entity field into the shadow index.
 * Unknown or unparseable paths are tagged with incomplete=1 to prevent deletion.
 */
export async function syncEntityAssetReferences(
  tx: SqlExecutor,
  root: string,
  options: {
    sourceType: string
    sourceId: string | number
    sourceField: string
    sourceVersion?: number
    value: unknown
  },
): Promise<void> {
  const sourceId = String(options.sourceId)
  const version = options.sourceVersion ?? 1
  await tx.run(
    "DELETE FROM asset_references WHERE source_type = $1 AND source_id = $2 AND source_field = $3",
    [options.sourceType, sourceId, options.sourceField],
  )

  const { references } = extractReferencesFromValue(options.value, root)
  for (const ref of references) {
    await tx.run(
      `INSERT INTO asset_references
       (source_type, source_id, source_field, source_version, asset_path, family_key, incomplete)
       VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT(source_type,source_id,source_field,asset_path) DO NOTHING RETURNING id`,
      [options.sourceType, sourceId, options.sourceField, version, ref.assetPath, ref.familyKey, ref.incomplete ? 1 : 0],
    )
  }
}

/**
 * Remove asset references for an entity when physically deleted.
 */
export async function removeEntityAssetReferences(
  tx: SqlExecutor,
  sourceType: string,
  sourceId: string | number,
  sourceField?: string,
): Promise<void> {
  if (sourceField) {
    await tx.run(
      "DELETE FROM asset_references WHERE source_type = $1 AND source_id = $2 AND source_field = $3",
      [sourceType, String(sourceId), sourceField],
    )
  } else {
    await tx.run(
      "DELETE FROM asset_references WHERE source_type = $1 AND source_id = $2",
      [sourceType, String(sourceId)],
    )
  }
}

/**
 * Rebuild the full shadow reference index from all known authoritative tables.
 * Default dry-run mode gathers statistics without modifying the database.
 */
export async function rebuildAssetReferences(
  db: SqlExecutor,
  root: string,
  options: { dryRun?: boolean } = {},
): Promise<{
  dryRun: boolean
  totalEntities: number
  totalReferences: number
  incompleteCount: number
}> {
  const dryRun = options.dryRun !== false
  const holder = db as { transaction?<T>(work: (tx: SqlExecutor) => Promise<T>): Promise<T> }
  if (!dryRun && typeof holder.transaction === 'function') {
    // Read sources and replace the index under the same writer lease.
    return holder.transaction(tx => rebuildAssetReferences(tx, root, options))
  }
  const tables = new Set(
    (await tableNames(db)).map(r => r.name),
  )

  interface PendingRecord {
    sourceType: string
    sourceId: string
    sourceField: string
    sourceVersion: number
    assetPath: string
    familyKey: string
    incomplete: number
  }

  const gathered: PendingRecord[] = []
  let totalEntities = 0

  const scanSource = async (
    table: string,
    idColumn: string,
    fields: string[],
    whereClause = '',
  ) => {
    if (!tables.has(table)) return
    const selectCols = [idColumn, ...fields].join(', ')
    const rows = await db.all<Record<string, unknown>>(`SELECT ${selectCols} FROM ${table} ${whereClause}`)
    totalEntities += rows.length
    for (const row of rows) {
      const sourceId = String(row[idColumn])
      for (const field of fields) {
        const val = row[field]
        const { references } = extractReferencesFromValue(val, root)
        for (const ref of references) {
          gathered.push({
            sourceType: table,
            sourceId,
            sourceField: field,
            sourceVersion: 1,
            assetPath: ref.assetPath,
            familyKey: ref.familyKey,
            incomplete: ref.incomplete ? 1 : 0,
          })
        }
      }
    }
  }

  // 1. users
  await scanSource('users', 'id', ['avatar'])
  // 2. members (including soft deleted rows)
  await scanSource('members', 'id', ['avatar'])
  // 3. history
  await scanSource('history', 'id', ['image'])
  // 4. activities
  await scanSource('activities', 'id', ['cover_image', 'images', 'content', 'description'])
  // 5. events
  await scanSource('events', 'id', ['content'])
  // 6. event_participants
  await scanSource('event_participants', 'id', ['avatar'])
  // 7. site_config
  await scanSource('site_config', 'key', ['value'])
  // 8. activity_revisions (if present)
  await scanSource('activity_revisions', 'id', ['cover_image', 'images', 'content', 'description'])

  const incompleteCount = gathered.filter(g => g.incomplete === 1).length

  if (!dryRun) {
    const apply = async (tx: SqlExecutor) => {
      await tx.run('DELETE FROM asset_references')
      for (const g of gathered) {
        await tx.run(
          `INSERT INTO asset_references
           (source_type, source_id, source_field, source_version, asset_path, family_key, incomplete)
           VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT(source_type,source_id,source_field,asset_path) DO NOTHING RETURNING id`,
          [g.sourceType, g.sourceId, g.sourceField, g.sourceVersion, g.assetPath, g.familyKey, g.incomplete],
        )
      }
    }
    const holder = db as { transaction?<T>(work: (tx: SqlExecutor) => Promise<T>): Promise<T> }
    if (typeof holder.transaction === 'function') {
      await holder.transaction(apply)
    } else {
      await apply(db)
    }
  }

  return {
    dryRun,
    totalEntities,
    totalReferences: gathered.length,
    incompleteCount,
  }
}

/**
 * Verifies that the shadow index contains 100% of the references found by the legacy scan.
 */
export async function compareInventoryWithShadow(
  db: SqlExecutor,
  root: string,
): Promise<{
  match: boolean
  legacyCount: number
  shadowCount: number
  missingInShadow: string[]
}> {
  const legacy = await assetReferences(db, root)
  const shadowRows = await db.all<{ asset_path: string }>(
    'SELECT DISTINCT asset_path FROM asset_references WHERE incomplete = 0',
  )
  const shadowSet = new Set(shadowRows.map(r => key(r.asset_path)))

  const missingInShadow: string[] = []
  for (const ref of legacy.references) {
    if (!shadowSet.has(key(ref))) {
      missingInShadow.push(ref)
    }
  }

  return {
    match: missingInShadow.length === 0,
    legacyCount: legacy.references.size,
    shadowCount: shadowSet.size,
    missingInShadow,
  }
}

/**
 * Use indexed positive matches first, then verify misses against the authoritative
 * sources until every asset-bearing write synchronizes the shadow index.
 */
export async function isAnyAssetTargetReferenced(
  tx: SqlExecutor,
  targetFilenames: string[],
  root: string,
  localReferences: Set<string> = new Set(),
): Promise<boolean> {
  const family = (filename: string) => assetFamilyKey(filename)

  // 1. Fast-path: check if referenced by in-flight operation values themselves
  for (const target of targetFilenames) {
    const targetFamily = family(target)
    for (const ref of localReferences) {
      if (family(ref) === targetFamily) return true
      const resolved = localAssetPath(root, ref)
      if (resolved && family(resolved) === targetFamily) return true
    }
  }

  // 2. Check shadow index table
  const hasTable = await findTable(tx, 'asset_references')
  if (hasTable) {
    for (const target of targetFilenames) {
      const fam = family(target)
      const norm = key(target)

      // Scoped fail-safe: if THIS target has an incomplete/unparseable reference, retain it
      const incomplete = await tx.get<{ count: number }>(
        "SELECT count(*) as count FROM asset_references WHERE incomplete = 1 AND (family_key = $1 OR asset_path = $2)",
        [fam, norm],
      )
      if (incomplete && incomplete.count > 0) return true

      const found = await tx.get<{ id: number }>(
        "SELECT id FROM asset_references WHERE family_key = $1 OR asset_path = $2 LIMIT 1",
        [fam, norm],
      )
      if (found) return true
    }
  }

  // Only participant avatars currently synchronize the shadow index on every write.
  // A miss cannot authorize deletion: other sources, encoded URLs and thumbnail
  // families still require the authoritative inventory in this transaction.
  const refs = await assetReferences(tx, root)
  if (refs.invalidLocalUrls > 0) return true
  const families = new Set([...refs.references].map(family))
  return targetFilenames.some(target => families.has(family(target)))
}
