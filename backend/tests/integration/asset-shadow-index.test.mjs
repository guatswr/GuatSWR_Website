import path from 'node:path'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { fixture, run } from '../helpers/fixture.mjs'

const require = createRequire(import.meta.url)
const {
  assetReferences,
  localAssetPath,
  assetFamilyKey,
  rebuildAssetReferences,
  compareInventoryWithShadow,
  syncEntityAssetReferences,
  removeEntityAssetReferences,
  isAnyAssetTargetReferenced,
  ASSET_REFERENCE_SOURCES,
} = require('../../dist/src/storage/reference-inventory.js')

describe('asset reference shadow index (ASSET-01)', () => {
  it('retains references after more than twenty substring collisions and across thumbnail extensions', async () => {
    const f = await fixture()
    const root = path.join(f.root, 'public')
    for (let i = 0; i < 25; i++) {
      await run(f.db, 'INSERT INTO activities(title,cover_image) VALUES(?,?)', [`collision-${i}`, `/uploads/img/other-${i}-photo.png`])
    }
    await run(f.db, 'INSERT INTO activities(title,cover_image) VALUES(?,?)', ['actual', '/uploads/img/photo.png'])
    expect(await isAnyAssetTargetReferenced(f.context.sql.main, [path.join(root, 'img', 'photo.png')], root)).toBe(true)
    expect(await isAnyAssetTargetReferenced(f.context.sql.main, [path.join(root, 'img', 'photo.webp')], root)).toBe(true)
  })

  it('finds percent-encoded references when the shadow index has not been synchronized', async () => {
    const f = await fixture()
    const root = path.join(f.root, 'public')
    await run(f.db, 'UPDATE activities SET cover_image=? WHERE id=1', ['/uploads/img/%70hoto.png'])
    expect(await isAnyAssetTargetReferenced(f.context.sql.main, [path.join(root, 'img', 'photo.png')], root)).toBe(true)
  })
  it('defines the comprehensive list of 8 authoritative reference sources', () => {
    expect(ASSET_REFERENCE_SOURCES).toEqual([
      'users',
      'members',
      'history',
      'activities',
      'events',
      'event_participants',
      'site_config',
      'activity_revisions',
    ])
  })

  it('computes consistent asset family keys stripping -thumb and extensions', () => {
    expect(assetFamilyKey('/uploads/img/photo.png')).toBe(path.join('/uploads/img', 'photo'))
    expect(assetFamilyKey('/uploads/img/photo-thumb.webp')).toBe(path.join('/uploads/img', 'photo'))
    expect(assetFamilyKey('/uploads/avatar/user-123.jpg')).toBe(path.join('/uploads/avatar', 'user-123'))
  })

  it('rebuilds shadow index with zero drop against legacy full-scan (zero false positives for orphan deletion)', async () => {
    const f = await fixture()
    const root = path.join(f.root, 'public')
    await f.fs.mkdir(path.join(root, 'img'), { recursive: true })

    const files = [
      'user_av.png',
      'member_del.png',
      'hist.png',
      'act_cover.png',
      'act_inline.png',
      'event_embed.png',
      'signup_av.png',
      'site_logo.png',
      'orphan.png',
    ]
    for (const name of files) {
      await f.fs.writeFile(path.join(root, 'img', name), 'content')
    }

    // Populate all 8 sources:
    // 1. users
    await run(f.db, 'UPDATE users SET avatar=? WHERE id=1', ['/uploads/img/user_av.png'])
    // 2. members (soft-deleted!)
    await run(f.db, 'UPDATE members SET avatar=?, deleted_at=CURRENT_TIMESTAMP WHERE id=1', ['/uploads/img/member_del.png'])
    // 3. history
    await run(f.db, 'UPDATE history SET image=? WHERE id=1', ['/uploads/img/hist.png'])
    // 4. activities
    await run(f.db, 'UPDATE activities SET cover_image=?, content=? WHERE id=1', [
      '/uploads/img/act_cover.png',
      '正文引用图片：![图](/uploads/img/act_inline.png)',
    ])
    // 5. events
    await run(f.db, 'UPDATE events SET content=? WHERE id=1', [
      JSON.stringify({ banner: '/uploads/img/event_embed.png' }),
    ])
    // 6. event_participants
    await run(f.db, 'INSERT INTO event_participants(event_id, user_id, avatar) VALUES(1, 1, ?)', [
      '/uploads/img/signup_av.png',
    ])
    // 7. site_config
    await run(f.db, "INSERT OR REPLACE INTO site_config(key, value) VALUES('site_logo', ?)", [
      '/uploads/img/site_logo.png',
    ])

    // Test 1: Dry run does not write to shadow table
    const dryResult = await rebuildAssetReferences(f.context.sql.main, root, { dryRun: true })
    expect(dryResult.dryRun).toBe(true)
    expect(dryResult.totalReferences).toBeGreaterThanOrEqual(7)
    const initialRows = await f.context.sql.main.all('SELECT * FROM asset_references')
    expect(initialRows).toHaveLength(0)

    // Test 2: Apply rebuild
    const applyResult = await rebuildAssetReferences(f.context.sql.main, root, { dryRun: false })
    expect(applyResult.dryRun).toBe(false)
    expect(applyResult.totalReferences).toBeGreaterThanOrEqual(7)

    // Test 3: Compare legacy vs shadow - zero missing!
    const comparison = await compareInventoryWithShadow(f.context.sql.main, root)
    expect(comparison.match).toBe(true)
    expect(comparison.missingInShadow).toEqual([])
    expect(comparison.shadowCount).toBeGreaterThanOrEqual(comparison.legacyCount)

    // Verify soft deleted member avatar is retained in shadow index
    const memberRef = await f.context.sql.main.get(
      "SELECT * FROM asset_references WHERE source_type='members' AND asset_path LIKE '%member_del.png%'",
    )
    expect(memberRef).toBeDefined()
  })

  it('tags unparseable or malformed URLs with incomplete=1 instead of dropping them', async () => {
    const f = await fixture()
    const root = path.join(f.root, 'public')

    await run(f.db, 'UPDATE events SET content=? WHERE id=1', ['{"suspicious":"/uploads/%ZZ_corrupt"}'])
    const report = await rebuildAssetReferences(f.context.sql.main, root, { dryRun: false })
    expect(report.incompleteCount).toBeGreaterThan(0)

    const incompleteRow = await f.context.sql.main.get(
      "SELECT * FROM asset_references WHERE incomplete=1 AND source_type='events'",
    )
    expect(incompleteRow).toBeDefined()
    expect(incompleteRow.asset_path).toContain('/uploads/%ZZ_corrupt')
  })

  it('supports incremental entity reference sync and removal on business updates', async () => {
    const f = await fixture()
    const root = path.join(f.root, 'public')
    await f.fs.mkdir(path.join(root, 'img'), { recursive: true })
    await f.fs.writeFile(path.join(root, 'img', 'old_avatar.png'), 'old')
    await f.fs.writeFile(path.join(root, 'img', 'new_avatar.png'), 'new')

    // Initial sync
    await syncEntityAssetReferences(f.context.sql.main, root, {
      sourceType: 'users',
      sourceId: 42,
      sourceField: 'avatar',
      value: '/uploads/img/old_avatar.png',
    })
    let rows = await f.context.sql.main.all("SELECT * FROM asset_references WHERE source_type='users' AND source_id='42'")
    expect(rows).toHaveLength(1)
    expect(rows[0].asset_path).toBe(localAssetPath(root, '/uploads/img/old_avatar.png'))

    // Update sync (replaces old)
    await syncEntityAssetReferences(f.context.sql.main, root, {
      sourceType: 'users',
      sourceId: 42,
      sourceField: 'avatar',
      value: '/uploads/img/new_avatar.png',
    })
    rows = await f.context.sql.main.all("SELECT * FROM asset_references WHERE source_type='users' AND source_id='42'")
    expect(rows).toHaveLength(1)
    expect(rows[0].asset_path).toBe(localAssetPath(root, '/uploads/img/new_avatar.png'))

    // Physical removal
    await removeEntityAssetReferences(f.context.sql.main, 'users', 42, 'avatar')
    rows = await f.context.sql.main.all("SELECT * FROM asset_references WHERE source_type='users' AND source_id='42'")
    expect(rows).toHaveLength(0)
  })

  it('correctly detects referenced assets and handles substring collisions and underscore escaping in isAnyAssetTargetReferenced', async () => {
    const f = await fixture()
    const root = path.join(f.root, 'public')
    await f.fs.mkdir(path.join(root, 'img'), { recursive: true })

    const filePrefix = path.join(root, 'img', 'my_photo.png')
    const fileTarget = path.join(root, 'img', 'photo.png')
    const fileOrphan = path.join(root, 'img', 'orphan.png')

    // 1. In-flight localReferences detection
    const inFlightDetected = await isAnyAssetTargetReferenced(
      f.context.sql.main,
      [fileTarget],
      root,
      new Set(['/uploads/img/photo.png']),
    )
    expect(inFlightDetected).toBe(true)

    // 2. Substring collision test on business tables
    // Row 1 contains 'my_photo.png', Row 2 contains 'photo.png'
    await run(f.db, 'INSERT INTO activities(id, title, cover_image) VALUES(101, "A1", "/uploads/img/my_photo.png")')
    await run(f.db, 'INSERT INTO activities(id, title, cover_image) VALUES(102, "A2", "/uploads/img/photo.png")')

    // Searching for fileTarget ('photo.png') must return true even though 'my_photo.png' exists in earlier row
    const targetDetected = await isAnyAssetTargetReferenced(f.context.sql.main, [fileTarget], root)
    expect(targetDetected).toBe(true)

    // Searching for an orphan must return false
    const orphanDetected = await isAnyAssetTargetReferenced(f.context.sql.main, [fileOrphan], root)
    expect(orphanDetected).toBe(false)

    // 3. Underscore escaping: 'photo_1.png' should NOT match 'photoX1.png'
    const underscoreTarget = path.join(root, 'img', 'photo_1.png')
    await run(f.db, 'INSERT INTO activities(id, title, cover_image) VALUES(103, "A3", "/uploads/img/photoX1.png")')
    const underscoreDetected = await isAnyAssetTargetReferenced(f.context.sql.main, [underscoreTarget], root)
    expect(underscoreDetected).toBe(false)

    // 4. Scoped incomplete reference test:
    // Incomplete reference for 'corrupt.png' should NOT block cleanup of orphan.png
    await run(f.db, `
      INSERT INTO asset_references(source_type, source_id, source_field, asset_path, family_key, incomplete)
      VALUES('events', '99', 'content', '${path.join(root, 'img', 'corrupt.png')}', '${assetFamilyKey(path.join(root, 'img', 'corrupt.png'))}', 1)
    `)
    const orphanStillFalse = await isAnyAssetTargetReferenced(f.context.sql.main, [fileOrphan], root)
    expect(orphanStillFalse).toBe(false)

    // But searching for the corrupt file itself should return true to protect it
    const corruptProtected = await isAnyAssetTargetReferenced(f.context.sql.main, [path.join(root, 'img', 'corrupt.png')], root)
    expect(corruptProtected).toBe(true)
  })
})
