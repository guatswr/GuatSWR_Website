import { describe, expect, it } from 'vitest'
import {
  activityDetailRowSchema,
  activityRowSchema,
  eventParticipantRowSchema,
  eventRowSchema,
  historyRowSchema,
  logRowSchema,
  memberRowSchema,
  publicActivitiesPageSchema,
  publicActivitySchema,
  publicEventContentSchema,
  publicEventSchema,
  publicLogSchema,
  publicLogsPageSchema,
  publicMembersSchema,
  publicUmamiStatsSchema,
  publicUmamiSummarySchema,
  schoolStatRowSchema,
} from './public'
import type { PublicActivity, PublicEvent } from './public'

// `SELECT * FROM activities` for a published row, including the columns the
// public reader must never serialize (author id, deletion metadata).
const activityRow = {
  id: 7,
  title: '秋季例会',
  tag: '例会',
  date: '2026-10-01',
  description: '签到与自由对战',
  content: '# 记录\n正文',
  cover_image: '/uploads/img/activity/7/cover.webp',
  images: '["/uploads/img/activity/7/a.webp","/uploads/img/activity/7/b.webp"]',
  created_at: '2026-10-01 12:00:00',
  created_by: 3,
  updated_by: 4,
  status: null,
  deleted_at: null,
  deleted_by: 3,
}

/** The exact shape a public reader may hand to the browser. */
const projectedActivity = {
  id: 7,
  title: '秋季例会',
  tag: '例会',
  date: '2026-10-01',
  description: '签到与自由对战',
  content: '# 记录\n正文',
  cover_image: '/uploads/img/activity/7/cover.webp',
  images: ['/uploads/img/activity/7/a.webp'],
  created_by: 'Taropoi',
  created_by_avatar: '/uploads/img/user/1.webp',
  updated_by: null,
  updated_by_avatar: null,
  created_at: '2026-10-01 12:00:00',
} satisfies PublicActivity

describe('frozen v1 activity rows', () => {
  it('normalizes legacy nulls and JSON-stringified image lists', () => {
    const row = activityRowSchema.parse({ ...activityRow, tag: null, description: undefined, images: null })
    expect(row.tag).toBe('')
    expect(row.description).toBe('')
    expect(row.images).toEqual([])
    expect(activityRowSchema.parse(activityRow).images)
      .toEqual(['/uploads/img/activity/7/a.webp', '/uploads/img/activity/7/b.webp'])
  })

  it('accepts the array form and degrades malformed image columns to an empty list', () => {
    const images = ['/uploads/img/x.webp', 42, '', null]
    expect(activityRowSchema.parse({ ...activityRow, images }).images).toEqual(['/uploads/img/x.webp'])
    expect(activityRowSchema.parse({ ...activityRow, images: 'not json' }).images).toEqual([])
    expect(activityRowSchema.parse({ ...activityRow, images: { 0: 'x' } }).images).toEqual([])
  })

  it('preserves legitimate long image lists instead of truncating gallery content', () => {
    const many = Array.from({ length: 260 }, (_item, index) => `/uploads/img/activity/7/${index}.webp`)
    expect(activityRowSchema.parse({ ...activityRow, images: many }).images).toHaveLength(260)
    expect(activityRowSchema.parse({ ...activityRow, images: many.slice(0, 3) }).images).toHaveLength(3)
  })

  it('drops internal author ids and deletion metadata while keeping moderation columns filterable', () => {
    const row = activityRowSchema.parse(activityRow)
    expect(row).not.toHaveProperty('created_by')
    expect(row).not.toHaveProperty('updated_by')
    expect(row).not.toHaveProperty('deleted_by')
    expect(row.status).toBeNull()
    expect(row.deleted_at).toBeNull()
    expect(activityRowSchema.parse({ ...activityRow, deleted_at: '2026-10-02 00:00:00' }).deleted_at)
      .toBe('2026-10-02 00:00:00')
  })

  it('reads the joined author display columns and keeps unmatched authors null', () => {
    const detail = activityDetailRowSchema.parse({
      ...activityRow,
      created_by_name: 'Taropoi',
      created_by_avatar: '/uploads/img/user/1.webp',
      updated_by_name: null,
      updated_by_avatar: null,
    })
    expect(detail.created_by_name).toBe('Taropoi')
    expect(detail.updated_by_name).toBeNull()
    // The archived detail route aliases `created_by` to the display name; the
    // numeric id from the join is not part of the public contract either way.
    expect(activityDetailRowSchema.parse({ ...activityRow, created_by: 'Taropoi' })).not.toHaveProperty('created_by')
  })

  it('rejects rows without a usable public identifier', () => {
    expect(activityRowSchema.safeParse({ ...activityRow, id: 0 }).success).toBe(false)
    expect(activityRowSchema.safeParse({ ...activityRow, id: -1 }).success).toBe(false)
    expect(activityRowSchema.safeParse({ ...activityRow, id: 1.5 }).success).toBe(false)
    expect(activityRowSchema.safeParse({ ...activityRow, id: '7' }).success).toBe(false)
    expect(activityRowSchema.safeParse({ title: 'no id' }).success).toBe(false)
  })
})

