#!/usr/bin/env node
// Reproducible baseline benchmark for GuatSWR website stability reform.
// Measures public page latency, SQLite write contention, BFF session verification overhead,
// event loop delay, memory, CPU and WAL growth across concurrency tiers and session scale tiers.

import assert from 'node:assert/strict'
import { execSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { monitorEventLoopDelay, performance } from 'node:perf_hooks'
import { parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '../..')
const jiti = createJiti(import.meta.url)

// 1x1 PNG fixture for avatars and uploads
const PNG_BUFFER = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==', 'base64')
const BRIDGE_SECRET = 'synthetic-bridge-secret-at-least-32-chars-long'

function percentile(values, ratio) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))
  return Number(sorted[index].toFixed(3))
}

function computeStats(values) {
  if (values.length === 0) {
    return { count: 0, p50: 0, p95: 0, p99: 0, min: 0, max: 0, mean: 0 }
  }
  const sum = values.reduce((acc, val) => acc + val, 0)
  return {
    count: values.length,
    p50: percentile(values, 0.50),
    p95: percentile(values, 0.95),
    p99: percentile(values, 0.99),
    min: Number(Math.min(...values).toFixed(3)),
    max: Number(Math.max(...values).toFixed(3)),
    mean: Number((sum / values.length).toFixed(3)),
  }
}

async function getDirSizes(dirPath) {
  let bytes = 0
  let files = 0
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name)
      if (entry.isDirectory()) {
        const sub = await getDirSizes(fullPath)
        bytes += sub.bytes
        files += sub.files
      } else if (entry.isFile()) {
        const st = await fs.stat(fullPath)
        bytes += st.size
        files += 1
      }
    }
  } catch {
    // Ignore read errors for transient files
  }
  return { bytes, files }
}

async function getWalSizes(dataDir) {
  const result = {}
  try {
    const files = await fs.readdir(dataDir)
    for (const f of files) {
      if (f.endsWith('-wal') || f.endsWith('.sqlite-wal') || f.endsWith('-shm')) {
        const st = await fs.stat(path.join(dataDir, f))
        result[f] = st.size
      }
    }
  } catch {
    // Directory may be absent
  }
  return result
}

