export const eventRoutes = {
  '悬赏令': '/events/bounty', '对赌协议': '/events/betting',
  STG: '/events/stg', '则则': '/events/zetime', '线下聚会': '/events/party'
}

const EVENT_TYPE_LABELS = {
  '悬赏令': '悬赏令',
  '对赌协议': '对赌协议',
  STG: '东方 STG',
  '则则': '非想天则',
  '线下聚会': '线下聚会'
}

export function eventContent(event) {
  try {
    const content = typeof event?.content === 'string' ? JSON.parse(event.content) : event?.content
    return content && typeof content === 'object' && !Array.isArray(content) ? content : {}
  } catch { return {} }
}

export function eventTime(event) {
  const content = eventContent(event)
  return content.deadline || content.end_time || content.time || ''
}

// The API stores a short type token. Keep the public card readable without
// changing the stored value or the event routes.
export function eventTypeLabel(type) {
  if (!type) return '同好活动'
  return EVENT_TYPE_LABELS[type] || type
}

// Deadlines and start times are different promises; the homepage card must not
// present a submission deadline as if it were the day of the event.
export function eventSchedule(event) {
  const content = eventContent(event)
  if (event?.status === 'ongoing' && content.end_time) return { prefix: '至', value: content.end_time }
  if (content.deadline) return { prefix: '截止', value: content.deadline }
  if (content.time) return { prefix: '开始', value: content.time }
  if (content.end_time) return { prefix: '至', value: content.end_time }
  return { prefix: '', value: '' }
}

export function eventStatusLabel(event, now = Date.now()) {
  if (event?.status === 'ongoing') return '进行中'
  const content = eventContent(event)
  const deadline = parseClubTime(content.deadline)
  if (content.deadline && Number.isFinite(deadline) && deadline > now) return '报名中'
  if (content.time || content.end_time) return '即将开始'
  return '待定'
}

// datetime-local values are authored in Beijing time, regardless of the
// visitor's browser timezone. Explicit offsets from older content stay intact.
export function parseClubTime(value) {
  if (value instanceof Date) return value.getTime()
  if (typeof value !== 'string' || !value.trim()) return NaN
  const text = value.trim()
  const localIso = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?))?$/.exec(text)
  if (localIso) return Date.parse(`${localIso[1]}T${localIso[2] || '00:00'}+08:00`)
  // Free-form legacy text is preserved in the editor, but must not be parsed
  // using a browser-specific date locale or timezone on the public portal.
  return /(?:Z|[+-]\d{2}:?\d{2})$/i.test(text) ? Date.parse(text) : NaN
}

export function formatClubDate(value, options = {}) {
  if (!value) return options.fallback ?? '时间待确认'
  const date = new Date(parseClubTime(value))
  if (Number.isNaN(date.getTime())) return options.fallback ?? '时间待确认'
  const formatter = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    ...(options.year ? { year: 'numeric' } : {}),
    month: 'long',
    day: 'numeric'
  })
  const text = formatter.format(date)
  if (!options.weekday) return text
  return `${text} · ${new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    weekday: 'short'
  }).format(date)}`
}

export function formatClubTime(value) {
  if (!value || !/(?:T|\s)\d{1,2}:\d{2}/.test(String(value))) return ''
  const date = new Date(parseClubTime(value))
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(date)
}

export function upcomingEvents(events, now = Date.now()) {
  return events.filter(event => {
    if (!['published', 'ongoing'].includes(event?.status)) return false
    const content = eventContent(event)
    // Registration closing is distinct from the end of an ongoing event.
    const value = event.status === 'ongoing' ? content.end_time : eventTime(event)
    if (!value) return true
    const timestamp = parseClubTime(value)
    return Number.isFinite(timestamp) && timestamp > now
  }).sort((a, b) => {
    if (a.status !== b.status) return a.status === 'ongoing' ? -1 : 1
    const timestamp = event => {
      const value = parseClubTime(eventTime(event))
      return Number.isFinite(value) ? value : Infinity
    }
    return timestamp(a) - timestamp(b)
  })
}

export function eventSummary(event) {
  const content = eventContent(event)
  return content.description || content.copy || content.challenge || content.requirements || content.location || '打开活动板，了解规则与参与方式。'
}
