import { createRequire } from 'node:module'
import { expect, it } from 'vitest'
const require = createRequire(import.meta.url)
const { createDiagnosticLogger } = require('../../dist/src/diagnostics.js')

it('structured diagnostics omit secrets and untrusted error messages, paths and extra fields', () => {
  let output = ''
  const logger = createDiagnosticLogger({ destination: { write: text => { output += text } } })
  const secret = 'synthetic-secret-must-never-appear'
  logger.error('http.failed', { error: { code: secret, message: secret, stack: secret }, password: secret, token: secret, ip: '203.0.113.2', qq: '123456', route: `/api/${secret}?token=${secret}` })
  expect(output).not.toContain(secret)
  expect(output).not.toContain('203.0.113.2')
  expect(output).not.toContain('123456')
  expect(JSON.parse(output).code).toBe('unexpected_error')
})

it('concurrent request and task contexts preserve their own bounded generated IDs', async () => {
  const lines = []
  const logger = createDiagnosticLogger({ destination: { write: text => lines.push(JSON.parse(text)) } })
  const ids = []
  await Promise.all([1, 2].map(delay => logger.request(async requestId => {
    ids.push(requestId)
    await new Promise(resolve => setTimeout(resolve, delay))
    await logger.task(async () => { await Promise.resolve(); logger.info('task.completed') })
    logger.info('http.completed', { method: 'GET', route: '/api/event/:eid', status: 200, durationMs: 1.2345 })
  })))
  expect(new Set(ids).size).toBe(2)
  expect(lines.filter(line => line.event === 'http.completed').map(line => line.requestId).sort()).toEqual(ids.sort())
  expect(lines.filter(line => line.taskId)).toHaveLength(2)
  expect(lines.every(line => /^[a-f\d-]{36}$/.test(line.requestId))).toBe(true)
})

it('a synchronous diagnostic sink failure cannot throw into a business operation', () => {
  const logger = createDiagnosticLogger({ destination: { write: () => { throw new Error('synthetic full sink') } } })
  expect(() => logger.error('audit.failed', { error: { code: 'SQLITE_FULL' } })).not.toThrow()
})
