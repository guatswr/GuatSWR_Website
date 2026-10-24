import path from 'node:path'
import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { expect, it, vi, onTestFinished } from 'vitest'
import { fixture, get, run, all, token, png } from '../helpers/fixture.mjs'
const require = createRequire(import.meta.url)
const { captureCleanupTargets, enqueueCleanup, processCleanupJob, runCleanupBatch } = require('../../dist/src/storage/cleanup.js')
const command = promisify(execFile)
async function setup() {
  const f = await fixture(), root = path.join(f.root, 'public'), quarantine = path.join(f.root, 'data', 'asset-quarantine')
  const url = '/uploads/img/shared-cleanup.png', filename = path.join(root, 'img', 'shared-cleanup.png')
  await fs.writeFile(filename, png)
  return { f, root, quarantine, url, filename, store: f.context.sql.main }
}
async function queue(f) {
  const targets = await captureCleanupTargets(f.root, [f.url])
  await f.store.transaction(tx => enqueueCleanup(tx, targets))
  return targets[0].id
}
it('purge preserves shared live history image while deleting the soft-deleted member', async () => {
  const c = await setup(), { f, url, filename } = c
  await run(f.db, 'UPDATE members SET avatar=?,deleted_at=CURRENT_TIMESTAMP WHERE id=1', [url])
  await run(f.db, 'UPDATE history SET image=? WHERE id=1', [url])
  const response = await f.http.post('/api/admin/recycle-bin/purge').set('Authorization', `Bearer ${token()}`).send({})
  expect(response.status).toBe(200)
  expect(response.body.result.members).toBe(1)
  expect(await get(f.db, 'SELECT id FROM members WHERE id=1')).toBeUndefined()
  expect(await fs.readFile(filename)).toEqual(png)
  expect(await get(f.db, 'SELECT state FROM asset_cleanup_jobs')).toEqual({ state: 'retained' })
})
it('atomically deletes rows and persists intent, then quarantines original and thumbnail', async () => {
  const c = await setup(), { f, url, filename } = c
  const thumb = filename.replace('.png','-thumb.webp')
  await fs.writeFile(thumb, png)
  await run(f.db, 'UPDATE members SET avatar=?,deleted_at=CURRENT_TIMESTAMP WHERE id=1', [url])
  const response = await f.http.post('/api/admin/recycle-bin/purge').set('Authorization', `Bearer ${token()}`).send({})
  expect(response.status).toBe(200)
  await expect(fs.stat(filename)).rejects.toHaveProperty('code', 'ENOENT')
  await expect(fs.stat(thumb)).rejects.toHaveProperty('code', 'ENOENT')
  const jobs = await all(f.db, 'SELECT id,state FROM asset_cleanup_jobs')
  expect(jobs).toHaveLength(2)
  for (const job of jobs) {
    expect(job.state).toBe('quarantined')
    expect(await fs.readFile(path.join(c.quarantine,job.id))).toEqual(png)
  }
})
it('rolls back the row deletion if intent persistence fails, before moving files', async () => {
  const c = await setup(), { f, url, filename } = c
  await run(f.db, 'UPDATE members SET avatar=?,deleted_at=CURRENT_TIMESTAMP WHERE id=1', [url])
  await new Promise((resolve,reject) => f.db.exec("CREATE TRIGGER reject_intent BEFORE INSERT ON asset_cleanup_jobs BEGIN SELECT RAISE(ABORT,'synthetic failure'); END", e=>e?reject(e):resolve()))
  expect((await f.http.post('/api/admin/recycle-bin/purge').set('Authorization', `Bearer ${token()}`).send({})).status).toBe(500)
  expect(await get(f.db, 'SELECT id FROM members WHERE id=1')).toEqual({ id: 1 })
  expect(await get(f.db, 'SELECT count(*) AS n FROM asset_cleanup_jobs')).toEqual({ n: 0 })
  expect(await fs.readFile(filename)).toEqual(png)
})
it('a retry never moves a replacement file at the same public path', async () => {
  const c = await setup(), id = await queue(c)
  await fs.writeFile(c.filename, 'new publication')
  expect(await processCleanupJob(c.store,c.root,c.quarantine,id)).toBe('obsolete')
  expect(await fs.readFile(c.filename,'utf8')).toBe('new publication')
})
it('reconciles a crash after rename but before acknowledgement and can restore renewed references', async () => {
  const c = await setup(), id = await queue(c)
  await fs.mkdir(c.quarantine,{ recursive:true })
  await fs.rename(c.filename,path.join(c.quarantine,id))
  expect(await processCleanupJob(c.store,c.root,c.quarantine,id)).toBe('quarantined')
  await run(c.f.db,'UPDATE history SET image=? WHERE id=1',[c.url])
  expect(await processCleanupJob(c.store,c.root,c.quarantine,id)).toBe('retained')
  expect(await fs.readFile(c.filename)).toEqual(png)
})
it('records bounded retries on cross-device failure and succeeds on a later run', async () => {
  const c = await setup(), id = await queue(c), rename = fs.rename
  const spy = vi.spyOn(fs,'rename').mockImplementation(async (...args) => {
    if (String(args[0]).toLowerCase() === c.filename.toLowerCase()) throw Object.assign(new Error('synthetic'),{ code:'EXDEV' })
    return rename(...args)
  })
  onTestFinished(()=>spy.mockRestore())
  expect(await runCleanupBatch(c.store,c.root,c.quarantine)).toEqual({ processed:0,failed:1 })
  expect(await c.store.get('SELECT state,attempts,last_error FROM asset_cleanup_jobs')).toEqual({ state:'pending',attempts:1,last_error:'cross_device' })
  spy.mockRestore()
  expect(await runCleanupBatch(c.store,c.root,c.quarantine)).toEqual({ processed:1,failed:0 })
  expect((await c.store.get('SELECT state FROM asset_cleanup_jobs WHERE id=?',[id])).state).toBe('quarantined')
})
it('event permanent deletion is canonicalized, cascades participants and preserves another event reference', async () => {
  const c = await setup(), { f, url, filename } = c
  await run(f.db,'UPDATE events SET content=? WHERE id IN (1,3)',[JSON.stringify({ cover:url })])
  const response = await f.http.delete('/api/admin/events/001').set('Authorization',`Bearer ${token()}`)
  expect(response.status).toBe(200)
  expect(await get(f.db,'SELECT id FROM events WHERE id=1')).toBeUndefined()
  expect(await get(f.db,'SELECT count(*) AS n FROM event_participants WHERE event_id=1')).toEqual({ n:0 })
  expect(await fs.readFile(filename)).toEqual(png)
})
it('cleanup command is dry-run by default and resumes persisted jobs only with explicit apply', async () => {
  const c = await setup(), id = await queue(c), cli = path.resolve('dist/src/storage/cleanup-cli.js')
  const args=[cli,'--main-db',path.join(c.f.root,'data','guatswr_web_main.db'),'--public-dir',c.root,'--quarantine-dir',c.quarantine]
  expect(JSON.parse((await command(process.execPath,args)).stdout)).toEqual({ dryRun:true,jobs:[{ state:'pending',count:1 }] })
  expect(await fs.readFile(c.filename)).toEqual(png)
  expect(JSON.parse((await command(process.execPath,[...args,'--apply'])).stdout)).toEqual({ processed:1,failed:0 })
  expect(await fs.readFile(path.join(c.quarantine,id))).toEqual(png)
})

