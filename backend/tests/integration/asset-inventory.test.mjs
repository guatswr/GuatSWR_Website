import path from 'node:path'
import { createRequire } from 'node:module'
import { expect, it } from 'vitest'
import { fixture, run } from '../helpers/fixture.mjs'
const require = createRequire(import.meta.url)
const { assetReferences, scanAssetOrphans, localAssetPath } = require('../../dist/src/storage/reference-inventory.js')
it('inventories shared, soft-deleted, nested JSON and encoded references without changing files or rows', async () => {
  const f = await fixture(), root = path.join(f.root, 'public')
  const urls = ['shared.png','shared-thumb.webp','event space.png','orphan.png']
  await f.fs.mkdir(path.join(root, 'img'), { recursive: true })
  for (const name of urls) await f.fs.writeFile(path.join(root, 'img', name), name)
  await run(f.db, 'UPDATE members SET avatar=?,deleted_at=CURRENT_TIMESTAMP WHERE id=1', ['/uploads/img/shared.png'])
  await run(f.db, 'UPDATE history SET image=? WHERE id=1', ['/uploads/img/shared.png'])
  await run(f.db, 'UPDATE events SET content=? WHERE id=1', [JSON.stringify({ unknown: { avatar: '/uploads/img/event%20space.png' } })])
  const before = await f.fs.readFile(path.join(root, 'img', 'shared.png'))
  const report = await scanAssetOrphans(f.context.sql.main, root)
  expect(report.dryRun).toBe(true)
  expect(report.candidates).toEqual([path.join(root, 'img', 'orphan.png')])
  expect(report.retained).toBe(3)
  expect(await f.fs.readFile(path.join(root, 'img', 'shared.png'))).toEqual(before)
  const refs = await assetReferences(f.context.sql.main, root)
  expect(refs.references.has(localAssetPath(root, '/uploads/img/shared.png'))).toBe(true)
})
it('rejects escaping, malformed and ambiguous URL paths and reports invalid references', async () => {
  const f = await fixture(), root = path.join(f.root, 'public')
  for (const url of ['/uploads/../private','/uploads/%2e%2e/private','/uploads/img/../../private','/uploads/img\\x','/uploads/%ZZ','/uploads//absolute','/uploads/img/x?token=1','https://example.com/x']) expect(localAssetPath(root, url)).toBeUndefined()
  await run(f.db, 'UPDATE events SET content=? WHERE id=1', ['{"bad":"/uploads/%ZZ"}'])
  expect((await scanAssetOrphans(f.context.sql.main, root)).invalidLocalUrls).toBe(1)
})

it('decodes JSON escapes and retains raw filenames with spaces and thumbnail-only references', async () => {
  const f = await fixture(), root = path.join(f.root, 'public')
  await f.fs.mkdir(path.join(root, 'img'), { recursive: true })
  for (const name of ['raw space.png','pair.png','pair-thumb.webp','escaped.png']) await f.fs.writeFile(path.join(root, 'img', name), 'fixture')
  await run(f.db, 'UPDATE events SET content=? WHERE id=1', ['{"nested":{"img":"\\/uploads\\/img\\/escaped.png"},"thumb":"/uploads/img/pair-thumb.webp"}'])
  await run(f.db, 'UPDATE members SET avatar=? WHERE id=1', ['/uploads/img/raw space.png'])
  expect((await scanAssetOrphans(f.context.sql.main, root)).candidates).toEqual([])
})
