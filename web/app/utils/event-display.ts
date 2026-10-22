import type { PublicEvent, PublicEventContent } from '@guatswr/shared'
import { eventStatusLabel } from '@guatswr/shared/event-labels'
import { getThumbUrl } from './image-url'
// Frozen Beijing-time helper from the homepage batch: deadlines are authored in
// Beijing time, so they must not be parsed with the visitor's browser locale.
import { parseClubTime } from './club-date'

/** Card/board display helpers, ported from the archived `EventCard.vue` computed set. */

export const EVENT_COUNTDOWN_LIMIT = 3

export function eventCoverUrl(content: PublicEventContent | undefined): string {
  if (!content) return ''
  return (
    content.cover ||
    content.cover_image ||
    content.image ||
    content.proof_image ||
    ''
  )
}

export function eventCoverThumb(content: PublicEventContent | undefined): string {
  return getThumbUrl(eventCoverUrl(content))
}

export function eventDeadlineValue(content: PublicEventContent | undefined): string {
  if (!content) return ''
  return content.deadline || content.time || content.end_time || ''
}

/** Schedules use Beijing time on both the server and the client. */
export function eventDeadlineText(value: string): string {
  if (!value) return ''
  const date = new Date(parseClubTime(value))
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(date)
}

/**
 * Countdown text. Unlike the archived version this resolves the deadline with the
 * Beijing-time rule, so `剩余` is correct outside UTC+8; the rendered strings and
 * thresholds are unchanged.
 */
export function eventCountdown(value: string, now: number = Date.now()): string {
  if (!value) return ''
  const timestamp = parseClubTime(value)
  if (!Number.isFinite(timestamp)) return ''
  const diff = timestamp - now
  if (diff <= 0) return '已截止'
  const hours = Math.floor(diff / (1000 * 60 * 60))
  const days = Math.floor(hours / 24)
  const remainHours = hours % 24
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
  if (days > 0) return `${days}天 ${remainHours}小时`
  if (hours > 0) return `${hours}小时 ${minutes}分钟`
  return `${minutes}分钟`
}

export function eventTopResults(
  content: PublicEventContent | undefined,
  limit: number = EVENT_COUNTDOWN_LIMIT
): PublicEventContent['results'] {
  const list = Array.isArray(content?.results) ? content.results : []
  return list.slice(0, limit)
}

/**
 * The signup deadline as a Beijing-anchored timestamp, or null when the stored
 * value is free text. The backend keeps the final say; this only drives the UI.
 */
export function eventSignupDeadline(
  content: PublicEventContent | undefined
): number | null {
  const value = eventDeadlineValue(content)
  if (!value) return null
  const timestamp = parseClubTime(value)
  return Number.isFinite(timestamp) ? timestamp : null
}

export function isEventSignupOpen(
  content: PublicEventContent | undefined,
  now: number = Date.now()
): boolean {
  const deadline = eventSignupDeadline(content)
  return deadline === null || deadline > now
}

export function eventStatusText(event: PublicEvent | undefined): string {
  return eventStatusLabel(event?.type, event?.status)
}
