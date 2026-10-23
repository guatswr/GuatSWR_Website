import path from 'node:path'
import { expect, it } from 'vitest'
import { fixture, token, get } from '../helpers/fixture.mjs'
const activity = { title: 'typed activity', tag: 'STG', date: '2026-10-23', images: [] }
const update = (f, id, body) => f.http.put(`/api/activities/${id}`).set('Authorization', `Bearer ${token(2, 'admin')}`).send(body)

it('EX-07 editing cannot select another file directory through an encoded activity ID', async () => {
  const f = await fixture(), source = path.join(f.context.PUBLIC_DIR, 'upload/keep-activity.png')
  await f.fs.writeFile(source, 'source-retained')
  const response = await update(f, '..%2Fuser', { ...activity, cover_image: '/uploads/upload/keep-activity.png' })
  expect.soft(response.status).toBe(400)
  expect.soft(await f.fs.readFile(source, 'utf8').catch(() => null)).toBe('source-retained')
  await expect(f.fs.access(path.join(f.context.IMG_ROOT_DIR, 'user/keep-activity.png'))).rejects.toHaveProperty('code', 'ENOENT')
  expect(await get(f.db, 'SELECT title FROM activities WHERE id=1')).toEqual({ title: 'published' })
})

it('EX-07 edit directory IDs use the same canonical positive integer policy as uploads', async () => {
  const f = await fixture()
  for (const id of ['0', '-1', '001', '1.5', '..%5Cuser', '9007199254740992']) {
    const response = await update(f, id, activity)
    expect(response.status).toBe(400)
    expect(response.body).toEqual({ message: 'Invalid activity id' })
  }
  expect((await update(f, '1', activity)).body).toEqual({ message: '更新成功' })
  expect((await update(f, '9999', activity)).body).toEqual({ message: '更新成功' })
})

it('F02 repeated original/thumbnail references resolve to the same moved files even on a name collision', async () => {
  const f = await fixture(), staging = path.join(f.context.PUBLIC_DIR, 'upload'), target = path.join(f.context.IMG_ROOT_DIR, 'activity/1')
  await f.fs.mkdir(target, { recursive: true })
  await f.fs.writeFile(path.join(target, 'repeat.png'), 'existing-must-survive')
  await f.fs.writeFile(path.join(staging, 'repeat.png'), 'new-original')
  await f.fs.writeFile(path.join(staging, 'repeat-thumb.webp'), 'new-thumbnail')
  const source = '/uploads/upload/repeat.png', thumb = '/uploads/upload/repeat-thumb.webp'
  const response = await update(f, '1', { ...activity, cover_image: thumb, images: [source, thumb, source], content: `![original](${source}) ![thumb](${thumb}) ${source}` })
  expect(response.status).toBe(200)
  const row = await get(f.db, 'SELECT cover_image,images,content FROM activities WHERE id=1')
  const movedOriginal = row.cover_image.replace(/-thumb\.webp$/, '.png')
  expect.soft(JSON.parse(row.images)).toEqual([movedOriginal, row.cover_image, movedOriginal])
  expect.soft(row.content).toBe(`![original](${movedOriginal}) ![thumb](${row.cover_image}) ${movedOriginal}`)
  expect(await f.fs.readFile(f.context.storage.resolveUploadsPath(row.cover_image), 'utf8')).toBe('new-thumbnail')
  expect(await f.fs.readFile(f.context.storage.resolveUploadsPath(movedOriginal), 'utf8')).toBe('new-original')
  expect(await f.fs.readFile(path.join(target, 'repeat.png'), 'utf8')).toBe('existing-must-survive')
})

it('F02 an existing thumbnail alone reserves its whole image pair without being overwritten', async () => {
  const f = await fixture(), staging = path.join(f.context.PUBLIC_DIR, 'upload'), target = path.join(f.context.IMG_ROOT_DIR, 'activity/1')
  await f.fs.mkdir(target, { recursive: true })
  await f.fs.writeFile(path.join(target, 'occupied-thumb.webp'), 'existing-thumbnail')
  await f.fs.writeFile(path.join(staging, 'occupied.png'), 'new-original')
  await f.fs.writeFile(path.join(staging, 'occupied-thumb.webp'), 'new-thumbnail')
  const response = await update(f, '1', { ...activity, cover_image: '/uploads/upload/occupied.png' })
  expect(response.status).toBe(200)
  const row = await get(f.db, 'SELECT cover_image FROM activities WHERE id=1')
  expect.soft(row.cover_image).not.toBe('/uploads/img/activity/1/occupied.png')
  expect(await f.fs.readFile(path.join(target, 'occupied-thumb.webp'), 'utf8')).toBe('existing-thumbnail')
})
