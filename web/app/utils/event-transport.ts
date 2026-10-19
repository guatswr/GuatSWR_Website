import {
  createDraftSession,
  eventSignupRecordSchema,
  eventSignupSchema,
  saveEventForm
} from '@guatswr/shared'
import type {
  DraftSession,
  EventPayload,
  EventSignupInput,
  EventSignupRecord,
  EventWriteApi
} from '@guatswr/shared'
import type { BffMutationFacadeOptions } from './bff-session-core'

/**
 * One typed transport for every guest event write.
 *
 * It exists so the interactive UI never learns HTTP details and, more
 * importantly, so the auth batch can inject the session/CSRF headers in one
 * place. This module never stores a token, never builds an `Authorization`
 * header, and never retries a mutation on its own.
 */

export type EventTransportErrorCode =
  | 'unauthenticated'
  | 'forbidden'
  | 'not-found'
  | 'invalid'
  | 'unavailable'
  | 'network'
  | 'csrf-invalid'

export class EventTransportError extends Error {
  readonly code: EventTransportErrorCode
  readonly status: number | undefined

  constructor(code: EventTransportErrorCode, message: string, status?: number) {
    super(message)
    this.name = 'EventTransportError'
    this.code = code
    this.status = status
  }
}

/** Guest BFF paths proposed for the central server batch (see docs/revamp/EVENTS.md). */
export const EVENT_BFF_PATHS = {
  guestDraft: '/api/bff/guest/events/draft',
  guestEvent: (id: number) => `/api/bff/guest/events/${id}`,
  guestSignup: (id: number) => `/api/bff/guest/events/${id}/signup`,
  guestUploadContent: '/api/bff/guest/upload/content',
  guestUploadAvatar: '/api/bff/guest/upload/avatar',
  adminEvents: '/api/bff/admin/events'
} as const

/** Upload guard shared by every event form; the backend keeps the final say. */
export const UPLOAD_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml'
] as const

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024

export const isUploadableImage = (file: File): boolean =>
  (UPLOAD_IMAGE_TYPES as readonly string[]).includes(file.type) &&
  file.size <= MAX_UPLOAD_BYTES

export interface UploadProgress {
  loaded: number
  total: number
  percent: number
}

export interface UploadOptions {
  /** Cancels the transfer on unmount or when a newer file replaces this one. */
  signal?: AbortSignal
  onProgress?: (progress: UploadProgress) => void
  /** Session/CSRF headers resolved by the transport, never stored here. */
  headers?: Record<string, string>
}

/** Injectable so tests can drive progress/abort without a real browser. */
export type UploadSender = (
  url: string,
  file: File,
  fields: Record<string, string>,
  options: UploadOptions
) => Promise<{ url: string }>

export interface EventTransportOptions {
  fetch?: typeof fetch
  upload?: UploadSender
  baseURL?: string
  /**
   * Supplied by the auth batch (opaque session bound by the BFF). Called per
   * request so a rotated CSRF token is never cached here and no token is stored
   * in the client layer.
   */
  getHeaders?: () => Record<string, string> | Promise<Record<string, string>>
  /** Per-app coordinator. Only explicit pre-write CSRF rejection is retried. */
  performMutation?: <T>(options: BffMutationFacadeOptions<T>) => Promise<T>
  /** Admin pages pass a protected transport; the guest default cannot publish. */
  canPublish?: boolean
}

export interface EventTransport extends EventWriteApi {
  readSignup(eventId: number): Promise<EventSignupRecord | null>
  saveSignup(eventId: number, input: EventSignupInput): Promise<void>
  deleteSignup(eventId: number): Promise<void>
  uploadContent(
    file: File,
    eventId: number | null,
    options?: UploadOptions
  ): Promise<{ url: string }>
  uploadAvatar(
    file: File,
    eventId: number,
    options?: UploadOptions
  ): Promise<{ url: string }>
  draftSession(): DraftSession
  submit(
    payload: EventPayload,
    options: { eventId?: number | null; isAdmin?: boolean; draftSession?: DraftSession }
  ): Promise<Record<string, unknown>>
}

export const eventResponseError = (status: number, payload?: unknown): EventTransportError => {
  if (status === 403 && typeof payload === 'object' && payload !== null &&
      'error' in payload && typeof payload.error === 'object' && payload.error !== null &&
      'code' in payload.error && payload.error.code === 'csrf_invalid')
    return new EventTransportError('csrf-invalid', '请求校验失败，请重试', status)
  if (status === 401) return new EventTransportError('unauthenticated', '登录状态已失效，请重新登录', status)
  if (status === 403) return new EventTransportError('forbidden', '没有权限执行该操作', status)
  if (status === 404) return new EventTransportError('not-found', '找不到该活动', status)
  if (status >= 500) return new EventTransportError('unavailable', '服务暂时不可用，请稍后重试', status)
  return new EventTransportError('invalid', '提交的内容未通过校验', status)
}

export const MAX_EVENT_RESPONSE_BYTES = 64 * 1024

/** Ignore raw server error messages; only the exact CSRF code has retry meaning. */
export function parseEventResponseText(text: string): unknown {
  if (new TextEncoder().encode(text).byteLength > MAX_EVENT_RESPONSE_BYTES)
    throw new EventTransportError('unavailable', '服务响应超出限制，请重试')
  try { return JSON.parse(text) as unknown } catch { return undefined }
}