describe('public activity DTOs', () => {
  it('accepts only projected author display values', () => {
    expect(publicActivitySchema.parse(projectedActivity)).toEqual(projectedActivity)
    expect(publicActivitySchema.safeParse({ ...projectedActivity, created_by: 3 }).success).toBe(false)
    expect(publicActivitySchema.safeParse({ ...projectedActivity, images: '[]' }).success).toBe(false)
    const stripped = publicActivitySchema.parse({ ...projectedActivity, status: 'draft', deleted_at: 'x', visitor_ip: '1.2.3.4' })
    expect(stripped).not.toHaveProperty('status')
    expect(stripped).not.toHaveProperty('deleted_at')
    expect(stripped).not.toHaveProperty('visitor_ip')
  })

  it('keeps the frozen page envelope for list routes', () => {
    const page = { total: 1, page: 1, limit: 3, items: [projectedActivity] }
    expect(publicActivitiesPageSchema.parse(page)).toEqual(page)
    expect(publicActivitiesPageSchema.safeParse({ ...page, total: -1 }).success).toBe(false)
    expect(publicActivitiesPageSchema.safeParse({ ...page, limit: 0 }).success).toBe(false)
    expect(publicActivitiesPageSchema.safeParse({ total: 1, page: 1, limit: 3, items: {} }).success).toBe(false)
  })
})

describe('frozen v1 member, history and school rows', () => {
  it('parses JSON tags and drops member deletion metadata', () => {
    const row = memberRowSchema.parse({
      id: 12,
      name: 'Cirno',
      role: '部长',
      bio: null,
      avatar: '/uploads/img/user/12-thumb.webp',
      avatar_thumb: '/uploads/img/user/12-thumb.webp',
      avatar_original: '/uploads/img/user/12.webp',
      school: null,
      tags: '["STG","东方"]',
      sort_order: null,
      deleted_at: null,
      deleted_by: 1,
    })
    expect(row).toMatchObject({ school: '', sort_order: 0, tags: ['STG', '东方'] })
    expect(row).not.toHaveProperty('deleted_by')
    expect(publicMembersSchema.parse([row])).toHaveLength(1)
  })

  it('keeps a null school filterable but never null in the public distribution', () => {
    expect(schoolStatRowSchema.parse({ school: null, count: 4 })).toEqual({ school: '', count: 4 })
    expect(schoolStatRowSchema.safeParse({ school: '桂航', count: '4' }).success).toBe(false)
  })

  it('normalizes history entries with optional images and ordering', () => {
    const row = historyRowSchema.parse({
      id: 3,
      date: '2026-09-01',
      title: '第一次聚会',
      description: '<p>正文</p>',
      image: null,
      sort_order: null,
      deleted_at: null,
    })
    expect(row).toMatchObject({ image: '', sort_order: 0, title: '第一次聚会' })
    expect(row).not.toHaveProperty('deleted_by')
  })
})

