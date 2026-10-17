export const eventRoutes = {
  '悬赏令': '/events/bounty', '对赌协议': '/events/betting',
  STG: '/events/stg', '则则': '/events/zetime', '线下聚会': '/events/party'
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

export function formatClubDate(value) {
  if (!value) return '时间待确认'
  const date = new Date(parseClubTime(value))
  if (Number.isNaN(date.getTime())) return '时间待确认'
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', month: 'long', day: 'numeric'
  }).format(date)
}

export function eventSummary(event) {
  const content = eventContent(event)
  return content.description || content.copy || content.challenge || content.requirements || content.location || '打开活动板，了解规则与参与方式。'
}
