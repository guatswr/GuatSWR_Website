import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { eventContent, eventSummary, eventTime, formatClubDate, parseClubTime, upcomingEvents } from './community.js'

const now = Date.parse('2026-10-16T12:00:00+08:00')
const event = (id, status, content = {}) => ({ id, status, content })

test('only public, active statuses are eligible for the homepage', () => {
  const statuses = ['published', 'ongoing', 'ended', 'settled', 'pending', 'draft', 'rejected', 'deleted']
  const result = upcomingEvents(statuses.map((status, id) => event(id, status)), now)
  assert.deepEqual(result.map((item) => item.status), ['ongoing', 'published'])
})

test('published deadlines exclude the exact boundary and keep one millisecond before it', () => {
  const item = event(1, 'published', { deadline: '2026-10-16T12:00' })
  assert.equal(upcomingEvents([item], now - 1).length, 1)
  assert.equal(upcomingEvents([item], now).length, 0)
  assert.equal(upcomingEvents([item], now + 1).length, 0)
})

test('an ongoing event survives registration closing and uses its explicit end time', () => {
  const registrationClosed = event(1, 'ongoing', { deadline: '2026-10-15T12:00' })
  const stillRunning = event(2, 'ongoing', { deadline: '2026-10-15T12:00', end_time: '2026-10-16T13:00' })
  const endedExactly = event(3, 'ongoing', { deadline: '2026-10-15T12:00', end_time: '2026-10-16T12:00' })
  const endedBefore = event(4, 'ongoing', { end_time: '2026-10-16T11:59' })
  assert.deepEqual(upcomingEvents([registrationClosed, stillRunning, endedExactly, endedBefore], now).map((item) => item.id), [1, 2])
})

test('date sorting prioritizes ongoing events, then the nearest scheduled published events', () => {
  const items = [
    event(1, 'published'),
    event(2, 'published', { time: '2026-10-18T12:00' }),
    event(3, 'published', { deadline: '2026-10-17T12:00' }),
    event(4, 'ongoing', { end_time: '2026-10-19T12:00' })
  ]
  assert.deepEqual(upcomingEvents(items, now).map((item) => item.id), [4, 3, 2, 1])
  assert.deepEqual(items.map((item) => item.id), [1, 2, 3, 4], 'sorting must not reorder the API response')
})

test('content accepts legacy JSON and rejects malformed JSON, primitives, and arrays', () => {
  assert.deepEqual(eventContent({ content: '{"copy":"一起联机"}' }), { copy: '一起联机' })
  for (const content of ['{bad', 'null', '12', '"text"', '[]', null, []]) {
    assert.deepEqual(eventContent({ content }), {})
  }
  assert.doesNotThrow(() => upcomingEvents([null, event(1, 'published', '{bad')], now))
  assert.equal(upcomingEvents([event(1, 'published', { time: '时间待定' })], now).length, 0)
})

test('STG and fighting-event copy is used as the real summary', () => {
  assert.equal(eventSummary({ type: 'STG', content: { copy: '周末一起挑战东方正作。' } }), '周末一起挑战东方正作。')
  assert.equal(eventSummary({ type: '则则', content: '{"copy":"新手友好的联机交流。"}' }), '新手友好的联机交流。')
  assert.equal(eventTime({ content: { deadline: 'a', end_time: 'b', time: 'c' } }), 'a')
})

test('Beijing timestamps retain explicit offsets and date-only midnight semantics', () => {
  assert.equal(parseClubTime('2026-10-16T12:00'), now)
  assert.equal(parseClubTime('2026-10-16 12:00:00'), now)
  assert.equal(parseClubTime('2026-10-16T04:00:00Z'), now)
  assert.equal(parseClubTime('2026-10-16T05:00:00+01:00'), now)
  assert.equal(parseClubTime('2026-10-16'), Date.parse('2026-10-16T00:00:00+08:00'))
  assert.equal(formatClubDate('2026-10-15T20:00:00Z'), '10月16日')
  assert.equal(formatClubDate('时间待定'), '时间待确认')
})

test('UTC, America/Los_Angeles, and Asia/Shanghai browsers agree at midnight and deadline boundaries', () => {
  const moduleUrl = new URL('./community.js', import.meta.url).href
  const source = `
    import { parseClubTime, formatClubDate, upcomingEvents } from ${JSON.stringify(moduleUrl)};
    console.log(JSON.stringify({
      midnight: parseClubTime('2026-10-16T00:30'),
      date: formatClubDate('2026-10-16T23:30'),
      exactBoundaryCount: upcomingEvents([{ status: 'published', content: { deadline: '2026-10-16T12:00' } }], ${now}).length
    }));
  `
  const snapshots = ['UTC', 'America/Los_Angeles', 'Asia/Shanghai'].map((TZ) => {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', source], { encoding: 'utf8', env: { ...process.env, TZ } })
    assert.equal(result.status, 0, result.stderr)
    return JSON.parse(result.stdout)
  })
  assert.deepEqual(snapshots[0], snapshots[1])
  assert.deepEqual(snapshots[0], snapshots[2])
  assert.equal(snapshots[0].midnight, Date.parse('2026-10-16T00:30:00+08:00'))
  assert.equal(snapshots[0].date, '10月16日')
  assert.equal(snapshots[0].exactBoundaryCount, 0)
})
