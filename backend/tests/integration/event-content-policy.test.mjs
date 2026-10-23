import path from 'node:path'
import { expect, it } from 'vitest'
import { fixture, token, get, draftProofHeaders } from '../helpers/fixture.mjs'
const guest = async () => fixture({ env: { TRUST_PROXY_CIDRS: '127.0.0.1/32' } })
const save = (f, content) => f.http.put('/api/event/2').set(draftProofHeaders('save', 2)).send({ content })

it('EX-02 rejects protected visitor metadata at every depth before persistence', async () => {
  const f = await guest()
  const before = await get(f.db, 'SELECT content,status FROM events WHERE id=2')
  for (const content of [{ id: 99 }, { status: 'settled' }, { results: [] }, { settlement: { accepted: true } }, { nested: { status: 'published' } }, { visitor_ip: 'private-value' }]) {
    const response = await save(f, content)
    expect.soft(response.status).toBe(400)
  }
  expect(await get(f.db, 'SELECT content,status FROM events WHERE id=2')).toEqual(before)
})

it('allows the legitimate person ID while preserving arbitrary authenticated-admin metadata', async () => {
  const f = await guest(), person = { initiator: { id: '⑨', qq: '12345', avatar: '', goal: 'synthetic' } }
  expect((await save(f, person)).status).toBe(200)
  expect(JSON.parse((await get(f.db, 'SELECT content FROM events WHERE id=2')).content)).toEqual(person)
  const metadata = { results: [{ rank: 1 }], settlement: { approved: true }, future: { nested: { id: 88, status: 'extension' } } }
  const admin = await f.http.put('/api/event/2').set('Authorization', `Bearer ${token(2, 'admin')}`).send({ content: metadata })
  expect(admin.status).toBe(200)
  expect(JSON.parse((await get(f.db, 'SELECT content FROM events WHERE id=2')).content)).toEqual(metadata)
})

it('enforces the same visitor size/depth/string/key/array limits as the BFF', async () => {
  const f = await guest()
  const cases = [
    [{ copy: 'x'.repeat(5001) }, 400],
    [{ copy: '界'.repeat(20000) }, 413],
    [{ nested: { nested: { nested: { nested: { nested: 'x' } } } } }, 400],
    [{ list: Array.from({ length: 33 }, () => '') }, 400],
    [Object.fromEntries(Array.from({ length: 33 }, (_, index) => [`key${index}`, true])), 400]
  ]
  for (const [content, status] of cases) expect((await save(f, content)).status).toBe(status)
})

it('does no file work when visitor metadata is rejected', async () => {
  const f = await guest(), source = path.join(f.context.PUBLIC_DIR, 'upload/protected-content.png')
  await f.fs.writeFile(source, 'retained-source')
  const response = await save(f, { cover: '/uploads/upload/protected-content.png', results: [{ rank: 1 }] })
  expect(response.status).toBe(400)
  expect(await f.fs.readFile(source, 'utf8')).toBe('retained-source')
  expect(await get(f.db, 'SELECT content FROM events WHERE id=2')).toEqual({ content: '{}' })
})
