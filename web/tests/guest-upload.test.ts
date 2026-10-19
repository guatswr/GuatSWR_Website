import { createServer, request as httpRequest } from 'node:http'
import type { IncomingMessage, Server } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { once } from 'node:events'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { H3Event } from 'h3'
import {
  MAX_CONCURRENT_UPLOADS,
  MAX_UPLOAD_BYTES,
  assertImageMagic,
  readGuestUpload
} from '../server/utils/guest-upload'
import type { GuestUpload } from '../server/utils/guest-upload'

/**
 * Genuine HTTP multipart tests: a real Node server pipes real requests into the
 * real parser. Written but not executed in this worktree (busboy resolves after
 * central integration).
 */

const BOUNDARY = '----guestbfftestboundary'
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
)
const GIF = Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(8)])

interface Part {
  name: string
  value: Buffer | string
  filename?: string
  mime?: string
}

function multipart(parts: Part[]): Buffer {
  const chunks: Buffer[] = []
  for (const part of parts) {
    const disposition = part.filename
      ? `Content-Disposition: form-data; name="${part.name}"; filename="${part.filename}"\r\nContent-Type: ${part.mime ?? 'application/octet-stream'}`
      : `Content-Disposition: form-data; name="${part.name}"`
    chunks.push(Buffer.from(`--${BOUNDARY}\r\n${disposition}\r\n\r\n`))
    chunks.push(typeof part.value === 'string' ? Buffer.from(part.value) : part.value)
    chunks.push(Buffer.from('\r\n'))
  }
  chunks.push(Buffer.from(`--${BOUNDARY}--\r\n`))
  return Buffer.concat(chunks)
}

let server: Server
let baseUrl = ''
const sockets = new Set<import('node:net').Socket>()

beforeAll(async () => {
  server = createServer(async (request: IncomingMessage, response) => {
    try {
      // Test-only structural event: the route layer normally supplies this.
      const upload = await readGuestUpload({ node: { req: request } } as unknown as H3Event)
      const path = upload.filePath
      const bytes = await readFile(path)
      const info = { size: upload.size, mimeType: upload.mimeType, fields: upload.fields }
      await upload.dispose()
      const leftover = await stat(path).catch(() => null)
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(
        JSON.stringify({ ok: true, ...info, bytes: bytes.toString('base64'), cleaned: leftover === null })
      )
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode ?? 500
      const code = (error as { code?: string }).code ?? 'unknown'
      response.writeHead(status, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ ok: false, status, code }))
    }
  })
  server.on('connection', (socket) => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  baseUrl = typeof address === 'object' && address ? `http://127.0.0.1:${address.port}` : ''
})

afterAll(async () => {
  for (const socket of sockets) socket.destroy()
  server.close()
  await once(server, 'close')
})

async function post(body: Buffer, headers: Record<string, string> = {}) {
  const response = await fetch(`${baseUrl}/upload`, {
    method: 'POST',
    headers: {
      'content-type': `multipart/form-data; boundary=${BOUNDARY}`,
      'content-length': String(body.length),
      ...headers
    },
    body
  })
  return { status: response.status, json: (await response.json()) as Record<string, unknown> }
}

