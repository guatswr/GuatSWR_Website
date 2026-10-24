import path from 'node:path'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import { expect, it, onTestFinished, vi } from 'vitest'
import { fixture, token, run, get } from '../helpers/fixture.mjs'
const require = createRequire(import.meta.url)
const { captureCleanupTargets, enqueueCleanup, processCleanupJob, runCleanupBatch } = require('../../dist/src/storage/cleanup.js')
const config = (f, value, key = 'home_bg') => f.http.post('/api/config').set('Authorization', `Bearer ${token()}`).send({ key, value })
async function staged(f, name = 'prepared.png') {
  const filename = path.join(f.context.UPLOADS_DIR, name), url = '/uploads/upload/' + name
  await f.fs.writeFile(filename, 'synthetic immutable image bytes')
  return { filename, url }
}

it('rotates recovery past retained live-process journals without starving later work', async () => {
  const f = await fixture(), root = path.join(f.context.DATA_DIR, 'asset-publications')
  const journals = Array.from({ length: 21 }, () => ({ version: 1, id: randomUUID(), pid: process.ppid, state: 'preparing', entries: [] }))
  journals.sort((a, b) => a.id.localeCompare(b.id))
  journals.at(-1).state = 'failed'
  for (const journal of journals) await f.fs.writeFile(path.join(root, journal.id + '.json'), JSON.stringify(journal))
  expect(await f.context.storage.publication.recover()).toEqual({ recovered: 0, retained: 20 })
  expect(await f.context.storage.publication.recover()).toEqual({ recovered: 1, retained: 19 })
  expect((await f.fs.readdir(root)).filter(name => name.endsWith('.json'))).toHaveLength(20)
})

it('keeps an existing staging reference readable when the final database mutation rolls back', async () => {
  const f = await fixture(), source = await staged(f)
  await run(f.db, "INSERT INTO site_config(key,value) VALUES('home_bg',?)", [source.url])
  await run(f.db, "CREATE TRIGGER fail_publish BEFORE INSERT ON site_config WHEN NEW.key='home_bg' BEGIN SELECT RAISE(ABORT,'synthetic'); END")
  expect((await config(f, source.url)).status).toBe(500)
  expect((await get(f.db, "SELECT value FROM site_config WHERE key='home_bg'")).value).toBe(source.url)
  expect(await f.fs.readFile(source.filename, 'utf8')).toBe('synthetic immutable image bytes')
  expect((await f.http.get(source.url)).status).toBe(200)
  const job = await get(f.db, "SELECT * FROM asset_cleanup_jobs WHERE url='/uploads/img/bg/home/prepared.png'")
  expect(job.state).toBe('quarantined')
  expect(await f.fs.readFile(path.join(f.context.DATA_DIR, 'asset-quarantine', job.id), 'utf8')).toBe('synthetic immutable image bytes')
})

