import { describe, expect, it } from 'vitest'
import type { PublicEvent, PublicEventContent } from '@guatswr/shared'
import { eventAcceptingParticipants, eventCategory, eventSupportsSignup } from '../app/utils/event-center'
import {
  eventCountdown,
  eventCoverThumb,
  eventCoverUrl,
  eventDeadlineText,
  eventDeadlineValue,
  eventSignupDeadline,
  eventStatusText,
  eventTopResults,
  isEventSignupOpen
} from '../app/utils/event-display'

const baseContent = (overrides: Partial<PublicEventContent> = {}): PublicEventContent => ({
  copy: '',
  cover: '',
  cover_image: '',
  image: '',
  proof_image: '',
  time: '',
  deadline: '',
  end_time: '',
  rules: '',
  prizes: '',
  notes: '',
  location: '',
  gather_type: '',
  challenge: '',
  requirements: '',
  reward: '',
  limit: '',
  penalty: '',
  result: '',
  results_updated_at: '',
  initiator: null,
  a: null,
  b: null,
  completion: null,
  results: [],
  ...overrides
})

const event = (overrides: Partial<PublicEvent> = {}): PublicEvent => ({
  id: 1,
  type: 'STG',
  title: '比赛',
  status: 'published',
  content: baseContent(),
  created_by: 'admin',
  created_by_avatar: '',
  created_at: '',
  updated_at: '',
  ...overrides
})

describe('event display helpers', () => {
  it('uses the archived cover and deadline precedence', () => {
    expect(eventCoverUrl(baseContent({ cover: '/c.png', cover_image: '/ci.png' }))).toBe('/c.png')
    expect(eventCoverUrl(baseContent({ cover_image: '/ci.png', image: '/i.png' }))).toBe('/ci.png')
    expect(eventCoverUrl(baseContent({ image: '/i.png', proof_image: '/p.png' }))).toBe('/i.png')
    expect(eventCoverUrl(baseContent({ proof_image: '/p.png' }))).toBe('/p.png')
    expect(eventCoverUrl(baseContent())).toBe('')
    expect(eventCoverThumb(baseContent({ cover: '/uploads/img/a.png' }))).toBe(
      '/uploads/img/a-thumb.webp'
    )
    expect(eventDeadlineValue(baseContent({ deadline: 'D', time: 'T', end_time: 'E' }))).toBe('D')
    expect(eventDeadlineValue(baseContent({ time: 'T', end_time: 'E' }))).toBe('T')
    expect(eventDeadlineValue(baseContent({ end_time: 'E' }))).toBe('E')
  })

  it('keeps free-form schedules verbatim and formats parseable ones', () => {
    expect(eventDeadlineText('下周六下午')).toBe('下周六下午')
    expect(eventDeadlineText('')).toBe('')
    expect(eventDeadlineText('2026-11-01T14:00')).toBe('2026年11月1日 14:00')
    expect(eventDeadlineText('2026-11-01T06:00:00Z')).toBe('2026年11月1日 14:00')
  })

  it('counts down with the Beijing rule instead of the visitor timezone', () => {
    // 14:00 Beijing == 06:00Z; two hours earlier in Beijing time.
    const now = Date.parse('2026-11-01T12:00:00+08:00')
    expect(eventCountdown('2026-11-01T14:00', now)).toBe('2小时 0分钟')
    expect(eventCountdown('2026-11-02T10:00', now)).toBe('22小时 0分钟')
    expect(eventCountdown('2026-11-03T14:00', now)).toBe('2天 2小时')
    expect(eventCountdown('2026-11-01T11:59', now)).toBe('已截止')
    expect(eventCountdown('下周六下午', now)).toBe('')
    expect(eventCountdown('', now)).toBe('')
  })

  it('derives the signup deadline from the Beijing rule only for real timestamps', () => {
    expect(eventSignupDeadline(baseContent({ deadline: '2026-11-01T14:00' }))).toBe(
      Date.parse('2026-11-01T14:00:00+08:00')
    )
    expect(eventSignupDeadline(baseContent({ deadline: '下周六下午' }))).toBeNull()
    expect(eventSignupDeadline(baseContent())).toBeNull()
    const before = Date.parse('2026-10-31T00:00:00+08:00')
    expect(isEventSignupOpen(baseContent({ deadline: '2026-11-01T14:00' }), before)).toBe(true)
    expect(isEventSignupOpen(baseContent({ deadline: '2026-11-01T14:00' }), before + 3 * 86_400_000))
      .toBe(false)
    expect(isEventSignupOpen(baseContent({ deadline: '下周六下午' }), before)).toBe(true)
  })

  it('keeps the top-results slice and the archived status labels', () => {
    const results = [
      { rank: 1, id: 'A', player_id: 'a', avatar: '' },
      { rank: 2, id: 'B', player_id: 'b', avatar: '' },
      { rank: 3, id: 'C', player_id: 'c', avatar: '' },
      { rank: 4, id: 'D', player_id: 'd', avatar: '' }
    ]
    expect(eventTopResults(baseContent({ results })).map((row) => row.id)).toEqual(['A', 'B', 'C'])
    expect(eventTopResults(baseContent({ results }), 1).map((row) => row.id)).toEqual(['A'])
    expect(eventStatusText(event({ type: '则则', status: 'published' }))).toBe('报名中')
    expect(eventStatusText(event({ type: '线下聚会', status: 'published' }))).toBe('倒计时')
    expect(eventStatusText(event({ type: '悬赏令', status: 'settled' }))).toBe('已验收')
  })

  it('closes expired published events as well as ended and settled events', () => {
    const now = Date.parse('2026-11-01T12:00:00+08:00')
    expect(eventAcceptingParticipants(event({ content: baseContent({ deadline: '2026-11-01T12:00' }) }), now)).toBe(false)
    expect(eventAcceptingParticipants(event({ content: baseContent({ deadline: '2026-11-01T12:01' }) }), now)).toBe(true)
    expect(eventAcceptingParticipants(event({ status: 'ongoing' }), now)).toBe(true)
    expect(eventAcceptingParticipants(event({ status: 'ended' }), now)).toBe(false)
    expect(eventAcceptingParticipants(event({ status: 'settled' }), now)).toBe(false)
    expect(eventAcceptingParticipants(event({ content: baseContent({ deadline: '下周六下午' }) }), now)).toBe(true)
  })

  it('keeps Chinese category labels separate from backend types and signup permissions', () => {
    expect(eventCategory('STG')).toMatchObject({ label: '东方STG', path: '/events/stg' })
    expect(eventCategory('则则').label).toBe('非想天则')
    expect(eventCategory('unknown').path).toBe('/events')
    expect(eventSupportsSignup(event())).toBe(true)
    expect(eventSupportsSignup(event({ type: '则则' }))).toBe(true)
    expect(eventSupportsSignup(event({ type: '悬赏令' }))).toBe(false)
  })
})
