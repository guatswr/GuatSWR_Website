/** Archived datetime-local values use Beijing time; explicit offsets stay intact. */
export function parseClubTime(value: unknown): number {
  if (value instanceof Date) return value.getTime()
  if (typeof value !== 'string' || !value.trim()) return NaN
  const text = value.trim()
  const localIso = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?))?$/.exec(text)
  if (localIso) return Date.parse(`${localIso[1]}T${localIso[2] || '00:00'}+08:00`)
  return /(?:Z|[+-]\d{2}:?\d{2})$/i.test(text) ? Date.parse(text) : NaN
}

/** Only an explicit string deadline gates signup; time/end_time are not substitutes. */
export function signupDeadlineClosed(content: unknown, now = Date.now()): boolean {
  if (!content || typeof content !== 'object') return false
  const raw = (content as Record<string, unknown>).deadline
  if (typeof raw !== 'string' || !raw) return false
  const deadline = parseClubTime(raw)
  return Number.isFinite(deadline) && deadline <= now
}
