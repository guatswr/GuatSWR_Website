import { expect, it } from 'vitest'
import { parseClubTime, signupDeadlineClosed } from '../src/club-time'

it('anchors naive/date-only values to Beijing and preserves explicit offsets', () => {
  const expected = Date.parse('2026-11-01T04:00:00Z')
  for (const value of ['2026-11-01T12:00', '2026-11-01 12:00:00', '2026-11-01T12:00:00+08:00', '2026-11-01T04:00:00Z']) expect(parseClubTime(value)).toBe(expected)
  expect(parseClubTime('2026-11-01')).toBe(Date.parse('2026-10-31T16:00:00Z'))
  expect(parseClubTime('下周六')).toBeNaN()
})
it('closes exactly at the deadline and ignores absent, invalid and activity-time fields', () => {
  const deadline = '2026-11-01T12:00'
  const now = Date.parse('2026-11-01T04:00:00Z')
  expect(signupDeadlineClosed({ deadline }, now - 1)).toBe(false)
  expect(signupDeadlineClosed({ deadline }, now)).toBe(true)
  expect(signupDeadlineClosed({ deadline }, now + 1)).toBe(true)
  for (const content of [{ deadline: '' }, { deadline: null }, { deadline: 1 }, { deadline: '下周六' }, { time: '2000-01-01' }, { end_time: '2000-01-01' }, null]) expect(signupDeadlineClosed(content, now)).toBe(false)
})