it.each(['history', 'members', 'activities', 'event', 'profile'])('preserves an existing %s file reference through a native database failure', async domain => {
  const f = await fixture(), source = await staged(f)
  let request, expected
  if (domain === 'history') {
    await run(f.db, 'UPDATE history SET image=? WHERE id=1', [source.url])
    expected = () => get(f.db, 'SELECT image AS value FROM history WHERE id=1')
    request = () => f.http.put('/api/history/1').send({ date: '2026-01-01', title: 'rollback', image: source.url })
  } else if (domain === 'members') {
    await run(f.db, 'UPDATE members SET avatar=? WHERE id=1', [source.url])
    expected = () => get(f.db, 'SELECT avatar AS value FROM members WHERE id=1')
    request = () => f.http.put('/api/members/1').send({ name: 'rollback', role: 'member', avatar: source.url })
  } else if (domain === 'activities') {
    await run(f.db, 'UPDATE activities SET cover_image=? WHERE id=1', [source.url])
    expected = () => get(f.db, 'SELECT cover_image AS value FROM activities WHERE id=1')
    request = () => f.http.put('/api/activities/1').send({ title: 'rollback', tag: 'STG', date: '2026-01-01', cover_image: source.url })
  } else if (domain === 'event') {
    await run(f.db, 'UPDATE events SET content=? WHERE id=1', [JSON.stringify({ cover: source.url })])
    expected = async () => ({ value: JSON.parse((await get(f.db, 'SELECT content FROM events WHERE id=1')).content).cover })
    request = () => f.http.put('/api/event/1').send({ content: { cover: source.url } })
  } else {
    await run(f.db, 'UPDATE users SET avatar=? WHERE id=2', [source.url])
    expected = () => get(f.db, 'SELECT avatar AS value FROM users WHERE id=2')
    request = () => f.http.put('/api/auth/profile').send({ avatar: source.url })
  }
  const table = domain === 'event' ? 'events' : domain === 'profile' ? 'users' : domain
  await run(f.db, `CREATE TRIGGER fail_asset_mutation BEFORE UPDATE ON ${table} BEGIN SELECT RAISE(ABORT,'synthetic'); END`)
  expect((await request().set('Authorization', `Bearer ${token(2, 'admin')}`)).status).toBe(500)
  expect((await expected()).value).toBe(source.url)
  expect(await f.fs.readFile(source.filename, 'utf8')).toBe('synthetic immutable image bytes')
  expect((await f.http.get(source.url)).status).toBe(200)
})

it('retains shared staging originals, including references in recoverable soft-deleted rows', async () => {
  const f = await fixture(), source = await staged(f)
  await run(f.db, "UPDATE members SET avatar=?,deleted_at='2026-01-01' WHERE id=1", [source.url])
  expect((await config(f, source.url)).status).toBe(200)
  const value = (await get(f.db, "SELECT value FROM site_config WHERE key='home_bg'")).value
  expect(value).toBe('/uploads/img/bg/home/prepared.png')
  expect(await f.fs.readFile(f.context.storage.resolveUploadsPath(value), 'utf8')).toBe('synthetic immutable image bytes')
  expect(await f.fs.readFile(source.filename, 'utf8')).toBe('synthetic immutable image bytes')
  expect((await get(f.db, 'SELECT state FROM asset_cleanup_jobs WHERE url=?', [source.url])).state).toBe('retained')
})

it('publishes same-name copies exclusively and never overwrites the concurrent winner', async () => {
  const f = await fixture(), arrived = Promise.withResolvers(), release = Promise.withResolvers()
  for (const folder of ['a', 'b']) { await f.fs.mkdir(path.join(f.context.UPLOADS_DIR, folder)); await f.fs.writeFile(path.join(f.context.UPLOADS_DIR, folder, 'collision.png'), 'bytes-' + folder) }
  let waiting = 0
  const link = fs.link
  const barrier = vi.spyOn(fs, 'link').mockImplementation(async (source, target) => {
    if (path.basename(String(target)) === 'collision.png' && path.dirname(String(target)) === f.context.storage.getConfigDir('home_bg') && waiting < 2) {
      waiting++; if (waiting === 2) arrived.resolve(); await release.promise
    }
    return link(source, target)
  })
  const save = (folder, key) => f.context.storage.publication.publish(['/uploads/upload/' + folder + '/collision.png'],
    () => f.context.storage.moveStagedFile('/uploads/upload/' + folder + '/collision.png', f.context.storage.getConfigDir('home_bg')),
    async (url, tx) => { await tx.run('INSERT OR REPLACE INTO site_config(key,value) VALUES(?,?)', [key, url]); return { url, folder } })
  const outcomes = Promise.allSettled([save('a', 'home_bg'), save('b', 'join_bg')])
  try { await arrived.promise; release.resolve(); const result = await outcomes
    expect(result.filter(value => value.status === 'fulfilled')).toHaveLength(1)
    expect(result.filter(value => value.status === 'rejected')).toHaveLength(1)
    const winner = result.find(value => value.status === 'fulfilled').value
    expect(await f.fs.readFile(f.context.storage.resolveUploadsPath(winner.url), 'utf8')).toBe('bytes-' + winner.folder)
    const loser = winner.folder === 'a' ? 'b' : 'a'
    expect(await f.fs.readFile(path.join(f.context.UPLOADS_DIR, loser, 'collision.png'), 'utf8')).toBe('bytes-' + loser)
  } finally { release.resolve(); await outcomes; barrier.mockRestore() }
})

