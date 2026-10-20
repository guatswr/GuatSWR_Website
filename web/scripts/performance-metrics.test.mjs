import { test } from 'node:test'
import assert from 'node:assert/strict'
import { summarizePerformance } from './performance-metrics.mjs'

test('does not substitute the LCP-median run score for the independent score median', () => {
  const runs = [{ performance: 91, lcpMs: 2756.5 }, { performance: 91, lcpMs: 2038.8 }, { performance: 97, lcpMs: 2486.9 }]
  const snapshot = structuredClone(runs)
  const summary = summarizePerformance(runs)
  assert.deepEqual(summary.median, { performance: 91, lcpMs: 2486.9 })
  assert.deepEqual(summary.lcpMedianSample, runs[2])
  assert.deepEqual(runs, snapshot)
})

test('missing or invalid samples cannot make the median pass', () => {
  const valid = { performance: 99, lcpMs: 1600 }
  for (const invalid of [{ performance: NaN, lcpMs: 1600 }, { performance: 101, lcpMs: 1600 }, { performance: 99, lcpMs: 0 }, { performance: 99, lcpMs: Infinity }]) {
    assert.throws(() => summarizePerformance([valid, valid, invalid]), /three valid/)
  }
})

test('requires all three samples instead of dropping an inconvenient run', () => {
  assert.throws(() => summarizePerformance([{ performance: 99, lcpMs: 1600 }, { performance: 99, lcpMs: 1700 }]), /three valid/)
})
