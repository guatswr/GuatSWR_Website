import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { describe, expect, it } from 'vitest'
import {
  MAX_PUBLIC_LOG_DETAILS_LENGTH,
  PUBLIC_LOG_DETAILS_OMITTED,
  parseLogQuery,
  parsePublicId,
  readActivity,
  readLogsPage,
} from '../server/utils/public-read'
import type { FixtureLogRow } from './fixtures/public-data.mjs'

const startServer = async (
  handler: (request: IncomingMessage, response: ServerResponse) => boolean,
): Promise<{ apiBase: string, close: () => void }> => {
  const server = createServer((request, response) => {
    if (handler(request, response)) return
    response.statusCode = 404
    response.setHeader('content-type', 'application/json')
    response.end('{"message":"Not Found"}')
  })
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve)
  })
  const { port } = server.address() as AddressInfo
  return {
    apiBase: `http://127.0.0.1:${port}`,
    close: () => {
      server.closeAllConnections()
      server.close()
    },
  }
}

const logRow = (id: number, action: string, details: string): FixtureLogRow => ({
  id,
  username: 'Taropoi',
  action,
  details,
  created_at: '2026-10-19 12:00:00',
  user_id: 1,
  user_avatar: null,
})

const serveLogs = async (rows: FixtureLogRow[]) => startServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1')
  if (url.pathname !== '/api/logs') return false
  response.statusCode = 200
  response.setHeader('content-type', 'application/json')
  response.end(JSON.stringify({ total: rows.length, logs: rows }))
  return true
})

describe('public log description projection', () => {
  it('treats inherited object names as ordinary actions, never as fixed text', async () => {
    const actions = ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf']
    const server = await serveLogs(actions.map((action, index) => logRow(index + 1, action, `内容:${action}`)))
    try {
      const page = await readLogsPage(
        { apiBase: server.apiBase },
        parseLogQuery({ limit: '50' }),
      )
      for (const log of page.logs) {
        expect(typeof log.details).toBe('string')
        expect(log.details).toBe(`内容:${log.action}`)
      }
    }
    finally {
      server.close()
    }
  })

  it('keeps the fixed security text even when the frozen description is huge', async () => {
    const server = await serveLogs([
      logRow(1, 'LOGIN', `登录成功 (IP: 203.0.113.44) ${'Z'.repeat(5_000)}`),
    ])
    try {
      const page = await readLogsPage({ apiBase: server.apiBase }, parseLogQuery({}))
      expect(page.logs[0]?.details).toBe('登录成功')
    }
    finally {
      server.close()
    }
  })

  it('retains a description at the documented bound and replaces an over-bound one', async () => {
    const atBound = '日'.repeat(MAX_PUBLIC_LOG_DETAILS_LENGTH)
    // ASCII, and absent from the Chinese placeholder, so "the oversized text is
    // gone" is provable instead of resting on a character the placeholder itself
    // legitimately contains.
    const overBound = `OVERSIZED-DECOY-MARKER${atBound}OVERSIZED-DECOY-MARKER`
    const server = await serveLogs([
      logRow(1, 'UPDATE_PROFILE', atBound),
      logRow(2, 'UPDATE_PROFILE', overBound),
    ])
    try {
      const page = await readLogsPage({ apiBase: server.apiBase }, parseLogQuery({}))
      const kept = page.logs[0]?.details ?? ''
      const replaced = page.logs[1]?.details ?? ''
      // The at-bound row keeps the whole 4096-character description.
      expect(kept).toBe(atBound)
      expect(kept).toHaveLength(MAX_PUBLIC_LOG_DETAILS_LENGTH)
      // The over-bound row is the placeholder itself: exactly its own length,
      // no decoy marker, and shorter than the input it replaced.
      expect(replaced).toBe(PUBLIC_LOG_DETAILS_OMITTED)
      expect(replaced).toHaveLength(PUBLIC_LOG_DETAILS_OMITTED.length)
      expect(replaced).not.toContain('OVERSIZED-DECOY-MARKER')
      expect(replaced.length).toBeLessThan(overBound.length)
    }
    finally {
      server.close()
    }
  })

  it('redacts a pathological long token ending in padding without non-linear scanning', async () => {
    const token = `${'A'.repeat(4_000)}===`
    const server = await serveLogs([logRow(1, 'UPDATE_PROFILE', `更新 ${token}`)])
    try {
      const page = await readLogsPage({ apiBase: server.apiBase }, parseLogQuery({}))
      expect(page.logs[0]?.details).toBe('更新 [redacted]')
      expect(page.logs[0]?.details).not.toContain('===')
    }
    finally {
      server.close()
    }
  })

  it('does not apply the log-description bound to activity content', async () => {
    const content = '长'.repeat(12_000)
    const server = await startServer((request, response) => {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1')
      if (url.pathname !== '/api/activities/42') return false
      response.statusCode = 200
      response.setHeader('content-type', 'application/json')
      response.end(JSON.stringify({
        id: 42,
        title: '长文活动',
        tag: '',
        date: '2026-01-01',
        description: '',
        content,
        cover_image: '',
        images: '[]',
        created_at: '2026-01-01 12:00:00',
        created_by: 1,
        updated_by: null,
        status: 'published',
        deleted_at: null,
        created_by_name: 'Author',
        created_by_avatar: null,
        updated_by_name: null,
        updated_by_avatar: null,
      }))
      return true
    })
    try {
      const activity = await readActivity({ apiBase: server.apiBase }, parsePublicId('42'))
      expect(activity.content).toHaveLength(12_000)
      expect(activity.content).toBe(content)
    }
    finally {
      server.close()
    }
  })
})
