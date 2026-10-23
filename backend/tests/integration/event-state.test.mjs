import { expect, it } from 'vitest'
import { fixture, token, get } from '../helpers/fixture.mjs'

it('E05 concurrent settlement payloads and results retain every independently merged field', async () => {
  const f = await fixture()
  const auth = { Authorization: `Bearer ${token(2, 'admin')}` }
  const settlements = Array.from({ length: 12 }, (_, i) => f.http.post('/api/event/1/settle').set(auth).send({ payload: { [`fixture_${i}`]: i } }))
  const result = f.http.post('/api/event/1/set_result').set(auth).send({ results: [{ rank: 1, common_id: 'fixture' }] })
  const responses = await Promise.all([...settlements, result])
  expect(responses.map(r => r.status)).toEqual(Array(13).fill(200))
  const content = JSON.parse((await get(f.db, 'SELECT content FROM events WHERE id=1')).content)
  for (let i = 0; i < 12; i++) expect.soft(content[`fixture_${i}`]).toBe(i)
  expect(content.results).toEqual([{ rank: 1, common_id: 'fixture' }])
  expect(content.results_updated_at).toEqual(expect.any(String))
})

it('preserves settlement status compatibility, shallow merge, malformed content and validation order', async () => {
  const f = await fixture(), auth = { Authorization: `Bearer ${token(2, 'admin')}` }
  const settle = body => f.http.post('/api/event/1/settle').set(auth).send(body)
  expect((await settle({ payload: { nested: { a: 1 }, keep: true }, status: 'legacy-custom-status' })).status).toBe(200)
  expect((await settle({ payload: { nested: { b: 2 } }, status: ' published ' })).status).toBe(200)
  let row = await get(f.db, 'SELECT content,status FROM events WHERE id=1')
  expect(row.status).toBe(' published ')
  expect(JSON.parse(row.content)).toEqual({ nested: { b: 2 }, keep: true })
  expect((await f.http.post('/api/event/999/set_result').set(auth).send({ results: null })).body).toEqual({ message: 'results must be an array' })
  expect((await f.http.post('/api/event/999/set_result').set(auth).send({ results: [] })).status).toBe(404)
  expect((await f.http.post('/api/event/2/set_result').set(auth).send({ results: [] })).status).toBe(400)
  await f.context.sql.main.run('UPDATE events SET content=? WHERE id=1', ['malformed json'])
  expect((await settle({ payload: ['old-array-value'] })).status).toBe(200)
  row = await get(f.db, 'SELECT content,status FROM events WHERE id=1')
  expect(JSON.parse(row.content)).toEqual({ 0: 'old-array-value' })
  expect(row.status).toBe('settled')
})