it('rolls back business data if the source-cleanup intent cannot join the same commit', async () => {
  const f = await fixture(), source = await staged(f)
  await run(f.db, "CREATE TRIGGER fail_publish_intent BEFORE INSERT ON asset_cleanup_jobs WHEN NEW.url='/uploads/upload/prepared.png' BEGIN SELECT RAISE(ABORT,'synthetic'); END")
  expect((await config(f, source.url)).status).toBe(500)
  expect(await get(f.db, "SELECT value FROM site_config WHERE key='home_bg'")).toBeUndefined()
  expect(await f.fs.readFile(source.filename, 'utf8')).toBe('synthetic immutable image bytes')
  expect((await get(f.db, "SELECT COUNT(*) AS n FROM asset_cleanup_jobs WHERE url='/uploads/upload/prepared.png'")).n).toBe(0)
})

it('never removes a replacement file at a prepared destination after metadata validation fails', async () => {
  const f = await fixture(), source = await staged(f)
  let destination
  await expect(f.context.storage.publication.publish([source.url], async () => {
    const url = await f.context.storage.moveStagedFile(source.url, f.context.storage.getConfigDir('home_bg'))
    destination = f.context.storage.resolveUploadsPath(url)
    await f.fs.rename(destination, destination + '.owned-copy')
    await f.fs.writeFile(destination, 'replacement must remain')
    return url
  }, (value, tx) => tx.run("INSERT OR REPLACE INTO site_config(key,value) VALUES('home_bg',?)", [value]))).rejects.toHaveProperty('status', 409)
  expect(await get(f.db, "SELECT value FROM site_config WHERE key='home_bg'")).toBeUndefined()
  expect(await f.fs.readFile(destination, 'utf8')).toBe('replacement must remain')
  expect(await f.fs.readFile(source.filename, 'utf8')).toBe('synthetic immutable image bytes')
})

it('does not commit a file URL after a concurrent cleanup quarantines its prepared copy', async () => {
  const f = await fixture(), source = await staged(f), prepared = Promise.withResolvers(), release = Promise.withResolvers()
  let url
  const saving = f.context.storage.publication.publish([source.url], async () => {
    url = await f.context.storage.moveStagedFile(source.url, f.context.storage.getConfigDir('home_bg'))
    prepared.resolve(); await release.promise; return url
  }, (value, tx) => tx.run("INSERT OR REPLACE INTO site_config(key,value) VALUES('home_bg',?)", [value]))
  const rejected = expect(saving).rejects.toHaveProperty('status', 409)
  await prepared.promise
  try {
    const targets = await captureCleanupTargets(f.context.PUBLIC_DIR, [url])
    await f.context.sql.main.transaction(tx => enqueueCleanup(tx, targets))
    await processCleanupJob(f.context.sql.main, f.context.PUBLIC_DIR, path.join(f.context.DATA_DIR, 'asset-quarantine'), targets[0].id)
  } finally { release.resolve() }
  await rejected
  expect(await get(f.db, "SELECT value FROM site_config WHERE key='home_bg'")).toBeUndefined()
  expect(await f.fs.readFile(source.filename, 'utf8')).toBe('synthetic immutable image bytes')
})

