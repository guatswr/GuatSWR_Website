import { describe, expect, it } from 'vitest'
import {
  EVENT_TYPES,
  buildEventPayload,
  createDraftSession,
  createEventFormSchema,
  createEventFormState,
  eventSaveRequestSchema,
  eventSignupSchema,
  eventStatusLabel,
  getEventFields,
  getEventTypes,
  isPublicEventStatus,
  saveEventForm,
  supportsSignup,
  validateEventForm
} from './events.js'
import type { EventWriteApi } from './events.js'

const fixtureEvents = [
  {
    type: '悬赏令',
    title: '悬赏令活动',
    content: {
      initiator: { id: '⑨', qq: '123456', avatar: '/avatar.png' },
      challenge: '一命通关',
      requirements: '直播',
      reward: '吧唧',
      limit: '一次',
      deadline: '2026-11-01T14:00'
    }
  },
  {
    type: '对赌协议',
    title: '对赌协议活动',
    content: {
      a: { id: 'A', qq: '111', avatar: '/a.png', goal: '通关' },
      b: { id: 'B', qq: '222', avatar: '/b.png', goal: '一命' },
      penalty: '画画',
      deadline: '2026-11-01T14:00',
      proof_image: '/proof.png'
    }
  },
  ...['STG', '则则'].map((type) => ({
    type,
    title: `${type}活动`,
    content: {
      copy: '比赛报名',
      cover: '/cover.png',
      time: '2026-11-01T14:00',
      rules: '双败淘汰',
      prizes: '纪念品',
      notes: '自带设备'
    }
  })),
  {
    type: '线下聚会',
    title: '线下聚会活动',
    content: {
      cover: '/party.png',
      time: '2026-11-01T14:00',
      location: '活动室',
      gather_type: '饭聚',
      notes: '提前报名'
    }
  }
]

describe('event form model', () => {
  it('round-trips the public card fields for all five types', () => {
    expect(fixtureEvents.map(({ type }) => type)).toEqual([...EVENT_TYPES])
    for (const event of fixtureEvents) {
      const form = createEventFormState(event)
      expect(validateEventForm(form)).toBeNull()
      expect(buildEventPayload(form, event)).toEqual(event)
    }
  })

  it('retains rankings, settlement, unknown nested fields and the original event', () => {
    const event = {
      type: '悬赏令',
      title: '原标题',
      status: 'settled',
      content: {
        initiator: { id: '⑨', avatar: '/avatar.png', qq: '123', extra: '保留' },
        reward: '吧唧',
        completion: { id: '完成者', time: '周末' },
        results: [{ rank: 1, id: '选手' }],
        future: { featured: true }
      }
    }
    const before = JSON.stringify(event)
    const form = createEventFormState(event)
    form.title = ' 修改后 '
    const payload = buildEventPayload(form, event)
    expect(payload.title).toBe('修改后')
    expect(payload.content.results).toEqual(event.content.results)
    expect(payload.content.completion).toEqual(event.content.completion)
    expect(payload.content.future).toEqual(event.content.future)
    expect((payload.content.initiator as { extra: string }).extra).toBe('保留')
    ;(payload.content.results as { id: string }[])[0]!.id = '新值'
    expect(JSON.stringify(event)).toBe(before)
  })

  it('keeps legacy JSON content, text schedules and unknown gather labels editable', () => {
    const event = {
      type: '线下聚会',
      title: '聚会',
      content: JSON.stringify({
        time: '下周六下午',
        gather_type: '返校聚餐',
        location: '食堂'
      })
    }
    const form = createEventFormState(event)
    expect(form.time).toBe('下周六下午')
    expect(buildEventPayload(form, event).content.gather_type).toBe('返校聚餐')
    expect(createEventFormState({ content: '{invalid' }).type).toBe('悬赏令')
  })

  it('validates type restrictions, whitespace titles and solo/duo requirements', () => {
    expect(getEventTypes(['STG', 'wrong', 'STG', '则则'])).toEqual(['STG', '则则'])
    const form = createEventFormState(null, ['对赌协议'])
    expect(validateEventForm(form)?.field).toBe('title')
    form.title = '  '
    expect(validateEventForm(form)?.field).toBe('title')
    form.title = '赌约'
    expect(validateEventForm(form)?.field).toBe('a_avatar')
    form.a_avatar = '/a.png'
    expect(validateEventForm(form)).toBeNull()
    expect(buildEventPayload(form).content.b).toBeNull()
    form.betMode = 'duo'
    expect(validateEventForm(form)?.field).toBe('b_id')
    form.b_id = 'B'
    expect(validateEventForm(form)?.field).toBe('b_avatar')
    expect(getEventFields(form).some(({ key }) => key === 'b_goal')).toBe(true)
    expect(validateEventForm(form, ['STG'])?.field).toBe('type')
  })

  it('reports every required field of the selected type through the Zod schema', () => {
    const form = createEventFormState(null, ['悬赏令'])
    form.title = '悬赏'
    const parsed = createEventFormSchema(['悬赏令']).safeParse(form)
    if (parsed.success) throw new Error('expected the schema to reject the empty form')
    expect(parsed.error.issues.map((issue) => issue.path[0])).toEqual([
      'initiator_avatar',
      'reward'
    ])
    expect(parsed.error.issues[0]?.message).toBe('请填写或上传发起人头像')
  })
})