describe('frozen v1 event rows and content', () => {
  const eventRow = {
    id: 21,
    type: 'STG',
    title: '秋季 STG 大会',
    status: 'published',
    content: { copy: '文案', cover: '/uploads/img/events/21/cover.webp', rules: '规则', results: [{ rank: 1, id: 'Cirno', avatar: '/uploads/a.webp' }] },
    created_by: 9,
    visitor_ip: '203.0.113.7',
    created_at: '2026-10-01 12:00:00',
    updated_at: '2026-10-02 12:00:00',
    created_by_name: 'Taropoi',
    created_by_avatar: null,
  }

  it('drops visitor metadata and internal author ids from event rows', () => {
    const row = eventRowSchema.parse(eventRow)
    expect(row).not.toHaveProperty('visitor_ip')
    expect(row).not.toHaveProperty('created_by')
    expect(row).toMatchObject({ type: 'STG', status: 'published', created_by_name: 'Taropoi', created_by_avatar: null })
  })

  it('accepts object, string and missing nested content as unknown input', () => {
    expect(eventRowSchema.parse({ ...eventRow, content: '{"copy":"x"}' }).content).toBe('{"copy":"x"}')
    expect(eventRowSchema.parse({ ...eventRow, content: undefined }).content).toBeUndefined()
    expect(eventRowSchema.parse({ ...eventRow, content: null }).content).toBeNull()
  })

  it('never serializes raw nested content directly', () => {
    expect(publicEventContentSchema.safeParse(eventRow.content).success).toBe(false)
    expect(publicEventContentSchema.safeParse({}).success).toBe(false)
  })

  it('restricts public events to the frozen public statuses', () => {
    const projected = {
      id: 21,
      type: 'STG',
      title: '秋季 STG 大会',
      status: 'published',
      content: {
        copy: '文案',
        cover: '/uploads/img/events/21/cover.webp',
        cover_image: '',
        image: '',
        proof_image: '',
        time: '',
        deadline: '',
        end_time: '',
        rules: '规则',
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
        results: [{ rank: 1, id: 'Cirno', player_id: '', avatar: '/uploads/a.webp' }],
      },
      created_by: 'Taropoi',
      created_by_avatar: null,
      created_at: '2026-10-01 12:00:00',
      updated_at: '2026-10-02 12:00:00',
    } satisfies PublicEvent
    expect(publicEventSchema.parse(projected)).toEqual(projected)
    for (const status of ['draft', 'pending', 'rejected', 'deleted']) {
      expect(publicEventSchema.safeParse({ ...projected, status }).success).toBe(false)
    }
    expect(publicEventSchema.safeParse({ ...projected, created_by: 9 }).success).toBe(false)
    // Unknown nested keys are stripped, but the projection in
    // `web/server/utils/public-read.ts` remains the primary redaction boundary.
    const leaked = publicEventSchema.parse({ ...projected, content: { ...projected.content, visitor_ip: '203.0.113.7' } })
    expect(leaked.content).not.toHaveProperty('visitor_ip')
    expect(publicEventContentSchema.parse(projected.content)).not.toHaveProperty('visitor_ip')
  })

  it('keeps public signup fields while dropping visitor identity', () => {
    const row = eventParticipantRowSchema.parse({
      id: 5,
      event_id: 21,
      user_id: 2,
      visitor_ip: '203.0.113.7',
      common_id: 'Cirno',
      machine_sign: '③',
      pilot_source: '群友',
      qq: '10001',
      avatar: '/uploads/img/events/21/5.webp',
      created_at: '2026-10-01 12:00:00',
      updated_at: '2026-10-01 12:00:00',
    })
    expect(row).not.toHaveProperty('visitor_ip')
    expect(row).not.toHaveProperty('user_id')
    expect(row).not.toHaveProperty('event_id')
    expect(row.qq).toBe('10001')
  })
})

