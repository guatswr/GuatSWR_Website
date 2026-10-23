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