describe('event status and signup rules', () => {
  it('keeps the archived per-type status overrides', () => {
    expect(eventStatusLabel('STG', 'published')).toBe('报名中')
    expect(eventStatusLabel('则则', 'published')).toBe('报名中')
    expect(eventStatusLabel('线下聚会', 'published')).toBe('倒计时')
    expect(eventStatusLabel('悬赏令', 'published')).toBe('已发布')
    expect(eventStatusLabel('STG', 'settled')).toBe('已验收')
    expect(eventStatusLabel('STG', 'unexpected')).toBe('unexpected')
  })

  it('only exposes the frozen public statuses and signup types', () => {
    expect(isPublicEventStatus('published')).toBe(true)
    expect(isPublicEventStatus('settled')).toBe(true)
    for (const status of ['draft', 'pending', 'rejected', 'deleted', '', null])
      expect(isPublicEventStatus(status)).toBe(false)
    expect(supportsSignup('STG')).toBe(true)
    expect(supportsSignup('则则')).toBe(true)
    for (const type of ['悬赏令', '对赌协议', '线下聚会'])
      expect(supportsSignup(type)).toBe(false)
  })
})

describe('event payload contracts', () => {
  it('separates the flat UI model from the outgoing DTO', () => {
    const form = createEventFormState(fixtureEvents[2])
    const payload = buildEventPayload(form)
    expect(eventSaveRequestSchema.safeParse({ ...payload, submit: true }).success).toBe(true)
    // A flat model is not a DTO: field keys belong inside `content`.
    expect(eventSaveRequestSchema.safeParse(form).success).toBe(false)
    expect(
      eventSaveRequestSchema.safeParse({ ...payload, type: 'not-a-type' }).success
    ).toBe(false)
  })

  it('bounds signup input without inventing format rules', () => {
    expect(eventSignupSchema.safeParse({ common_id: '⑨', qq: '123456', avatar: '/a.png' }).success)
      .toBe(true)
    expect(eventSignupSchema.safeParse({ common_id: '', qq: '1', avatar: '/a.png' }).success)
      .toBe(false)
    expect(eventSignupSchema.safeParse({ common_id: '⑨', qq: '', avatar: '/a.png' }).success)
      .toBe(false)
    expect(eventSignupSchema.safeParse({ common_id: '⑨', qq: '1', avatar: '' }).success)
      .toBe(false)
    // Free-form machine sign / pilot source stay accepted like the frozen backend.
    expect(
      eventSignupSchema.safeParse({
        common_id: '⑨',
        qq: '1',
        avatar: '/a.png',
        machine_sign: '随便写',
        pilot_source: '其他'
      }).success
    ).toBe(true)
  })
})

describe('guest draft and submit flow', () => {
  it('shares one draft between upload and submission, including a failed retry', async () => {
    const calls: unknown[] = []
    let attempts = 0
    const api: EventWriteApi = {
      async createDraft() {
        calls.push(['createDraft'])
        return { id: 27 }
      },
      async saveDraft(id, payload) {
        calls.push(['saveDraft', id, payload])
        if (++attempts === 1) throw new Error('网络中断')
        return { message: '保存成功' }
      },
      async publishEvent() {
        throw new Error('guest flow must not publish')
      }
    }
    const draftSession = createDraftSession(api)
    expect(await Promise.all([draftSession.ensureId(), draftSession.ensureId()])).toEqual([27, 27])
    const payload = { type: 'STG', title: '比赛', content: { rules: '规则' } }
    await expect(saveEventForm(api, payload, { isAdmin: false, draftSession })).rejects.toThrow(
      '网络中断'
    )
    const result = await saveEventForm(api, payload, { isAdmin: false, draftSession })
    expect(result.id).toBe(27)
    expect(calls).toEqual([
      ['createDraft'],
      ['saveDraft', 27, { ...payload, submit: true }],
      ['saveDraft', 27, { ...payload, submit: true }]
    ])
  })

  it('publishes directly for admin creation and preserves status on edits', async () => {
    const calls: unknown[] = []
    const api: EventWriteApi = {
      async createDraft() {
        throw new Error('admin creation must not create a guest draft')
      },
      async saveDraft(id, payload) {
        calls.push(['saveDraft', id, payload])
        return { id: String(id) }
      },
      async publishEvent(payload) {
        calls.push(['publishEvent', payload])
        return { id: 42 }
      }
    }
    const payload = { type: '则则', title: '比赛', content: { results: [{ rank: 1, id: 'A' }] } }
    await saveEventForm(api, payload, { isAdmin: true })
    await saveEventForm(api, payload, { isAdmin: true, eventId: 42 })
    expect(calls).toEqual([
      ['publishEvent', { ...payload, status: 'published' }],
      ['saveDraft', 42, { ...payload, submit: false }]
    ])
  })

  it('keeps a failed draft creation retriable instead of poisoning the session', async () => {
    let attempts = 0
    const draftSession = createDraftSession({
      async createDraft() {
        if (++attempts === 1) return { id: Number.NaN }
        return { id: 8 }
      },
      async saveDraft() {
        return {}
      },
      async publishEvent() {
        return {}
      }
    })
    await expect(draftSession.ensureId()).rejects.toThrow('未获取到活动草稿')
    expect(await draftSession.ensureId()).toBe(8)
    expect(attempts).toBe(2)
  })
})