describe('frozen v1 audit log and statistics shapes', () => {
  it('uses the `{ total, logs }` envelope and drops the joined user id', () => {
    const row = logRowSchema.parse({
      id: 99,
      username: 'Taropoi',
      action: 'UPDATE_ACTIVITY',
      details: '更新活动: 秋季例会',
      created_at: '2026-10-01T20:00:00+08:00',
      user_id: 1,
      user_avatar: '/uploads/img/user/1-thumb.webp',
    })
    expect(row).not.toHaveProperty('user_id')
    expect(publicLogsPageSchema.parse({ total: 1, logs: [row] })).toEqual({
      total: 1,
      logs: [{
        id: 99,
        username: 'Taropoi',
        action: 'UPDATE_ACTIVITY',
        details: '更新活动: 秋季例会',
        created_at: '2026-10-01T20:00:00+08:00',
        user_avatar: '/uploads/img/user/1-thumb.webp',
      }],
    })
    expect(publicLogSchema.safeParse({ ...row, user_id: 1 }).success).toBe(true)
    expect(publicLogsPageSchema.safeParse({ total: 1, items: [] }).success).toBe(false)
    expect(publicLogsPageSchema.safeParse({ total: null, logs: [] }).success).toBe(false)
  })

  it('normalizes flat Umami numbers and points into the frozen envelope', () => {
    const payload = publicUmamiStatsSchema.parse({
      meta: { startAt: '1759248000000', endAt: 1759852800000, unit: 'day', limit: '5', envType: 'browser' },
      summary: { pageviews: '128', visitors: 40, visits: null, bounces: 12.5, totaltime: 2400 },
      series: { pageviews: [{ x: '2026-10-01', y: '12' }], visitors: [{ x: '2026-10-01', y: 4 }, { y: null }] },
      top: { pages: [{ x: '/', y: 30, extra: 'dropped' }], environments: [] },
    })
    expect(payload.meta).toEqual({ startAt: 1759248000000, endAt: 1759852800000, unit: 'day', limit: 5, envType: 'browser' })
    expect(payload.summary).toEqual({ pageviews: 128, visitors: 40, visits: 0, bounces: 12.5, totaltime: 2400 })
    expect(payload.series.visitors).toEqual([{ x: '2026-10-01', y: 4 }, { x: '', y: 0 }])
    expect(payload.top.pages).toEqual([{ x: '/', y: 30 }])
    expect(publicUmamiStatsSchema.safeParse({ summary: {} }).success).toBe(false)
    expect(publicUmamiStatsSchema.safeParse({
      meta: {},
      summary: {},
      series: { pageviews: null, visitors: [] },
      top: { pages: [], environments: [] },
    }).success).toBe(false)
  })

  it('flattens the official nested { value, prev } Umami summary', () => {
    const payload = publicUmamiSummarySchema.parse({
      pageviews: { value: 3018, prev: 3508 },
      visitors: { value: 889, prev: 1001 },
      visits: { value: '1200', prev: 0 },
      bounces: { value: 42 },
      totaltime: { value: 37200 },
    })
    expect(payload).toEqual({ pageviews: 3018, visitors: 889, visits: 1200, bounces: 42, totaltime: 37200 })
    expect(publicUmamiSummarySchema.parse({
      pageviews: { value: 7, prev: { nested: true } },
      visitors: { value: null },
      visits: undefined,
      bounces: '0',
      totaltime: 0,
    })).toEqual({ pageviews: 7, visitors: 0, visits: 0, bounces: 0, totaltime: 0 })
    const points = publicUmamiStatsSchema.parse({
      meta: { startAt: { value: 1759248000000 }, endAt: 1759852800000, unit: 'day', limit: 5, envType: 'browser' },
      summary: { pageviews: { value: 1 } },
      series: { pageviews: [{ x: '2026-10-01', y: { value: 12, prev: 9 } }], visitors: [] },
      top: { pages: [{ x: '/', y: { value: 3 } }], environments: [] },
    })
    expect(points.series.pageviews).toEqual([{ x: '2026-10-01', y: 12 }])
    expect(points.top.pages).toEqual([{ x: '/', y: 3 }])
  })

  it('keeps documented no-data summaries at zero', () => {
    expect(publicUmamiSummarySchema.parse({})).toEqual({
      pageviews: 0, visitors: 0, visits: 0, bounces: 0, totaltime: 0,
    })
    expect(publicUmamiSummarySchema.parse({
      pageviews: null, visitors: undefined, visits: null, bounces: null, totaltime: null,
    })).toEqual({ pageviews: 0, visitors: 0, visits: 0, bounces: 0, totaltime: 0 })
    // The frozen route always rebuilds `summary` as an object (`stats || {}`).
    expect(publicUmamiStatsSchema.parse({
      meta: { startAt: null, endAt: undefined, unit: 'day', limit: 5, envType: 'browser' },
      summary: {},
      series: { pageviews: [], visitors: [] },
      top: { pages: [], environments: [] },
    }).summary).toEqual({ pageviews: 0, visitors: 0, visits: 0, bounces: 0, totaltime: 0 })
  })

  it('rejects malformed Umami metric objects instead of guessing a value', () => {
    for (const malformed of [
      { pageviews: {} },
      { pageviews: [] },
      { pageviews: { value: {} } },
      { pageviews: { value: [] } },
      { pageviews: { prev: 10 } },
      { pageviews: true },
    ]) {
      expect(publicUmamiSummarySchema.safeParse(malformed).success).toBe(false)
    }
    expect(publicUmamiStatsSchema.safeParse({
      meta: { startAt: 0, endAt: 0, unit: 'day', limit: 5, envType: 'browser' },
      summary: { pageviews: { value: {} } },
      series: { pageviews: [], visitors: [] },
      top: { pages: [], environments: [] },
    }).success).toBe(false)
  })
})
