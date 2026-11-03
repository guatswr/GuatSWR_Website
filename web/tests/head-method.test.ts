import type { IncomingMessage, ServerResponse } from 'node:http'
import { describe, expect, it } from 'vitest'
import { createApp, toNodeListener } from 'h3'
import headMiddleware from '../server/middleware/head'

describe('HEAD method support middleware', () => {
  it('rewrites event method from HEAD to GET for router matching', async () => {
    const app = createApp()
    app.use(headMiddleware)

    let handledMethod = ''
    app.use((event) => {
      handledMethod = event.method
      return { ok: true }
    })

    const listener = toNodeListener(app)
    const req = { method: 'HEAD', url: '/api/health', headers: {} } as unknown as IncomingMessage
    const res = {
      setHeader: () => {},
      getHeader: () => {},
      end: () => {},
    } as unknown as ServerResponse

    await listener(req, res)
    expect(handledMethod).toBe('GET')
    expect(req.method).toBe('HEAD')
  })

  it('preserves other HTTP methods untouched', async () => {
    const app = createApp()
    app.use(headMiddleware)

    let handledMethod = ''
    app.use((event) => {
      handledMethod = event.method
      return { ok: true }
    })

    const listener = toNodeListener(app)
    const req = { method: 'POST', url: '/api/login', headers: {} } as unknown as IncomingMessage
    const res = {
      setHeader: () => {},
      getHeader: () => {},
      end: () => {},
    } as unknown as ServerResponse

    await listener(req, res)
    expect(handledMethod).toBe('POST')
  })
})