function parseCli() {
  const { values } = parseArgs({
    options: {
      warmup: { type: 'string', default: '30' },
      duration: { type: 'string', default: '60' },
      rounds: { type: 'string', default: '3' },
      concurrencies: { type: 'string', default: '1,5,20' },
      seed: { type: 'string', default: '42' },
      output: { type: 'string', default: path.join(REPO_ROOT, '.tools/performance/baseline.json') },
      quick: { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
    strict: false,
  })

  if (values.help) {
    console.log(`
Usage: node scripts/performance/benchmark.mjs [options]
  --warmup <seconds>       Warmup duration (default: 30)
  --duration <seconds>     Measurement duration per run (default: 60)
  --rounds <count>         Repetition count per group (default: 3)
  --concurrencies <list>   Comma-separated concurrency tiers (default: 1,5,20)
  --seed <number>          Random seed (default: 42)
  --output <path>          Output JSON path (default: .tools/performance/baseline.json)
  --quick                  Quick verification mode (warmup=2s, duration=5s, rounds=3)
`)
    process.exit(0)
  }

  const quick = values.quick
  const warmupSec = quick ? 2 : Math.max(1, parseInt(values.warmup, 10) || 30)
  const durationSec = quick ? 5 : Math.max(2, parseInt(values.duration, 10) || 60)
  const rounds = Math.max(3, parseInt(values.rounds, 10) || 3)
  const concurrencies = (values.concurrencies || '1,5,20')
    .split(',')
    .map(s => parseInt(s.trim(), 10))
    .filter(n => Number.isFinite(n) && n > 0)
  const seed = parseInt(values.seed, 10) || 42
  const outputPath = path.resolve(values.output)

  return { warmupSec, durationSec, rounds, concurrencies, seed, outputPath, quick }
}

async function setupIsolatedEnvironment(tempRoot) {
  const paths = {
    data: path.join(tempRoot, 'data'),
    public: path.join(tempRoot, 'public'),
    backups: path.join(tempRoot, 'backups'),
    bffState: path.join(tempRoot, 'bff_state'),
  }
  await fs.mkdir(paths.data, { recursive: true })
  await fs.mkdir(paths.public, { recursive: true })
  await fs.mkdir(paths.backups, { recursive: true })
  await fs.mkdir(paths.bffState, { recursive: true })

  const env = {
    NODE_ENV: 'test',
    JWT_SECRET: 'synthetic-baseline-secret-at-least-32-chars-long',
    TRUST_PROXY_CIDRS: '127.0.0.1/32',
    BFF_STATE_DIR: paths.bffState,
    BFF_BRIDGE_SECRET: BRIDGE_SECRET,
  }

  // Initialize SQLite database schemas
  const { initializeDatabases } = jiti(path.join(REPO_ROOT, 'backend/scripts/initialize-databases.cjs'))
  await initializeDatabases(env, paths)

  // Start backend application
  const { createApplication } = jiti(path.join(REPO_ROOT, 'backend/dist/src/app.js'))
  const app = await createApplication({
    env,
    paths,
    backgroundTasks: false,
    externalServices: false,
  })
  const server = await app.listen(0, '127.0.0.1')
  const port = server.address().port
  const origin = `http://127.0.0.1:${port}`

  // Seed baseline business data: 1000 activities, 1000 members, 1 event, 1 admin
  const bcrypt = jiti('bcryptjs')
  const passwordHash = bcrypt.hashSync('synthetic-baseline-pass', 10)
  const mainSql = app.context.sql.main

  await mainSql.transaction(async (tx) => {
    await tx.run('INSERT INTO users(id, username, password, role) VALUES(1, ?, ?, ?)', [
      'baseline-admin',
      passwordHash,
      'super_admin',
    ])
    for (let i = 1; i <= 1000; i++) {
      await tx.run(
        "INSERT INTO activities(id, title, tag, date, images, status, description) VALUES(?, ?, 'STG', '2026-01-01', '[]', 'published', ?)",
        [i, `Synthetic Activity ${i}`, `Synthetic baseline description content for activity ${i}`]
      )
      await tx.run(
        "INSERT INTO members(id, name, role, tags) VALUES(?, ?, 'member', '[]')",
        [i, `Synthetic Member ${i}`]
      )
    }
    await tx.run(
      "INSERT INTO events(id, type, title, status, content) VALUES(1, 'STG', 'Synthetic Baseline Tournament', 'published', '{}')"
    )
  })

  // Put a PNG avatar fixture
  await fs.writeFile(path.join(paths.public, 'avatar.png'), PNG_BUFFER)

  // Generate an admin JWT
  const jwt = jiti('jsonwebtoken')
  const adminToken = jwt.sign(
    { id: 1, token_version: 0, user_token_version: 0 },
    env.JWT_SECRET,
    { expiresIn: '24h' }
  )

  return { app, server, origin, paths, env, adminToken }
}

async function seedBffSessions(sessionStore, count, tokenKey, adminToken) {
  const { createSessionRecord } = jiti(path.join(REPO_ROOT, 'web/server/utils/bff-session.ts'))
  const now = Date.now()
  const sessions = []

  for (let i = 0; i < count; i++) {
    const sessionId = `bench_session_${i}_${randomBytes(16).toString('hex')}`
    const record = createSessionRecord({
      sessionId,
      identity: { id: 1, username: 'baseline-admin', role: 'super_admin', avatar: '/avatar.png' },
      token: adminToken,
      upstreamExpiresAt: now + 24 * 3600 * 1000,
      now,
      tokenKey,
    })
    sessionStore.set(record)
    sessions.push(sessionId)
  }
  return sessions
}

async function runWorkerPool({ count, concurrency, taskFn, abortSignal }) {
  const latencies = []
  let completed = 0
  let failures = 0
  let nextIndex = 0

  async function worker() {
    while (nextIndex < count && !abortSignal?.aborted) {
      const idx = nextIndex++
      const start = performance.now()
      try {
        await taskFn(idx)
        latencies.push(performance.now() - start)
      } catch (err) {
        if (failures === 0) {
          console.error(`Task failure at idx ${idx}: ${err?.message || err}`)
        }
        failures++
      }
      completed++
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, count) }, () => worker())
  await Promise.all(workers)

  return { latencies, completed, failures }
}

async function main() {
  const cli = parseCli()
  console.log(`Starting GuatSWR baseline benchmark:
  - Revision: ${execSync('git rev-parse HEAD', { cwd: REPO_ROOT }).toString().trim()}
  - Warmup: ${cli.warmupSec}s, Measurement: ${cli.durationSec}s, Rounds: ${cli.rounds}
  - Concurrency tiers: ${cli.concurrencies.join(', ')}
  - Mode: ${cli.quick ? 'quick' : 'standard'}
`)

  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'guatswr-baseline-'))
  const envContext = await setupIsolatedEnvironment(tempRoot)
  const { app, origin, paths, adminToken } = envContext

  const gitRev = execSync('git rev-parse HEAD', { cwd: REPO_ROOT }).toString().trim()
  const gitBranch = execSync('git branch --show-current', { cwd: REPO_ROOT }).toString().trim()

  const machineInfo = {
    platform: process.platform,
    arch: process.arch,
    release: os.release(),
    cpus: os.cpus().length,
    cpuModel: os.cpus()[0]?.model || 'unknown',
    totalMemoryBytes: os.totalmem(),
    freeMemoryBytes: os.freemem(),
    nodeVersion: process.version,
  }

  const bffSessionMod = jiti(path.join(REPO_ROOT, 'web/server/utils/bff-session.ts'))
  const bffAuthMod = jiti(path.join(REPO_ROOT, 'web/server/utils/bff-auth-service.ts'))
  const bffUpstreamMod = jiti(path.join(REPO_ROOT, 'web/server/utils/bff-upstream.ts'))
  const guestDraftsMod = jiti(path.join(REPO_ROOT, 'web/server/utils/guest-drafts.ts'))

  const sessionSecret = '0123456789abcdef0123456789abcdef0123456789abcdef'
  const tokenKey = bffSessionMod.derivePurposeKey(sessionSecret, bffSessionMod.UPSTREAM_TOKEN_PURPOSE)

  let clientIpSeq = 0
  const realUpstream = bffUpstreamMod.createFixedUpstreamClient({
    origin,
    routes: bffUpstreamMod.UPSTREAM_ROUTES,
  })
  const upstreamClient = {
    async request(opts) {
      return realUpstream.request({
        ...opts,
        clientIp: opts.clientIp || `198.51.100.${(clientIpSeq++ % 200) + 1}`,
      })
    },
  }

  const results = {
    metadata: {
      timestamp: new Date().toISOString(),
      revision: gitRev,
      branch: gitBranch,
      machine: machineInfo,
      options: cli,
      productionScaleAggregates: {
        status: 'production_database_not_connected',
        note: '生产数据库凭据在本地隔离环境中不可用，实际业务表聚合结果缺失，已采用受控合成数据基线。',
      },
      seedData: {
        activities: 1000,
        members: 1000,
        events: 1,
        users: 1,
      },
    },
    workloads: {},
  }

  // Define session scale tiers to benchmark
  const sessionTiers = [
    { label: 'small_sessions', count: 100, maxEntries: 1000 },
    { label: 'stress_10k_sessions', count: 10_000, maxEntries: 12_000 },
  ]

  try {
    for (const sessionTier of sessionTiers) {
      console.log(`\n========================================`)
      console.log(`Session Scale Tier: ${sessionTier.label} (${sessionTier.count} sessions)`)
      console.log(`========================================`)

      // Create isolated durable store for this tier
      const tierBffDir = path.join(paths.bffState, sessionTier.label)
      await fs.mkdir(tierBffDir, { recursive: true })
      process.env.BFF_STATE_DIR = tierBffDir

      const sessionStore = bffSessionMod.createMemorySessionStore({
        secret: sessionSecret,
        maxEntries: sessionTier.maxEntries,
      })

      console.log(`Pre-seeding ${sessionTier.count} durable sessions into SQLite...`)
      const seedStart = performance.now()
      const sessionIds = await seedBffSessions(sessionStore, sessionTier.count, tokenKey, adminToken)
      console.log(`Seeded ${sessionIds.length} sessions in ${(performance.now() - seedStart).toFixed(1)}ms (Store size: ${sessionStore.size()})`)

      const authService = bffAuthMod.createBffAuthService({
        store: sessionStore,
        upstream: upstreamClient,
        secret: sessionSecret,
        now: () => Date.now(),
      })

      const guestKey = Buffer.from('guest-draft-benchmark-secret-key-at-least-32-chars')
      const guestStore = guestDraftsMod.createGuestDraftStore(guestKey, {
        namespace: `bench-${sessionTier.label}`,
      })

      results.workloads[sessionTier.label] = {}

      // 1. Benchmark Auth Verify (Unchanged Identity)
      // Measures sync SQLite write + full sweep overhead when verify() runs repeatedly
      console.log(`\n--- Workload: Auth Verify Unchanged ---`)
      results.workloads[sessionTier.label].authVerifyUnchanged = {}

      for (const concurrency of cli.concurrencies) {
        const roundMeasurements = []
        for (let round = 1; round <= cli.rounds; round++) {
          const loopDelay = monitorEventLoopDelay({ resolution: 10 })
          loopDelay.enable()
          const startRss = process.memoryUsage().rss
          const startTime = performance.now()

          let requestsTarget = concurrency * 10 * (cli.quick ? 2 : 5)
          let pickIdx = 0
          const outcome = await runWorkerPool({
            count: requestsTarget,
            concurrency,
            taskFn: async () => {
              const sid = sessionIds[pickIdx++ % sessionIds.length]
              const res = await authService.verify(sid)
              assert.equal(res.identity.id, 1)
            },
          })

          loopDelay.disable()
          const endRss = process.memoryUsage().rss
          const stats = computeStats(outcome.latencies)

          roundMeasurements.push({
            round,
            concurrency,
            stats,
            failures: outcome.failures,
            wallDurationMs: Number((performance.now() - startTime).toFixed(2)),
            eventLoopDelayMs: {
              p50: Number((loopDelay.percentile(50) / 1e6).toFixed(3)),
              p95: Number((loopDelay.percentile(95) / 1e6).toFixed(3)),
              p99: Number((loopDelay.percentile(99) / 1e6).toFixed(3)),
            },
            rssBytes: { start: startRss, end: endRss },
          })
        }

        // Compute median across rounds
        const medianP50 = percentile(roundMeasurements.map(r => r.stats.p50), 0.5)
        const medianP95 = percentile(roundMeasurements.map(r => r.stats.p95), 0.5)
        const medianP99 = percentile(roundMeasurements.map(r => r.stats.p99), 0.5)
        const medianLoopP99 = percentile(roundMeasurements.map(r => r.eventLoopDelayMs.p99), 0.5)

        results.workloads[sessionTier.label].authVerifyUnchanged[`c${concurrency}`] = {
          concurrency,
          summary: {
            p50Ms: medianP50,
            p95Ms: medianP95,
            p99Ms: medianP99,
            eventLoopDelayP99Ms: medianLoopP99,
          },
          rounds: roundMeasurements,
        }
        console.log(`  Concurrency ${concurrency}: P50=${medianP50}ms, P95=${medianP95}ms, P99=${medianP99}ms, EventLoopP99=${medianLoopP99}ms`)
      }

      // 1b. Benchmark Guest Draft Update (delete + set gap in durableRecords)
      console.log(`\n--- Workload: Guest Draft Update (delete+set) ---`)
      results.workloads[sessionTier.label].guestDraftUpdate = {}

      for (const concurrency of cli.concurrencies) {
        const roundMeasurements = []
        for (let round = 1; round <= cli.rounds; round++) {
          const loopDelay = monitorEventLoopDelay({ resolution: 10 })
          loopDelay.enable()
          const startTime = performance.now()

          let draftTarget = concurrency * 10 * (cli.quick ? 2 : 4)
          let draftSeq = 0
          const outcome = await runWorkerPool({
            count: draftTarget,
            concurrency,
            taskFn: async () => {
              const num = ++draftSeq
              const intent = {
                clientIp: `198.51.100.${(num % 200) + 1}`,
                intentKey: `intent_${round}_${num}_1234567890`,
              }
              const issued = await guestStore.issue(intent, async () => 1)
              const digest = guestStore.digest(intent, { title: 'Draft update', num })
              guestStore.beginSubmission(intent, issued.id, digest)
              guestStore.confirmSubmission(intent, issued.id, digest)
            },
          })

          loopDelay.disable()
          const stats = computeStats(outcome.latencies)

          roundMeasurements.push({
            round,
            concurrency,
            stats,
            failures: outcome.failures,
            wallDurationMs: Number((performance.now() - startTime).toFixed(2)),
            eventLoopDelayMs: {
              p50: Number((loopDelay.percentile(50) / 1e6).toFixed(3)),
              p95: Number((loopDelay.percentile(95) / 1e6).toFixed(3)),
              p99: Number((loopDelay.percentile(99) / 1e6).toFixed(3)),
            },
          })
        }

        const medianP50 = percentile(roundMeasurements.map(r => r.stats.p50), 0.5)
        const medianP95 = percentile(roundMeasurements.map(r => r.stats.p95), 0.5)
        const medianP99 = percentile(roundMeasurements.map(r => r.stats.p99), 0.5)
        const medianLoopP99 = percentile(roundMeasurements.map(r => r.eventLoopDelayMs.p99), 0.5)

        results.workloads[sessionTier.label].guestDraftUpdate[`c${concurrency}`] = {
          concurrency,
          summary: {
            p50Ms: medianP50,
            p95Ms: medianP95,
            p99Ms: medianP99,
            eventLoopDelayP99Ms: medianLoopP99,
          },
          rounds: roundMeasurements,
        }
        console.log(`  Concurrency ${concurrency}: P50=${medianP50}ms, P95=${medianP95}ms, P99=${medianP99}ms`)
      }

      // 2. Benchmark Public Activity List (Cold vs Hot reads)
      console.log(`\n--- Workload: Public Activities List Read ---`)
      results.workloads[sessionTier.label].publicActivitiesList = {}

      for (const concurrency of cli.concurrencies) {
        const roundMeasurements = []
        for (let round = 1; round <= cli.rounds; round++) {
          const loopDelay = monitorEventLoopDelay({ resolution: 10 })
          loopDelay.enable()
          const startRss = process.memoryUsage().rss
          const startTime = performance.now()

          let callCount = concurrency * 20 * (cli.quick ? 2 : 5)
          const outcome = await runWorkerPool({
            count: callCount,
            concurrency,
            taskFn: async (idx) => {
              const page = (idx % 10) + 1
              const res = await fetch(`${origin}/api/activities?page=${page}&limit=20`, {
                headers: {
                  'x-forwarded-for': `198.51.100.${(idx % 200) + 1}`,
                },
                signal: AbortSignal.timeout(5000),
              })
              assert.equal(res.status, 200)
              await res.arrayBuffer()
            },
          })

          loopDelay.disable()
          const stats = computeStats(outcome.latencies)

          roundMeasurements.push({
            round,
            concurrency,
            stats,
            failures: outcome.failures,
            wallDurationMs: Number((performance.now() - startTime).toFixed(2)),
            eventLoopDelayMs: {
              p50: Number((loopDelay.percentile(50) / 1e6).toFixed(3)),
              p95: Number((loopDelay.percentile(95) / 1e6).toFixed(3)),
              p99: Number((loopDelay.percentile(99) / 1e6).toFixed(3)),
            },
            rssBytes: { start: startRss, end: process.memoryUsage().rss },
          })
        }

        const medianP50 = percentile(roundMeasurements.map(r => r.stats.p50), 0.5)
        const medianP95 = percentile(roundMeasurements.map(r => r.stats.p95), 0.5)
        const medianP99 = percentile(roundMeasurements.map(r => r.stats.p99), 0.5)
        const medianLoopP99 = percentile(roundMeasurements.map(r => r.eventLoopDelayMs.p99), 0.5)

        results.workloads[sessionTier.label].publicActivitiesList[`c${concurrency}`] = {
          concurrency,
          summary: {
            p50Ms: medianP50,
            p95Ms: medianP95,
            p99Ms: medianP99,
            eventLoopDelayP99Ms: medianLoopP99,
          },
          rounds: roundMeasurements,
        }
        console.log(`  Concurrency ${concurrency}: P50=${medianP50}ms, P95=${medianP95}ms, P99=${medianP99}ms`)
      }

      // 3. Benchmark Concurrent Event Signup (SQLite write transactions)
      console.log(`\n--- Workload: Event Signup Write Transactions ---`)
      results.workloads[sessionTier.label].eventSignupWrite = {}

      for (const concurrency of cli.concurrencies) {
        const roundMeasurements = []
        for (let round = 1; round <= cli.rounds; round++) {
          const loopDelay = monitorEventLoopDelay({ resolution: 10 })
          loopDelay.enable()
          const startTime = performance.now()

          let signupCount = concurrency * 10 * (cli.quick ? 2 : 4)
          let seq = 0
          const outcome = await runWorkerPool({
            count: signupCount,
            concurrency,
            taskFn: async () => {
              const num = ++seq
              const body = JSON.stringify({
                common_id: `pilot_${concurrency}_${round}_${num}`,
                qq: `1000${num}`,
                avatar: '/uploads/avatar.png',
              })
              const res = await fetch(`${origin}/api/event/1/signup`, {
                method: 'POST',
                headers: {
                  'content-type': 'application/json',
                  'x-bff-bridge': BRIDGE_SECRET,
                  'x-forwarded-for': '127.0.0.1',
                  'x-bot-owner': `pilot_${round}_${num}`,
                },
                body,
                signal: AbortSignal.timeout(5000),
              })
              assert.equal(res.status, 200)
              await res.arrayBuffer()
            },
          })

          loopDelay.disable()
          const stats = computeStats(outcome.latencies)

          roundMeasurements.push({
            round,
            concurrency,
            stats,
            failures: outcome.failures,
            wallDurationMs: Number((performance.now() - startTime).toFixed(2)),
            eventLoopDelayMs: {
              p50: Number((loopDelay.percentile(50) / 1e6).toFixed(3)),
              p95: Number((loopDelay.percentile(95) / 1e6).toFixed(3)),
              p99: Number((loopDelay.percentile(99) / 1e6).toFixed(3)),
            },
          })
        }

        const medianP50 = percentile(roundMeasurements.map(r => r.stats.p50), 0.5)
        const medianP95 = percentile(roundMeasurements.map(r => r.stats.p95), 0.5)
        const medianP99 = percentile(roundMeasurements.map(r => r.stats.p99), 0.5)
        const medianLoopP99 = percentile(roundMeasurements.map(r => r.eventLoopDelayMs.p99), 0.5)

        results.workloads[sessionTier.label].eventSignupWrite[`c${concurrency}`] = {
          concurrency,
          summary: {
            p50Ms: medianP50,
            p95Ms: medianP95,
            p99Ms: medianP99,
            eventLoopDelayP99Ms: medianLoopP99,
          },
          rounds: roundMeasurements,
        }
        console.log(`  Concurrency ${concurrency}: P50=${medianP50}ms, P95=${medianP95}ms, P99=${medianP99}ms`)
      }

      // 4. Benchmark Mixed Workload: Background Auth Polling + Public Page Reads
      // This directly demonstrates the impact of sync SQLite auth writes on public page read TTFB!
      console.log(`\n--- Workload: Mixed Concurrent Background Polling & Public Page Reads ---`)
      results.workloads[sessionTier.label].mixedPollAndRead = {}

      for (const concurrency of cli.concurrencies) {
        const roundMeasurements = []
        for (let round = 1; round <= cli.rounds; round++) {
          const loopDelay = monitorEventLoopDelay({ resolution: 10 })
          loopDelay.enable()
          const startTime = performance.now()

          // Launch background polling loop that calls authService.verify()
          let stopPolling = false
          let pollErrors = 0
          const pollPromise = (async () => {
            let pIdx = 0
            while (!stopPolling) {
              const sid = sessionIds[pIdx++ % sessionIds.length]
              try {
                await authService.verify(sid)
              } catch {
                pollErrors++
              }
              await new Promise(r => setTimeout(r, 10))
            }
          })()

          // Foreground public list reads
          let readCount = concurrency * 15 * (cli.quick ? 2 : 4)
          const readOutcome = await runWorkerPool({
            count: readCount,
            concurrency,
            taskFn: async (idx) => {
              const page = (idx % 10) + 1
              const res = await fetch(`${origin}/api/activities?page=${page}&limit=20`, {
                headers: {
                  'x-forwarded-for': `198.51.100.${(idx % 200) + 1}`,
                },
                signal: AbortSignal.timeout(5000),
              })
              assert.equal(res.status, 200)
              await res.arrayBuffer()
            },
          })

          stopPolling = true
          await pollPromise
          loopDelay.disable()

          const stats = computeStats(readOutcome.latencies)

          roundMeasurements.push({
            round,
            concurrency,
            stats,
            failures: readOutcome.failures + pollErrors,
            wallDurationMs: Number((performance.now() - startTime).toFixed(2)),
            eventLoopDelayMs: {
              p50: Number((loopDelay.percentile(50) / 1e6).toFixed(3)),
              p95: Number((loopDelay.percentile(95) / 1e6).toFixed(3)),
              p99: Number((loopDelay.percentile(99) / 1e6).toFixed(3)),
            },
          })
        }

        const medianP50 = percentile(roundMeasurements.map(r => r.stats.p50), 0.5)
        const medianP95 = percentile(roundMeasurements.map(r => r.stats.p95), 0.5)
        const medianP99 = percentile(roundMeasurements.map(r => r.stats.p99), 0.5)
        const medianLoopP99 = percentile(roundMeasurements.map(r => r.eventLoopDelayMs.p99), 0.5)

        results.workloads[sessionTier.label].mixedPollAndRead[`c${concurrency}`] = {
          concurrency,
          summary: {
            p50Ms: medianP50,
            p95Ms: medianP95,
            p99Ms: medianP99,
            eventLoopDelayP99Ms: medianLoopP99,
          },
          rounds: roundMeasurements,
        }
        console.log(`  Concurrency ${concurrency}: Public Read P50=${medianP50}ms, P95=${medianP95}ms, P99=${medianP99}ms, EventLoopP99=${medianLoopP99}ms`)
      }

      // Record final storage and WAL metrics for this tier
      results.workloads[sessionTier.label].storage = {
        dataDir: await getDirSizes(paths.data),
        bffStateDir: await getDirSizes(tierBffDir),
        walFiles: await getWalSizes(paths.data),
        bffWalFiles: await getWalSizes(tierBffDir),
      }
    }

    // Save final report
    await fs.mkdir(path.dirname(cli.outputPath), { recursive: true })
    await fs.writeFile(cli.outputPath, JSON.stringify(results, null, 2), 'utf8')
    console.log(`\nBaseline benchmark report successfully written to:\n  ${cli.outputPath}`)

  } finally {
    // Clean shutdown of application and server
    await app.close()
    // Cleanup temp dir
    try {
      await fs.rm(tempRoot, { recursive: true, force: true })
    } catch {
      // Ignore cleanup errors on Windows
    }
  }
}

main().catch((err) => {
  console.error('Benchmark failed:', err)
  process.exit(1)
})