describe('guest multipart upload', () => {
  it('stores one file part with its exact bytes and always cleans up', async () => {
    const result = await post(
      multipart([
        { name: 'eid', value: '27' },
        { name: 'file', value: PNG, filename: 'avatar.png', mime: 'image/png' }
      ])
    )
    expect(result.status).toBe(200)
    expect(result.json.ok).toBe(true)
    expect(result.json.mimeType).toBe('image/png')
    expect(result.json.size).toBe(PNG.length)
    expect(result.json.fields).toEqual({ eid: '27' })
    expect(result.json.bytes).toBe(PNG.toString('base64'))
    expect(result.json.cleaned).toBe(true)
  })

  it('rejects duplicate, unknown and extra fields plus multiple file parts', async () => {
    const duplicates = await post(
      multipart([
        { name: 'eid', value: '27' },
        { name: 'eid', value: '28' },
        { name: 'file', value: PNG, filename: 'a.png', mime: 'image/png' }
      ])
    )
    expect(duplicates.status).toBe(400)

    const unknown = await post(
      multipart([
        { name: 'eid', value: '27' },
        { name: 'submit', value: 'true' },
        { name: 'file', value: PNG, filename: 'a.png', mime: 'image/png' }
      ])
    )
    expect(unknown.status).toBe(400)

    const twoFiles = await post(
      multipart([
        { name: 'eid', value: '27' },
        { name: 'file', value: PNG, filename: 'a.png', mime: 'image/png' },
        { name: 'file', value: PNG, filename: 'b.png', mime: 'image/png' }
      ])
    )
    expect(twoFiles.status).toBe(400)
  })

  it('rejects a non-allowlisted MIME type and a non-multipart request', async () => {
    const wrongType = await post(
      multipart([{ name: 'file', value: 'plain', filename: 'a.txt', mime: 'text/plain' }])
    )
    expect(wrongType.status).toBe(400)

    const wrongContentType = await fetch(`${baseUrl}/upload`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}'
    })
    expect(wrongContentType.status).toBe(400)
  })

  it('denies a request beyond the concurrency bound before touching the disk', async () => {
    const held = Array.from({ length: MAX_CONCURRENT_UPLOADS }, () =>
      new Promise<number | null>((resolve) => {
        const request = httpRequest(
          {
            host: '127.0.0.1',
            port: Number(new URL(baseUrl).port),
            path: '/upload',
            method: 'POST',
            headers: {
              'content-type': `multipart/form-data; boundary=${BOUNDARY}`,
              'transfer-encoding': 'chunked'
            }
          },
          (response) => resolve(response.statusCode ?? null)
        )
        // Send the multipart preamble but never finish the body.
        request.write(Buffer.from(`--${BOUNDARY}\r\nContent-Disposition: form-data; name="eid"\r\n\r\n27\r\n`))
        request.write(
          Buffer.from(
            `--${BOUNDARY}\r\nContent-Disposition: form-data; name="file"; filename="a.png"\r\nContent-Type: image/png\r\n\r\n`
          )
        )
        request.write(PNG.subarray(0, 4))
        request.on('error', () => resolve(null))
      })
    )
    // Give the four requests time to occupy their slots.
    await new Promise((resolve) => setTimeout(resolve, 150))
    const denied = await post(
      multipart([{ name: 'file', value: PNG, filename: 'a.png', mime: 'image/png' }])
    )
    expect(denied.status).toBe(503)
    expect(denied.json.code).toBe('upload_busy')
    for (const socket of sockets) socket.destroy()
    await Promise.allSettled(held)
  })

  it('rejects a file over the 50 MiB guard instead of buffering it', async () => {
    // The archived guard is a real byte limit, so the test sends real bytes: the
    // parser must stop at the limit, answer 413 and never keep the payload.
    const oversized = Buffer.concat([
      PNG,
      Buffer.alloc(MAX_UPLOAD_BYTES + 1024 * 1024 - PNG.length)
    ])
    const result = await post(
      multipart([{ name: 'file', value: oversized, filename: 'big.png', mime: 'image/png' }])
    )
    expect(result.status).toBe(413)
    expect(result.json.code).toBe('too_large')
    expect(result.json.ok).toBe(false)
  }, 60_000)

  it('treats a file at exactly the guard as truncated, matching busboy', async () => {
    // busboy@1.6.0 emits `limit` as soon as the part *reaches* `fileSize`, so the
    // effective maximum is `MAX_UPLOAD_BYTES - 1`; a file of exactly the guard is
    // truncated and must be refused rather than stored short.
    const atLimit = Buffer.concat([PNG, Buffer.alloc(MAX_UPLOAD_BYTES - PNG.length)])
    const result = await post(
      multipart([{ name: 'file', value: atLimit, filename: 'edge.png', mime: 'image/png' }])
    )
    expect(result.status).toBe(413)
    expect(result.json.code).toBe('too_large')
  }, 60_000)

  it('cleans up when the client aborts mid-body', async () => {
    const settled = new Promise<number | null>((resolve) => {
      const request = httpRequest(
        {
          host: '127.0.0.1',
          port: Number(new URL(baseUrl).port),
          path: '/upload',
          method: 'POST',
          headers: {
            'content-type': `multipart/form-data; boundary=${BOUNDARY}`,
            'transfer-encoding': 'chunked'
          }
        },
        (response) => resolve(response.statusCode ?? null)
      )
      request.write(
        Buffer.from(
          `--${BOUNDARY}\r\nContent-Disposition: form-data; name="file"; filename="a.png"\r\nContent-Type: image/png\r\n\r\n`
        )
      )
      request.write(PNG.subarray(0, 8))
      setTimeout(() => request.destroy(), 50)
      request.on('error', () => resolve(null))
    })
    expect(await settled).toBeNull()

    // The slot is released again: a fresh upload still succeeds.
    const after = await post(
      multipart([{ name: 'file', value: PNG, filename: 'a.png', mime: 'image/png' }])
    )
    expect(after.status).toBe(200)
  })
})

describe('image magic checks', () => {
  const uploadFor = async (bytes: Buffer, mimeType: string): Promise<GuestUpload> => {
    const { mkdtemp, writeFile } = await import('node:fs/promises')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const directory = await mkdtemp(join(tmpdir(), 'guest-magic-'))
    const filePath = join(directory, 'probe')
    await writeFile(filePath, bytes)
    return {
      filePath,
      size: bytes.length,
      mimeType,
      fields: {},
      dispose: async () => {
        const { rm } = await import('node:fs/promises')
        await rm(directory, { recursive: true, force: true })
      }
    }
  }

  it('accepts the frozen formats and rejects mismatched content', async () => {
    const cases: Array<[Buffer, string, boolean]> = [
      [PNG, 'image/png', true],
      [GIF, 'image/gif', true],
      [Buffer.from('RIFF0000WEBPVP8 '), 'image/webp', true],
      [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), 'image/svg+xml', true],
      [Buffer.from([0xff, 0xd8, 0xff, 0xe0]), 'image/jpeg', true],
      [Buffer.from('not an image at all'), 'image/png', false],
      [Buffer.from('<html></html>'), 'image/svg+xml', false],
      [Buffer.alloc(2), 'image/png', false]
    ]
    for (const [bytes, mime, valid] of cases) {
      const upload = await uploadFor(bytes, mime)
      const check = assertImageMagic(upload)
      if (valid) await expect(check, mime).resolves.toBeUndefined()
      else await expect(check, mime).rejects.toMatchObject({ statusCode: 400 })
      await upload.dispose()
    }
  })
})
