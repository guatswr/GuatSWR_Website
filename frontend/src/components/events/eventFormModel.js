export const EVENT_TYPES = ['悬赏令', '对赌协议', 'STG', '则则', '线下聚会']

const field = (key, label, kind = 'text', extra = {}) => ({ key, label, kind, ...extra })
const schedule = (key, label) => field(key, label, 'datetime-local', { hint: '北京时间；已有的文字时间也会保留。' })

export const EVENT_FIELDS = {
  悬赏令: [
    field('initiator_id', '发起人 ID'), field('initiator_qq', '发起人 QQ', 'tel'),
    field('initiator_avatar', '发起人头像', 'image', { required: true }),
    field('challenge', '挑战形式'), field('requirements', '挑战要求', 'textarea'),
    field('reward', '奖励', 'text', { required: true }), field('limit', '参与限制'),
    schedule('deadline', '截止时间')
  ],
  对赌协议: [
    field('a_id', '发起者 ID'), field('a_qq', '发起者 QQ', 'tel'), field('a_goal', '发起者目标'),
    field('a_avatar', '发起者头像', 'image', { required: true }),
    field('b_id', '对手 ID', 'text', { duo: true, required: true }),
    field('b_qq', '对手 QQ', 'tel', { duo: true }), field('b_goal', '对手目标', 'text', { duo: true }),
    field('b_avatar', '对手头像', 'image', { duo: true, required: true }),
    field('penalty', '惩罚 / 代价', 'textarea'), schedule('deadline', '截止时间'),
    field('proof_image', '存档截图', 'image')
  ],
  STG: [
    field('copy', '活动文案', 'textarea'), field('cover', '活动封面', 'image'), schedule('time', '活动时间'),
    field('rules', '比赛规则', 'textarea'), field('prizes', '奖品', 'textarea'), field('notes', '注意事项', 'textarea')
  ],
  则则: [
    field('copy', '活动文案', 'textarea'), field('cover', '活动封面', 'image'), schedule('time', '活动时间'),
    field('rules', '比赛规则', 'textarea'), field('prizes', '奖品', 'textarea'), field('notes', '注意事项', 'textarea')
  ],
  线下聚会: [
    field('cover', '活动封面', 'image'), schedule('time', '聚会时间'), field('location', '聚会地点'),
    field('gather_type', '聚会类型', 'select', { options: ['小聚', '大聚', '饭聚', '其他'] }),
    field('notes', '备注', 'textarea')
  ]
}

export function getEventTypes(allowedTypes = EVENT_TYPES) {
  return [...new Set(allowedTypes)].filter((type) => EVENT_TYPES.includes(type))
}

function parseContent(value) {
  try {
    const content = typeof value === 'string' ? JSON.parse(value) : value
    return content && typeof content === 'object' && !Array.isArray(content)
      ? JSON.parse(JSON.stringify(content)) : {}
  } catch {
    return {}
  }
}

export function createEventFormState(event = null, allowedTypes = EVENT_TYPES) {
  const content = parseContent(event?.content)
  const state = { type: event?.type || allowedTypes[0] || '', title: event?.title || '', betMode: content.b ? 'duo' : 'solo' }
  for (const item of Object.values(EVENT_FIELDS).flat()) state[item.key] = String(content[item.key] ?? '')
  for (const [prefix, person] of [['initiator', content.initiator], ['a', content.a], ['b', content.b]]) {
    for (const key of ['id', 'qq', 'avatar', 'goal']) state[`${prefix}_${key}`] = String(person?.[key] ?? '')
  }
  state.cover = String(content.cover || content.cover_image || content.image || '')
  return state
}

export function getEventFields(form) {
  return (EVENT_FIELDS[form.type] || []).filter((item) => !item.duo || form.betMode === 'duo')
}

export function validateEventForm(form, allowedTypes = EVENT_TYPES) {
  if (!allowedTypes.includes(form.type)) return { field: 'type', message: '请选择支持的活动类型' }
  if (!form.title.trim()) return { field: 'title', message: '请填写标题' }
  for (const item of getEventFields(form)) {
    if (item.required && !String(form[item.key] || '').trim()) return { field: item.key, message: `请填写或上传${item.label}` }
  }
  return null
}

export function buildEventPayload(form, initialData = null) {
  // Retain rankings, settlement details, and future fields when editing existing content.
  const content = initialData?.type === form.type ? parseContent(initialData.content) : {}
  const values = (...keys) => Object.fromEntries(keys.map((key) => [key, String(form[key] ?? '').trim()]))
  const person = (prefix, previous) => ({
    ...previous,
    ...Object.fromEntries(['id', 'qq', 'avatar', ...(prefix === 'initiator' ? [] : ['goal'])]
      .map((key) => [key, String(form[`${prefix}_${key}`] ?? '').trim()]))
  })
  if (form.type === '悬赏令') {
    Object.assign(content, values('challenge', 'requirements', 'reward', 'limit', 'deadline'), { initiator: person('initiator', content.initiator) })
  } else if (form.type === '对赌协议') {
    Object.assign(content, values('penalty', 'deadline', 'proof_image'), {
      a: person('a', content.a), b: form.betMode === 'duo' ? person('b', content.b) : null
    })
  } else if (form.type === 'STG' || form.type === '则则') {
    Object.assign(content, values('copy', 'cover', 'time', 'rules', 'prizes', 'notes'))
  } else if (form.type === '线下聚会') {
    Object.assign(content, values('cover', 'time', 'location', 'gather_type', 'notes'))
  }
  return { type: form.type, title: form.title.trim(), content }
}

export function createDraftSession(api) {
  let draftId = null
  let pending = null
  return {
    async ensureId() {
      if (draftId) return draftId
      if (!pending) {
        pending = api.post('/api/event/draft').then((response) => {
          const id = Number(response.data?.id)
          if (!Number.isInteger(id) || id <= 0) throw new Error('未获取到活动草稿，请重试')
          draftId = id
          return id
        }).finally(() => { pending = null })
      }
      return pending
    }
  }
}

export async function saveEventForm(api, payload, { eventId, isAdmin, draftSession }) {
  if (eventId) {
    // submit:false preserves published/ongoing/settled status on the existing PUT endpoint.
    const response = await api.put(`/api/event/${eventId}`, { ...payload, submit: false })
    return { ...response.data, id: eventId }
  }
  if (isAdmin) {
    const response = await api.post('/api/event/admin', { ...payload, status: 'published' })
    return response.data
  }
  const id = await draftSession.ensureId()
  const response = await api.put(`/api/event/${id}`, { ...payload, submit: true })
  return { ...response.data, id }
}