async function readResponse(response: Response): Promise<unknown> {
  const declared = response.headers.get('content-length')
  if (declared && /^\d+$/.test(declared) && Number(declared) > MAX_EVENT_RESPONSE_BYTES) {
    await response.body?.cancel().catch(() => {})
    throw new EventTransportError('unavailable', '服务响应超出限制，请重试')
  }
  if (!response.body) return parseEventResponseText(await response.text())
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let bytes = 0
  let text = ''
  try {
    for (;;) {
      const part = await reader.read()
      if (part.done) break
      bytes += part.value.byteLength
      if (bytes > MAX_EVENT_RESPONSE_BYTES) {
        await reader.cancel().catch(() => {})
        throw new EventTransportError('unavailable', '服务响应超出限制，请重试')
      }
      text += decoder.decode(part.value, { stream: true })
    }
    return parseEventResponseText(text + decoder.decode())
  } finally { reader.releaseLock() }
}

function createEventTransport(options: EventTransportOptions = {}): EventTransport {
  const send = options.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args))
  const upload = options.upload ?? (() => Promise.reject(
    new EventTransportError('network', '上传组件未初始化')
  ))
  const base = options.baseURL ?? ''
  const mutate = <T>(send: (token?: string) => Promise<T>): Promise<T> =>
    options.performMutation
      ? options.performMutation({ send, isCsrfRejection: error => error instanceof EventTransportError && error.status === 403 && error.code === 'csrf-invalid' })
      : send()

  async function request(
    path: string,
    init: RequestInit & { json?: unknown } = {}
  ): Promise<Record<string, unknown>> {
    const execute = async (token?: string): Promise<Record<string, unknown>> => {
      const headers: Record<string, string> = {
        accept: 'application/json',
        ...(await options.getHeaders?.()),
        ...(token ? { 'x-csrf-token': token } : {}),
      }
      let body = init.body
      if (init.json !== undefined) {
        headers['content-type'] = 'application/json'
        body = JSON.stringify(init.json)
      }
      const deadline = new AbortController()
      const timer = setTimeout(() => deadline.abort(), 15_000)
      try {
        const response = await send(`${base}${path}`, {
          ...init,
          body,
          headers,
          // Same-origin session cookie only; never a manually attached token.
          credentials: 'same-origin',
          redirect: 'error',
          signal: init.signal ? AbortSignal.any([init.signal, deadline.signal]) : deadline.signal,
        })
        if (response.status === 204 && response.ok) return {}
        const parsed = await readResponse(response)
        if (!response.ok) throw eventResponseError(response.status, parsed)
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
          throw new EventTransportError('unavailable', '服务返回了无法解析的响应')
        return parsed as Record<string, unknown>
      } catch (error) {
        if (error instanceof EventTransportError) throw error
        throw deadline.signal.aborted
          ? new EventTransportError('unavailable', '请求超时，请重试')
          : new EventTransportError('network', '网络连接失败，请重试')
      } finally { clearTimeout(timer) }
    }
    return init.method && init.method !== 'GET' ? mutate(execute) : execute()
  }

  const transport: EventTransport = {
    async createDraft() {
      const response = await request(EVENT_BFF_PATHS.guestDraft, { method: 'POST' })
      const id = Number(response.id)
      if (!Number.isInteger(id) || id <= 0)
        throw new EventTransportError('unavailable', '未获取到活动草稿，请重试')
      return { id }
    },
    async saveDraft(id, payload) {
      return await request(EVENT_BFF_PATHS.guestEvent(id), {
        method: 'PUT',
        json: payload
      })
    },
    async publishEvent(payload) {
      if (!options.canPublish)
        throw new EventTransportError('forbidden', '当前身份不能直接发布活动，请提交审核')
      return await request(EVENT_BFF_PATHS.adminEvents, { method: 'POST', json: payload })
    },
    async readSignup(eventId) {
      const response = await request(EVENT_BFF_PATHS.guestSignup(eventId), { method: 'GET' })
      const data = response.data
      if (!data || typeof data !== 'object') return null
      const parsed = eventSignupRecordSchema.safeParse(data)
      return parsed.success ? parsed.data : null
    },
    async saveSignup(eventId, input) {
      const parsed = eventSignupSchema.safeParse(input)
      if (!parsed.success)
        throw new EventTransportError(
          'invalid',
          parsed.error.issues[0]?.message ?? '请检查报名信息'
        )
      await request(EVENT_BFF_PATHS.guestSignup(eventId), { method: 'POST', json: parsed.data })
    },
    async deleteSignup(eventId) {
      await request(EVENT_BFF_PATHS.guestSignup(eventId), { method: 'DELETE' })
    },
    async uploadContent(file, eventId, uploadOptions = {}) {
      return await mutate(async token => upload(
        `${base}${EVENT_BFF_PATHS.guestUploadContent}`,
        file,
        eventId ? { eid: String(eventId) } : {},
        { ...uploadOptions, headers: { ...(await options.getHeaders?.()), ...(token ? { 'x-csrf-token': token } : {}) } }
      ))
    },
    async uploadAvatar(file, eventId, uploadOptions = {}) {
      return await mutate(async token => upload(
        `${base}${EVENT_BFF_PATHS.guestUploadAvatar}`,
        file,
        { eid: String(eventId) },
        { ...uploadOptions, headers: { ...(await options.getHeaders?.()), ...(token ? { 'x-csrf-token': token } : {}) } }
      ))
    },
    draftSession() {
      return createDraftSession(transport)
    },
    async submit(payload, submitOptions) {
      // The caller owns the draft session so an image upload and the submission
      // reuse one draft id (archived behaviour).
      return await saveEventForm(transport, payload, {
        eventId: submitOptions.eventId ?? null,
        isAdmin: Boolean(options.canPublish && submitOptions.isAdmin),
        draftSession: submitOptions.draftSession ?? transport.draftSession()
      })
    }
  }
  return transport
}

export { createEventTransport }