it('observes nested existing file references before a concurrent cleanup can remove them', async () => {
  const f = await fixture(), filename = path.join(f.context.IMG_ROOT_DIR, 'observed.png'), url = '/uploads/img/observed.png'
  await f.fs.writeFile(filename, 'observed bytes')
  const entered = Promise.withResolvers(), release = Promise.withResolvers()
  const saving = f.context.storage.publication.publish([{ nested: [url] }], async () => { entered.resolve(); await release.promise; return url },
    (value, tx) => tx.run("INSERT OR REPLACE INTO site_config(key,value) VALUES('home_bg',?)", [value]))
  const rejected = expect(saving).rejects.toHaveProperty('status', 409)
  await entered.promise
  try {
    const targets = await captureCleanupTargets(f.context.PUBLIC_DIR, [url])
    await f.context.sql.main.transaction(tx => enqueueCleanup(tx, targets))
    await processCleanupJob(f.context.sql.main, f.context.PUBLIC_DIR, path.join(f.context.DATA_DIR, 'asset-quarantine'), targets[0].id)
  } finally { release.resolve() }
  await rejected
  expect(await get(f.db, "SELECT value FROM site_config WHERE key='home_bg'")).toBeUndefined()
})

it('retains a spaced filename referenced by quoted HTML content in another row', async () => {
  const f = await fixture(), url = '/uploads/img/space image.png', filename = path.join(f.context.IMG_ROOT_DIR, 'space image.png')
  await f.fs.writeFile(filename, 'shared spaced image')
  await run(f.db, 'UPDATE activities SET content=? WHERE id=1', ['<img src="' + url + '">'])
  const targets = await captureCleanupTargets(f.context.PUBLIC_DIR, [url])
  await f.context.sql.main.transaction(tx => enqueueCleanup(tx, targets))
  expect(await processCleanupJob(f.context.sql.main, f.context.PUBLIC_DIR, path.join(f.context.DATA_DIR, 'asset-quarantine'), targets[0].id)).toBe('retained')
  expect(await f.fs.readFile(filename, 'utf8')).toBe('shared spaced image')
})

it('expires only unreferenced public staging into quarantine and keeps ambiguous directories/private files', async () => {
  const f = await fixture(), saved = await staged(f, 'saved.png'), unused = await staged(f, 'unused.png')
  for (const source of [saved, unused]) await f.fs.utimes(source.filename, new Date(0), new Date(0))
  await run(f.db, "INSERT INTO site_config(key,value) VALUES('home_bg',?)", [saved.url])
  const nested = path.join(f.context.UPLOADS_DIR, 'legacy-directory')
  await f.fs.mkdir(nested); await f.fs.writeFile(path.join(nested, 'keep'), 'retain directory')
  const unknown = path.join(f.context.PRIVATE_UPLOADS_DIR, 'operator-file.txt')
  await f.fs.writeFile(unknown, 'retain unrecognized private file'); await f.fs.utimes(unknown, new Date(0), new Date(0))
  await f.context.storage.cleanupStaging(48 * 3600000)
  expect(await f.fs.readFile(saved.filename, 'utf8')).toBe('synthetic immutable image bytes')
  await expect(f.fs.stat(unused.filename)).rejects.toHaveProperty('code', 'ENOENT')
  expect((await get(f.db, 'SELECT state FROM asset_cleanup_jobs WHERE url=?', [unused.url])).state).toBe('quarantined')
  expect(await f.fs.readFile(path.join(nested, 'keep'), 'utf8')).toBe('retain directory')
  expect(await f.fs.readFile(unknown, 'utf8')).toBe('retain unrecognized private file')
})

it('uses the miscellaneous directory for owner-only prototype-named config keys', async () => {
  const f = await fixture(), source = await staged(f)
  expect((await config(f, source.url, 'constructor')).status).toBe(200)
  expect((await get(f.db, "SELECT value FROM site_config WHERE key='constructor'")).value).toBe('/uploads/img/assets/misc/prepared.png')
})

