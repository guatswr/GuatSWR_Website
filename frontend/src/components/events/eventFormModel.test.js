import test from 'node:test'
import assert from 'node:assert/strict'
import {
  EVENT_TYPES, buildEventPayload, createDraftSession, createEventFormState,
  getEventFields, getEventTypes, saveEventForm, validateEventForm
} from './eventFormModel.js'

test('all five current event types round-trip the public card fields', () => {
  const fixtures = [
    { type: '悬赏令', content: { initiator: { id: '⑨', qq: '123456', avatar: '/avatar.png' }, challenge: '一命通关', requirements: '直播', reward: '吧唧', limit: '一次', deadline: '2026-11-01T14:00' } },
    { type: '对赌协议', content: { a: { id: 'A', qq: '111', avatar: '/a.png', goal: '通关' }, b: { id: 'B', qq: '222', avatar: '/b.png', goal: '一命' }, penalty: '画画', deadline: '2026-11-01T14:00', proof_image: '/proof.png' } },
    ...['STG', '则则'].map((type) => ({ type, content: { copy: '比赛报名', cover: '/cover.png', time: '2026-11-01T14:00', rules: '双败淘汰', prizes: '纪念品', notes: '自带设备' } })),
    { type: '线下聚会', content: { cover: '/party.png', time: '2026-11-01T14:00', location: '活动室', gather_type: '饭聚', notes: '提前报名' } }
  ]
  assert.deepEqual(fixtures.map(({ type }) => type), EVENT_TYPES)
  for (const fixture of fixtures) {
    const event = { ...fixture, title: `${fixture.type}活动` }
    const form = createEventFormState(event)
    assert.equal(validateEventForm(form), null)
    assert.deepEqual(buildEventPayload(form, event), event)
  }
})

test('editing retains rankings, settlement, unknown nested fields and original state', () => {
  const event = {
    type: '悬赏令', title: '原标题', status: 'settled', content: {
      initiator: { id: '⑨', avatar: '/avatar.png', qq: '123', extra: '保留' },
      reward: '吧唧', completion: { id: '完成者', time: '周末' },
      results: [{ rank: 1, id: '选手' }], future: { featured: true }
    }
  }
  const before = JSON.stringify(event)
  const form = createEventFormState(event)
  form.title = ' 修改后 '
  const payload = buildEventPayload(form, event)
  assert.equal(payload.title, '修改后')
  assert.deepEqual(payload.content.results, event.content.results)
  assert.deepEqual(payload.content.completion, event.content.completion)
  assert.deepEqual(payload.content.future, event.content.future)
  assert.equal(payload.content.initiator.extra, '保留')
  payload.content.results[0].id = '新值'
  assert.equal(JSON.stringify(event), before)
})

test('legacy JSON content, text schedules and unknown gathering labels remain editable', () => {
  const event = { type: '线下聚会', title: '聚会', content: JSON.stringify({ time: '下周六下午', gather_type: '返校聚餐', location: '食堂' }) }
  const form = createEventFormState(event)
  assert.equal(form.time, '下周六下午')
  assert.equal(buildEventPayload(form, event).content.gather_type, '返校聚餐')
  assert.equal(createEventFormState({ content: '{invalid' }).type, '悬赏令')
})

test('type restrictions, whitespace titles and solo/duo required fields are validated', () => {
  assert.deepEqual(getEventTypes(['STG', 'wrong', 'STG', '则则']), ['STG', '则则'])
  const form = createEventFormState(null, ['对赌协议'])
  assert.equal(validateEventForm(form).field, 'title')
  form.title = '  '
  assert.equal(validateEventForm(form).field, 'title')
  form.title = '赌约'
  assert.equal(validateEventForm(form).field, 'a_avatar')
  form.a_avatar = '/a.png'
  assert.equal(validateEventForm(form), null)
  assert.equal(buildEventPayload(form).content.b, null)
  form.betMode = 'duo'
  assert.equal(validateEventForm(form).field, 'b_id')
  form.b_id = 'B'
  assert.equal(validateEventForm(form).field, 'b_avatar')
  assert.ok(getEventFields(form).some(({ key }) => key === 'b_goal'))
  assert.equal(validateEventForm(form, ['STG']).field, 'type')
})

test('guest upload and submission share one draft, including a failed submission retry', async () => {
  const calls = []
  let attempts = 0
  const api = {
    async post(url) { calls.push(['POST', url]); return { data: { id: 27 } } },
    async put(url, body) {
      calls.push(['PUT', url, body])
      if (++attempts === 1) throw new Error('网络中断')
      return { data: { message: '保存成功' } }
    }
  }
  const draftSession = createDraftSession(api)
  assert.deepEqual(await Promise.all([draftSession.ensureId(), draftSession.ensureId()]), [27, 27])
  const payload = { type: 'STG', title: '比赛', content: { rules: '规则' } }
  await assert.rejects(saveEventForm(api, payload, { isAdmin: false, draftSession }), /网络中断/)
  const result = await saveEventForm(api, payload, { isAdmin: false, draftSession })
  assert.equal(result.id, 27)
  assert.deepEqual(calls, [
    ['POST', '/api/event/draft'],
    ['PUT', '/api/event/27', { ...payload, submit: true }],
    ['PUT', '/api/event/27', { ...payload, submit: true }]
  ])
})

test('admin creation publishes directly; edits preserve status without creating or approving', async () => {
  const calls = []
  const api = {
    async post(url, body) { calls.push(['POST', url, body]); return { data: { id: 42 } } },
    async put(url, body) { calls.push(['PUT', url, body]); return { data: { id: '42' } } }
  }
  const payload = { type: '则则', title: '比赛', content: { results: [{ rank: 1, id: 'A' }] } }
  await saveEventForm(api, payload, { isAdmin: true })
  await saveEventForm(api, payload, { isAdmin: true, eventId: 42 })
  assert.deepEqual(calls, [
    ['POST', '/api/event/admin', { ...payload, status: 'published' }],
    ['PUT', '/api/event/42', { ...payload, submit: false }]
  ])
})

test('a failed draft creation is retriable instead of poisoning the session', async () => {
  let attempts = 0
  const draftSession = createDraftSession({ async post() {
    if (++attempts === 1) return { data: {} }
    return { data: { id: 8 } }
  } })
  await assert.rejects(draftSession.ensureId(), /未获取到/)
  assert.equal(await draftSession.ensureId(), 8)
  assert.equal(attempts, 2)
})
