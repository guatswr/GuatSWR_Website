import { expect, it } from 'vitest'
import { fixture, run, all } from '../helpers/fixture.mjs'

it('matches native sqlite3 structured school bindings even when the fixed text exists as historical data', async () => {
  const f = await fixture()
  await run(f.db, "INSERT INTO members(id,name,school) VALUES(13,'structured native binding','[object Object]')")
  for (const [query, value] of [['school[]=school', ['school']], ['school=school&school=other', ['school', 'other']], ['school[nested]=school', { nested: 'school' }]]) {
    const native = await all(f.db, 'SELECT id FROM members WHERE school=? ORDER BY id', [value])
    expect(native).toEqual([{ id: 13 }])
    expect((await f.http.get('/api/members?' + query)).body.map(row => row.id)).toEqual(native.map(row => row.id))
  }
})