it('does not enqueue referenced staging repeatedly or duplicate a pending expiry behind a fence', async () => {
  const f = await fixture(), saved = await staged(f, 'saved.png'), unused = await staged(f, 'unused.png')
  for (const source of [saved, unused]) await f.fs.utimes(source.filename, new Date(0), new Date(0))
  await run(f.db, "INSERT INTO site_config(key,value) VALUES('home_bg',?)", [saved.url])
  const fence = path.join(f.context.DATA_DIR, '.asset-cleanup-fence')
  await f.fs.mkdir(fence)
  try {
    await f.context.storage.cleanupStaging(48 * 3600000); await f.context.storage.cleanupStaging(48 * 3600000)
    expect((await get(f.db, 'SELECT COUNT(*) AS n FROM asset_cleanup_jobs WHERE url=?', [saved.url])).n).toBe(0)
    expect((await get(f.db, 'SELECT COUNT(*) AS n FROM asset_cleanup_jobs WHERE url=?', [unused.url])).n).toBe(1)
  } finally { await f.fs.rmdir(fence) }
})

it('retains an incomplete unowned temporary rather than guessing its restored file identity', async () => {
  const f = await fixture(), { randomUUID } = await import('node:crypto'), id = randomUUID()
  const temporary = 'img/.asset-prepare-' + randomUUID() + '.tmp'
  const filename = path.join(f.context.PUBLIC_DIR, ...temporary.split('/'))
  await f.fs.writeFile(filename, 'incomplete derived bytes')
  await f.fs.writeFile(path.join(f.context.DATA_DIR, 'asset-publications', id + '.json'), JSON.stringify({ version: 1, id, pid: process.pid, state: 'failed', entries: [{ target: 'img/not-published.png', temporary, targetJob: randomUUID(), temporaryJob: randomUUID() }] }))
  expect((await f.context.storage.publication.recover()).retained).toBe(1)
  expect(await f.fs.readFile(filename, 'utf8')).toBe('incomplete derived bytes')
  expect((await f.http.get('/uploads/' + temporary)).status).toBe(404)
})

it('bounds unique local input references before filesystem preparation or a business write', async () => {
  const f = await fixture()
  let prepared = false, saved = false
  await expect(f.context.storage.publication.publish([Array.from({ length: 1025 }, (_, i) => '/uploads/upload/missing-' + i + '.png')], async () => { prepared = true }, async () => { saved = true })).rejects.toHaveProperty('status', 413)
  expect(prepared).toBe(false); expect(saved).toBe(false)
})

it.each(['prepared', 'committed'])('reconciles a real process killed after publication is %s', async phase => {
  const f = await fixture(), source = await staged(f, 'crash.png')
  const child = spawn(process.execPath, [path.resolve('tests/helpers/publication-crash.cjs'), f.context.DATA_DIR, f.context.PUBLIC_DIR, f.context.BACKUP_ROOT, phase], { stdio: ['ignore', 'pipe', 'pipe'] })
  const exited = once(child, 'exit')
  onTestFinished(() => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL') })
  await new Promise((resolve, reject) => {
    let output = ''
    child.stdout.on('data', data => { output += data; if (output.includes(phase === 'prepared' ? 'PREPARED' : 'COMMITTED')) resolve() })
    child.once('exit', () => reject(new Error('Publication child exited before the failure barrier')))
  })
  expect((await f.context.storage.publication.recover()).retained).toBe(1)
  child.kill('SIGKILL'); await exited
  expect((await f.context.storage.publication.recover()).recovered).toBe(1)
  await runCleanupBatch(f.context.sql.main, f.context.PUBLIC_DIR, path.join(f.context.DATA_DIR, 'asset-quarantine'))
  const row = await get(f.db, "SELECT value FROM site_config WHERE key='home_bg'")
  if (phase === 'prepared') {
    expect(row).toBeUndefined()
    expect(await f.fs.readFile(source.filename, 'utf8')).toBe('synthetic immutable image bytes')
  } else {
    expect(row.value).toBe('/uploads/img/bg/home/crash.png')
    expect(await f.fs.readFile(f.context.storage.resolveUploadsPath(row.value), 'utf8')).toBe('synthetic immutable image bytes')
  }
  expect((await f.context.storage.publication.recover()).recovered).toBe(0)
})