it('recovers durable intent after a real child process is killed after moving a file', async () => {
  const { spawn } = await import('node:child_process'), { once } = await import('node:events')
  const c = await setup(), id = await queue(c)
  const child = spawn(process.execPath, [path.resolve('tests/helpers/cleanup-crash.cjs'),path.join(c.f.root,'data','guatswr_web_main.db'),c.root,c.quarantine,id],{ stdio:['ignore','pipe','pipe'] })
  onTestFinished(()=>{ if(child.exitCode===null && child.signalCode===null) child.kill('SIGKILL') })
  await new Promise((resolve,reject)=>{
    let text=''
    child.stdout.on('data',chunk=>{ text+=chunk; if(text.includes('RENAMED')) resolve() })
    child.once('error',reject);child.once('exit',()=>reject(new Error('Child exited before rename')))
  })
  const stopped=once(child,'exit');child.kill('SIGKILL');await stopped
  expect((await c.store.get('SELECT state FROM asset_cleanup_jobs WHERE id=?',[id])).state).toBe('pending')
  expect(await processCleanupJob(c.store,c.root,c.quarantine,id)).toBe('quarantined')
  expect(await fs.readFile(path.join(c.quarantine,id))).toEqual(png)
})
it('background cleanup starts after listen and drains persisted work with managed lifecycle', async () => {
  const c=await setup(), id=await queue(c)
  vi.useFakeTimers({ toFake:['setInterval','clearInterval'] })
  const { createApplication }=require('../../src/app.js')
  const other=await createApplication({env:c.f.context.env,paths:{data:c.f.context.DATA_DIR,public:c.root,backups:c.f.context.BACKUP_ROOT},backgroundTasks:true,externalServices:false})
  try {
    expect(other.context.timers.size).toBe(0)
    await other.listen(0,'127.0.0.1')
    expect(other.context.timers.size).toBe(5)
    await vi.advanceTimersByTimeAsync(30000)
    await expect.poll(async()=>(await c.store.get('SELECT state FROM asset_cleanup_jobs WHERE id=?',[id])).state).toBe('quarantined')
  } finally { await other.close();vi.useRealTimers() }
  expect(other.context.timers.size).toBe(0)
})

it('backup fence defers new moves without consuming retries and resumes after the fence is removed', async () => {
  const c=await setup(),id=await queue(c),fence=path.join(c.f.root,'data','.asset-cleanup-fence')
  await fs.mkdir(fence)
  expect(await runCleanupBatch(c.store,c.root,c.quarantine)).toEqual({processed:0,failed:0})
  expect(await processCleanupJob(c.store,c.root,c.quarantine,id)).toBe('pending')
  expect((await c.store.get('SELECT attempts FROM asset_cleanup_jobs WHERE id=?',[id])).attempts).toBe(0)
  expect(await fs.readFile(c.filename)).toEqual(png)
  await fs.rmdir(fence)
  expect(await processCleanupJob(c.store,c.root,c.quarantine,id)).toBe('quarantined')
})
