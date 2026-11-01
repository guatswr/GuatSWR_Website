import { readFile, stat, mkdir, rm, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { Readable } from 'node:stream'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { receiveResourceUpload } from '../server/utils/resource-upload'
import { RESOURCE_UPLOAD_LIMIT } from '../shared/resource-admin'

const input = (chunks: Uint8Array[], headers: Record<string, string> = { 'content-type': 'application/octet-stream' }) =>
  Object.assign(Readable.from(chunks), { headers })
const temporaryRoot = fileURLToPath(new URL('../.data/resource-upload-tests/', import.meta.url))
const receive = (request: ReturnType<typeof input>) => receiveResourceUpload(request, temporaryRoot)
beforeAll(() => mkdir(temporaryRoot, { recursive: true }))
afterAll(() => rm(temporaryRoot, { recursive: true, force: true }))

describe('resource upload temporary storage', () => {
  it('streams bytes to private storage and removes them after forwarding', async () => {
    const bytes = Buffer.from([0, 255, 65, 10])
    const upload = await receive(input([bytes]))
    expect(await readFile(upload.filename)).toEqual(bytes)
    expect(upload.size).toBe(bytes.length)
    await upload.dispose()
    await upload.dispose()
    await expect(stat(upload.filename)).rejects.toMatchObject({ code: 'ENOENT' })
  })
  it('rejects excessive declared lengths and wrong body types', async () => {
    await expect(receive(input([], { 'content-type': 'application/octet-stream', 'content-length': String(RESOURCE_UPLOAD_LIMIT + 1) }))).rejects.toMatchObject({ statusCode: 413 })
    await expect(receive(input([], { 'content-type': 'application/json' }))).rejects.toMatchObject({ statusCode: 415 })
  })
  it('rejects incomplete bodies and still releases the concurrency reservation', async () => {
    await expect(receive(input([Buffer.from('abc')], { 'content-type': 'application/octet-stream', 'content-length': '4' }))).rejects.toMatchObject({ statusCode: 400 })
    const upload = await receive(input([]))
    expect(upload.size).toBe(0)
    await upload.dispose()
  })
  it('enforces the actual byte limit for chunked bodies and cleans rejected files', async () => {
    const chunk = Buffer.alloc(1024 * 1024)
    await expect(receive(input(Array.from({ length: 51 }, () => chunk)))).rejects.toMatchObject({ statusCode: 413 })
    expect(await readdir(temporaryRoot)).toEqual([])
  })
})
