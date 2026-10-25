import { createRequire } from 'node:module'
import path from 'node:path'
import { expect, it } from 'vitest'
import { fixture, token, run, get, png } from '../helpers/fixture.mjs'
const require = createRequire(import.meta.url)
const { createOnThisDayQuery } = require('../../dist/src/integrations/bot/on-this-day.js')
const { embeddedImages, BOT_IMAGE_SOURCE_LIMIT } = require('../../dist/src/integrations/bot/images.js')
const setup = async () => {
  const f = await fixture({ env: { BOT_PLATFORM_ENABLED: 'true' } })
  const created = await f.http.post('/api/bot/admin/credentials').set('Authorization', `Bearer ${token()}`)
    .send({ name: 'on-this-day', scopes: ['query:read'] })
  expect(created.status).toBe(200)
  const auth = { Authorization: `Bearer ${created.body.token}` }
  f.context.env.BOT_PUBLIC_ASSET_BASE_URL = f.origin
  f.context.env.SITE_URL = 'https://guatswr.top'
  for (const name of ['cover.png','history.png','album.png','body.png','ref.png','中文 (1).png','amp&pic.png']) {
    await f.fs.writeFile(path.join(f.context.PUBLIC_DIR,name),png)
  }
  await run(f.db, 'DELETE FROM activities')
  await run(f.db, 'DELETE FROM history')
  for (const [id, date, status, deleted] of [
    [1, '2024-10-25', 'published', null], [2, '2025-10-25', 'published', null],
    [3, '2026-10-25', 'published', null], [4, '2027-10-25', 'published', null],
    [5, '2023-10-25', 'draft', null], [6, '2022-10-25', 'published', '2026-01-01'],
    [7, '2020-10-25', null, null], [8, '2024-10-24', 'published', null],
  ]) await run(f.db, `INSERT INTO activities(id,title,tag,date,status,deleted_at,description,content,cover_image,created_at,created_by)
    VALUES(?,?,?,?,?,?,'summary','private-body-not-for-digest','/uploads/cover.png','2026-01-01',2)`,
  [id, `article-${id}`, 'STG', date, status, deleted])
  for (const [id, date, deleted] of [[1,'2025-10-25',null], [2,'2026-10-25',null], [3,'2023-10-25','2026-01-01'], [4,'2019-10-25',null]]) {
    await run(f.db, 'INSERT INTO history(id,title,date,description,image,deleted_at) VALUES(?,?,?,?,?,?)', [id,`history-${id}`,date,'memory','/uploads/history.png',deleted])
  }
  return { ...f, auth }
}
const endpoint = '/api/bot/v1/on-this-day'

