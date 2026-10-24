import http from 'node:http'
import net from 'node:net'
import path from 'node:path'
import { createRequire } from 'node:module'
import { expect, it } from 'vitest'
import { fixture } from '../helpers/fixture.mjs'
const require = createRequire(import.meta.url)
const { createMultipartParser } = require('../../dist/src/storage/multipart.js')

it.each([[true, false], [false, true]])('does not parse an already closed request (aborted=%s, destroyed=%s)', async (aborted, destroyed) => {
  const f = await fixture(), socket = new net.Socket(), req = new http.IncomingMessage(socket), res = new http.ServerResponse(req)
  req.headers = { 'content-type': 'multipart/form-data; boundary=guatswr', 'content-length': '100' }
  req.aborted = aborted; res.destroyed = destroyed
  req.pipe = () => { throw new Error('Multipart parsing must not start') }
  const parse = createMultipartParser(f.context.PRIVATE_UPLOADS_DIR).upload.single('file')
  try { expect(() => parse(req, res, () => { throw new Error('Closed request must not continue') })).not.toThrow() }
  finally { socket.destroy() }
  expect(await f.fs.readdir(f.context.PRIVATE_UPLOADS_DIR)).toEqual([])
})

it('holds all eight upload slots until parsed work ends after real TCP clients disconnect', async () => {
  const f = await fixture(), directory = path.join(f.root, 'private-work-ownership')
  await f.fs.mkdir(directory)
  const parser = createMultipartParser(directory), release = Promise.withResolvers(), extra = Promise.withResolvers()
  const starts = Array.from({ length: 9 }, () => Promise.withResolvers()), closes = Array.from({ length: 9 }, () => Promise.withResolvers()), jobs = [], clients = []
  const bytes = Buffer.from('--guatswr\r\nContent-Disposition: form-data; name="file"; filename="safe.png"\r\nContent-Type: image/png\r\n\r\nsynthetic parser fixture\r\n--guatswr--\r\n')
  const server = http.createServer((req, res) => {
    const slot = Number(req.headers['x-slot'])
    res.once('close', () => closes[slot].resolve())
    res.status = function (code) { this.statusCode = code; return this }
    res.json = function (body) { this.end(JSON.stringify(body)); return this }
    parser.upload.single('file')(req, res, error => {
      if (error) { res.status(400).json({ invalid: true }); return }
      jobs.push(release.promise.then(() => { if (!res.destroyed) res.json({ ok: true }) }).finally(async () => {
        if (req.file) await f.fs.unlink(req.file.path).catch(() => {})
        parser.upload.complete?.(req)
      }))
      starts[slot].resolve()
      if (slot === 8) extra.resolve()
    })
  })
  server.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve))
  const send = slot => {
    const result = Promise.withResolvers()
    const client = http.request({ host: '127.0.0.1', port: server.address().port, method: 'POST', agent: false,
      headers: { 'content-type': 'multipart/form-data; boundary=guatswr', 'content-length': bytes.length, 'x-slot': String(slot) } }, response => {
      response.resume(); response.once('end', () => result.resolve(response.statusCode))
    })
    client.on('error', () => {}); client.end(bytes); clients.push(client)
    return result.promise
  }
  try {
    for (let slot = 0; slot < 8; slot++) { void send(slot); await starts[slot].promise; clients[slot].destroy(); await closes[slot].promise }
    expect(await Promise.race([send(8), extra.promise.then(() => 0)])).toBe(429)
    expect(jobs).toHaveLength(8)
    release.resolve(); await Promise.all(jobs)
    expect(await send(8)).toBe(200)
  } finally {
    release.resolve(); clients.forEach(client => client.destroy()); await Promise.all(jobs)
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve))
  }
  expect(await f.fs.readdir(directory)).toEqual([])
})
