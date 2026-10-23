import { expect, it } from 'vitest'
import { fixture } from '../helpers/fixture.mjs'

it('HTTP correlation is generated server side and diagnostics exclude hostile headers/query/body', async () => {
  const lines = []
  const instance = await fixture({ logDestination: { write: text => lines.push(JSON.parse(text)) } })
  const secret = 'synthetic-private-token'
  const forged = '11111111-1111-4111-8111-111111111111'
  const response = await instance.http.post(`/api/auth/login?token=${secret}`)
    .set('x-request-id', forged).set('cookie', `session=${secret}`)
    .send({ username: 'missing', password: secret, twofaPassword: secret, qq: '445566778899' })
  const id = response.headers['x-request-id']
  expect(id).toMatch(/^[a-f\d-]{36}$/)
  expect(id).not.toBe(forged)
  const completed = lines.filter(line => line.event === 'http.completed' && line.requestId === id)
  expect(completed).toHaveLength(1)
  expect(completed[0]).toMatchObject({ method: 'POST', route: '/api/auth/login', status: response.status })
  expect(completed[0].durationMs).toBeGreaterThanOrEqual(0)
  const output = JSON.stringify(lines)
  for (const value of [secret, forged, '445566778899']) expect(output).not.toContain(value)
})

it('tracked failures correlate with a generated task ID and omit error content', async () => {
  const lines = []
  const instance = await fixture({ logDestination: { write: text => lines.push(JSON.parse(text)) } })
  const secret = 'private-error-message-with-token'
  await expect(instance.context.track(() => Promise.reject(Object.assign(new Error(secret), { code: 'SQLITE_BUSY' })))).rejects.toThrow(secret)
  const started = lines.find(line => line.event === 'task.started')
  const failed = lines.find(line => line.event === 'task.failed')
  expect(failed.taskId).toBe(started.taskId)
  expect(failed.code).toBe('SQLITE_BUSY')
  expect(JSON.stringify(lines)).not.toContain(secret)
})

it('audit write failure is observed without throwing or changing a completed mutation', async () => {
  const lines = []
  const instance = await fixture({ logDestination: { write: text => lines.push(JSON.parse(text)) } })
  await new Promise((resolve, reject) => instance.context.logDb.run('DROP TABLE audit_logs', error => error ? reject(error) : resolve()))
  // Failure callback is asynchronous; the business audit API remains fire-and-observe.
  let requestId
  instance.context.logger.request(id => { requestId = id; instance.context.addLog('synthetic', 'TEST', 'private-audit-details') })
  await expect.poll(() => lines.find(line => line.event === 'audit.failed'), { timeout: 1000 }).toMatchObject({ code: 'SQLITE_ERROR', requestId })
  expect(JSON.stringify(lines)).not.toContain('private-audit-details')
})