it('merges past articles and history by authored month/day and never exposes drafts, deleted or internal fields', async () => {
  const f = await setup()
  const response = await f.http.get(`${endpoint}?date=2026-10-25`).set(f.auth)
  expect(response.status).toBe(200)
  expect(response.headers['cache-control']).toBe('private, no-store')
  expect(response.body).toMatchObject({ date:'2026-10-25',month_day:'10-25',timezone:'Asia/Shanghai',source:'all',total:5,has_more:false })
  expect(response.body.items.map(item => [item.source,item.id,item.years_ago])).toEqual([
    ['articles',2,1],['history',1,1],['articles',1,2],['articles',7,6],['history',4,7],
  ])
  expect(response.body.items[0]).toMatchObject({ url:'/activity/2',description:'summary',image:'/uploads/cover.png',tag:'STG' })
  expect(response.body.items[1]).toMatchObject({ url:'/history',description:'memory',image:'/uploads/history.png' })
  expect(response.body.items[0]).toMatchObject({image_url:`${f.origin}/uploads/cover.png`,images:[`${f.origin}/uploads/cover.png`],images_truncated:false})
  expect(response.body.broadcast_images).toEqual([`${f.origin}/uploads/cover.png`,`${f.origin}/uploads/history.png`])
  const text = JSON.stringify(response.body)
  for (const value of ['private-body-not-for-digest','created_by','deleted_at','article-3','article-4','article-5','article-6','history-2','history-3']) expect(text).not.toContain(value)
  expect(response.body.broadcast_text).toContain('历史上的今天（10月25日）')
  expect(response.body.broadcast_text).toContain('2024年（2年前） · 活动文章：article-1')
  expect(response.body.broadcast_text).toContain('2025年（1年前） · 群史：history-1')
  expect((await get(f.db,'SELECT COUNT(*) AS n FROM bot_notifications')).n).toBe(0)
})
it('filters sources and paginates a stable merged list including totals on empty pages', async () => {
  const f = await setup()
  const articles = await f.http.get(`${endpoint}?date=2026-10-25&source=articles`).set(f.auth)
  expect(articles.body.total).toBe(3); expect(articles.body.items.every(item => item.source==='articles')).toBe(true)
  const history = await f.http.get(`${endpoint}?date=2026-10-25&source=history`).set(f.auth)
  expect(history.body.total).toBe(2); expect(history.body.items.every(item => item.source==='history')).toBe(true)
  const first = await f.http.get(`${endpoint}?date=2026-10-25&limit=2`).set(f.auth)
  const second = await f.http.get(`${endpoint}?date=2026-10-25&limit=2&page=2`).set(f.auth)
  expect(first.body).toMatchObject({total:5,has_more:true,page:1})
  expect(second.body.items.map(item=>item.id)).toEqual([1,7])
  const empty = await f.http.get(`${endpoint}?date=2026-10-25&limit=2&page=4`).set(f.auth)
  expect(empty.body).toMatchObject({total:5,has_more:false,items:[]})
  expect(empty.body.broadcast_text).toContain('本页暂无记录')
})
it('derives today from the Beijing calendar across midnight and a year boundary', async () => {
  const f = await setup()
  const before = createOnThisDayQuery(f.context.sql.main,()=>Date.parse('2026-10-24T15:59:59Z'))
  const after = createOnThisDayQuery(f.context.sql.main,()=>Date.parse('2026-10-24T16:00:00Z'))
  expect((await before({})).date).toBe('2026-10-24')
  expect((await after({}))).toMatchObject({date:'2026-10-25',total:5})
  await run(f.db,"INSERT INTO history(title,date) VALUES('new year memory','2026-01-01')")
  const nextYear = createOnThisDayQuery(f.context.sql.main,()=>Date.parse('2026-12-31T16:00:00Z'))
  expect((await nextYear({}))).toMatchObject({date:'2027-01-01',total:1})
  const response=await f.http.get(endpoint).set(f.auth)
  expect(response.status).toBe(200);expect(response.body.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
})
it('handles real leap days and skips corrupt, incomplete or timestamp-shaped authored dates', async () => {
  const f = await setup()
  await run(f.db,'DELETE FROM activities'); await run(f.db,'DELETE FROM history')
  for (const date of ['2000-02-29','1900-02-29','2023-02-29','2024-02-29','2028-02-29','2024-02-30','2024-02','2024','0000-02-29','2024-02-29T00:00:00Z',null]) {
    await run(f.db,'INSERT INTO history(title,date) VALUES(?,?)',['leap',date])
  }
  const leap=await f.http.get(`${endpoint}?date=2028-02-29`).set(f.auth)
  expect(leap.body.items.map(item=>item.date)).toEqual(['2024-02-29','2000-02-29'])
  const march=await f.http.get(`${endpoint}?date=2028-03-01`).set(f.auth)
  expect(march.body.total).toBe(0)
})
it('rejects invalid dates, composite query values and unsafe pagination or source parameters', async () => {
  const f = await setup()
  for (const query of [
    'date=2025-02-29','date=1900-02-29','date=2026-02-30','date=2026-13-01','date=0000-01-01',
    'date=10-25','date=2026-10','date=','date[]=2026-10-25','date=2026-10-25T00:00:00Z',
    'source=events','source[]=articles','source=','page=0','page=1000001','limit=101','limit[]=2',
    "date=2026-10-25%27%20OR%201%3D1--",
  ]) expect((await f.http.get(`${endpoint}?${query}`).set(f.auth)).status,query).toBe(400)
})
it('requires a live query scope and returns an explicit empty broadcast without side effects', async () => {
  const f = await setup()
  expect((await f.http.get(endpoint)).status).toBe(401)
  const limited=await f.http.post('/api/bot/admin/credentials').set('Authorization',`Bearer ${token()}`).send({name:'limited',scopes:['signup:read']})
  expect((await f.http.get(endpoint).set('Authorization',`Bearer ${limited.body.token}`)).status).toBe(403)
  const empty=await f.http.get(`${endpoint}?date=2026-11-11`).set(f.auth)
  expect(empty.body).toMatchObject({total:0,has_more:false,items:[],broadcast_images:[],broadcast_text:'历史上的今天（11月11日）：暂无往年记录。'})
})
it('returns only article covers while preserving downloadable history pictures and page-wide deduplication', async () => {
  const f=await setup()
  const body=[
    '![body](/uploads/body.png)', '![ref][my picture]',
    '[my picture]: /uploads/ref.png "caption"',
    '<img src="/uploads/amp&amp;pic.png">',
    '![nested [alt]](</uploads/中文 (1).png>)',
    '![duplicate](/uploads/cover.png?cache=1)',
    '```md', '![example](/uploads/ignore.png)', '```',
  ].join('\n')
  await run(f.db,'UPDATE activities SET images=?,content=?,description=? WHERE id=2',[
    JSON.stringify(['/uploads/cover.png','/uploads/album.png']),`private-article-body-header\n${body}`,'article summary ![extra](/uploads/album.png)',
  ])
  await run(f.db,'UPDATE history SET description=? WHERE id=1',[`memory\n${body}`])
  const response=await f.http.get(`${endpoint}?date=2026-10-25`).set(f.auth).set('Host','untrusted.invalid')
  expect(response.status).toBe(200)
  const historyImages=['history.png','body.png','ref.png','amp%26pic.png','%E4%B8%AD%E6%96%87%20(1).png','cover.png'].map(name=>`${f.origin}/uploads/${name}`)
  expect(response.body.items[0].images).toEqual([`${f.origin}/uploads/cover.png`])
  expect(response.body.items[1].images).toEqual(historyImages)
  expect(response.body.broadcast_images).toEqual([`${f.origin}/uploads/cover.png`,...historyImages.slice(0,-1)])
  expect(response.body.broadcast_images).not.toContain(`${f.origin}/uploads/album.png`)
  expect(JSON.stringify(response.body)).not.toContain('private-article-body-header')
  for(const url of response.body.broadcast_images) {
    const image=await fetch(url) // Deliberately do not attach Bot Authorization.
    expect(image.status,url).toBe(200);expect(image.headers.get('content-type')).toMatch(/^image\/png/)
    expect(Buffer.from(await image.arrayBuffer())).toEqual(png)
  }
})
it('excludes missing files, external URLs, private traversal, hidden preparation files and non-image assets',async()=>{
  const f=await setup()
  await f.fs.writeFile(path.join(f.context.PUBLIC_DIR,'file.txt'),'not a picture')
  await f.fs.writeFile(path.join(f.root,'private.png'),png)
  await f.fs.symlink(f.root,path.join(f.context.PUBLIC_DIR,'escape'),'junction')
  await f.fs.mkdir(path.join(f.context.PUBLIC_DIR,'.asset-prepare-test'),{recursive:true})
  await f.fs.writeFile(path.join(f.context.PUBLIC_DIR,'.asset-prepare-test','keep.png'),png)
  const invalidImages=[
      'https://external.invalid/uploads/cover.png','http://127.0.0.1/private.png','//external.invalid/cover.png',
      '/uploads/%2e%2e/private.png','/uploads/../private.png','https://guatswr.top/uploads/../private.png',
      '/uploads/.asset-prepare-test/keep.png','/uploads/escape/private.png','/uploads/file.txt','data:image/png;base64,abc','/uploads/album.png',
    ]
  await run(f.db,'UPDATE history SET image=?,description=? WHERE id=1',[
    '/uploads/missing.png',invalidImages.map(url=>`![photo](<${url}>)`).join('\n'),
  ])
  const response=await f.http.get(`${endpoint}?date=2026-10-25&source=history&limit=1`).set(f.auth)
  expect(response.body.items[0]).toMatchObject({image:'/uploads/missing.png',image_url:`${f.origin}/uploads/album.png`,images:[`${f.origin}/uploads/album.png`]})
  expect(response.body.broadcast_images).toEqual([`${f.origin}/uploads/album.png`])
})
it('falls back to text when no picture is available and reports clipping instead of silently claiming a complete gallery',async()=>{
  const f=await setup()
  const names=Array.from({length:51},(_,i)=>`limit-${i}.png`)
  for(const name of names) await f.fs.writeFile(path.join(f.context.PUBLIC_DIR,name),png)
  await run(f.db,'UPDATE history SET image=NULL,description=? WHERE id=1',[
    names.map(name=>`![photo](/uploads/${name})`).join('\n')+'x'.repeat(BOT_IMAGE_SOURCE_LIMIT+1),
  ])
  const response=await f.http.get(`${endpoint}?date=2026-10-25&source=history&limit=1`).set(f.auth)
  expect(response.body.items[0].images).toHaveLength(50)
  expect(response.body.items[0].images_truncated).toBe(true)
  await run(f.db,'UPDATE history SET image=NULL,description=? WHERE id=1',['memory without pictures'])
  const empty=await f.http.get(`${endpoint}?date=2026-10-25&source=history&limit=1`).set(f.auth)
  expect(empty.body.items[0]).toMatchObject({image_url:'',images:[],images_truncated:false})
  expect(empty.body.broadcast_text).toContain('history-1')
})
it('never falls back to article gallery, body or summary pictures when the cover is absent or missing',async()=>{
  const f=await setup()
  for(const cover of [null,'/uploads/missing.png']) {
    await run(f.db,'UPDATE activities SET cover_image=?,images=?,content=?,description=? WHERE id=2',[
      cover,JSON.stringify(['/uploads/album.png']),'![body](/uploads/body.png)'+'x'.repeat(BOT_IMAGE_SOURCE_LIMIT+1),'![summary](/uploads/ref.png)',
    ])
    const response=await f.http.get(`${endpoint}?date=2026-10-25&source=articles&limit=1`).set(f.auth)
    expect(response.body.items[0]).toMatchObject({image_url:'',images:[],images_truncated:false})
    expect(response.body.broadcast_images).toEqual([])
    expect(response.body.broadcast_text).toContain('article-2')
  }
})
it('does not extract images from fenced/inline code or comments and supports reference destinations',()=>{
  expect(embeddedImages([
    '`![inline](/uploads/no.png)`', '<!-- <img src="/uploads/no.png"> -->',
    '~~~md','![fenced](/uploads/no.png)','~~~~',
    '![photo][id]','[id]: </uploads/中文 (1).png> "caption"',
    '![parentheses](/uploads/a\\(b\\).png)', '<IMG SRC=/uploads/body.png>',
  ].join('\n'))).toEqual(['/uploads/中文 (1).png','/uploads/a(b).png','/uploads/body.png'])
})
it('uses a configured public origin and fails clearly for unsafe origin configuration',async()=>{
  const f=await setup()
  for(const origin of ['file:///private','https://user:pass@example.test','https://example.test/private','https://example.test?secret=bad']) {
    f.context.env.BOT_PUBLIC_ASSET_BASE_URL=origin
    expect((await f.http.get(`${endpoint}?date=2026-10-25`).set(f.auth)).status).toBe(503)
  }
})
