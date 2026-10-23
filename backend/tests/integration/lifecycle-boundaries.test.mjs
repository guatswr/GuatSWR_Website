import fs from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import http from 'node:http'
import { expect, it } from 'vitest'
import { fixture } from '../helpers/fixture.mjs'
const require = createRequire(import.meta.url)
const { createApplication } = require('../../src/app.js')
const separate = async (env = {}) => {
  const base = await fixture()
  return createApplication({ env: { ...base.context.env, ...env },
    paths: { data: path.join(base.root, 'extra-data'), public: path.join(base.root, 'extra-public'), backups: path.join(base.root, 'extra-backups') },
    backgroundTasks: false, externalServices: false })
}

it('shutdown terminates registered child processes before releasing resources', async () => {
  const instance = await separate()
  const child = instance.context.trackChild(spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' }))
  const stopped = once(child, 'exit')
  await instance.close()
  await stopped
  expect(child.exitCode !== null || child.signalCode !== null).toBe(true)
})

it('shutdown aborts a tracked outbound webhook using a synthetic local endpoint', async () => {
  const base = await fixture()
  const endpoint = http.createServer(() => {})
  endpoint.listen(0, '127.0.0.1')
  await once(endpoint, 'listening')
  const instance = await createApplication({ env: { ...base.context.env, ASTRBOT_WEBHOOK_URL: `http://127.0.0.1:${endpoint.address().port}`, ASTRBOT_TIMEOUT_MS: '30000' },
    paths: { data: path.join(base.root, 'hook-data'), public: path.join(base.root, 'hook-public'), backups: path.join(base.root, 'hook-backups') },
    backgroundTasks: false, externalServices: true })
  try {
    const received = once(endpoint, 'request')
    const notification = instance.context.bot.notifyMemberAdded({ id: 1, name: 'synthetic' })
    const rejected = expect(notification).rejects.toHaveProperty('name', 'AbortError')
    await received
    await instance.close()
    await rejected
    expect(instance.context.shutdownSignal.aborted).toBe(true)
  } finally {
    await instance.close()
    endpoint.closeAllConnections()
    await new Promise(resolve => endpoint.close(resolve))
  }
})

it('validates configuration before creating any data directory', async () => {
  const instance = await fixture()
  const data = path.join(instance.root, 'must-not-exist')
  await expect(createApplication({ env: { NODE_ENV: 'test', JWT_SECRET: ' ', PORT: '99999' },
    paths: { data, public: path.join(data, 'public'), backups: path.join(data, 'backups') } })).rejects.toThrow('JWT_SECRET')
  await expect(fs.access(data)).rejects.toHaveProperty('code', 'ENOENT')
})

it('bind failure can retry without duplicating scheduled tasks', async () => {
  const instance = await fixture()
  // This fixture is already listening; use a second independent application on its explicit paths.
  const other = await createApplication({ env: instance.context.env,
    paths: { data: path.join(instance.root, 'other-data'), public: path.join(instance.root, 'other-public'), backups: path.join(instance.root, 'other-backups') },
    backgroundTasks: true, externalServices: false })
  try {
    const occupied = Number(new URL(instance.origin).port)
    await expect(other.listen(occupied)).rejects.toHaveProperty('code', 'EADDRINUSE')
    expect(other.context.timers.size).toBe(0)
    const server = await other.listen(0)
    expect(server.address().address).toBe('127.0.0.1')
    expect(other.context.timers.size).toBe(3)
  } finally { await other.close() }
})

it('scheduler startup exceptions reject listen and allow complete cleanup', async () => {
  const instance = await separate()
  // Explicitly opt into background startup on a separate isolated application.
  const running = await createApplication({ env: instance.context.env,
    paths: { data: path.join(instance.context.DATA_DIR, 'nested'), public: path.join(instance.context.PUBLIC_DIR, 'nested'), backups: path.join(instance.context.BACKUP_ROOT, 'nested') },
    backgroundTasks: true, externalServices: false })
  try {
    running.context.startStagingCleanup = () => { throw new Error('synthetic scheduler startup') }
    await expect(running.listen(0)).rejects.toThrow('synthetic scheduler startup')
  } finally {
    await running.close()
    await instance.close()
  }
  expect(running.context.timers.size).toBe(0)
})

it('a failed disposer still closes both databases and every other disposer', async () => {
  const instance = await separate()
  let disposed = false
  instance.context.disposers.push(() => { disposed = true })
  instance.context.disposers.push(() => { throw new Error('synthetic cleanup failure') })
  await expect(instance.close()).rejects.toThrow('Application cleanup failed')
  expect(disposed).toBe(true)
  await expect(new Promise((resolve, reject) => instance.context.db.get('SELECT 1', error => error ? reject(error) : resolve()))).rejects.toHaveProperty('code', 'SQLITE_MISUSE')
})

it('shutdown deadline rejects deterministically while tracked work is pending', async () => {
  const instance = await separate({ SHUTDOWN_TIMEOUT_MS: '100' })
  let release
  const pending = new Promise(resolve => { release = resolve })
  instance.context.track(pending)
  const closed = instance.close()
  await expect(closed).rejects.toHaveProperty('code', 'SHUTDOWN_TIMEOUT')
  expect(instance.context.timers.size).toBe(0)
  release()
  // Wait until the asynchronous cleanup really releases SQLite before fixture removal.
  await new Promise(resolve => {
    const check = () => instance.context.db.get('SELECT 1', error => error?.code === 'SQLITE_MISUSE' ? resolve() : setTimeout(check, 5))
    check()
  })
})
