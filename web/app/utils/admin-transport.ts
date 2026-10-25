import { BffRequestError, isCsrfRejection } from './bff-client'
import type { BffSessionCore } from './bff-session-core'
import { adminBanInputSchema, backupSelectorSchema } from '@guatswr/shared/admin-workflows'

const resources = ['activities', 'members', 'history', 'events', 'logs', 'users', 'config'] as const
export type AdminResource = typeof resources[number]
type Method = 'GET' | 'POST' | 'PUT' | 'DELETE'
type Action = 'restore' | 'approve' | 'reject' | 'status' | 'settle' | 'results' | 'participants' | 'password' | 'twofa-reset'
export interface AdminRequest {
  resource: AdminResource
  method?: Method
  id?: number
  action?: Action
  query?: Record<string, string | number | boolean | undefined>
  body?: unknown
  signal?: AbortSignal
}
type Session = Pick<BffSessionCore, 'performMutation' | 'currentRevision' | 'clearPrivateState' | 'refresh'>
const commands = {
  activityDraft: ['POST', '/api/bff/admin/activities/draft'],
  profileRead: ['GET', '/api/bff/account/me'], profileUpdate: ['PUT', '/api/bff/account/profile'],
  recyclePurge: ['POST', '/api/bff/admin/recycle-bin/purge'], tokenRefresh: ['POST', '/api/bff/admin/token-version/refresh'],
  backupList: ['GET', '/api/bff/admin/backups'], backupSettings: ['GET', '/api/bff/admin/backups/settings'],
  backupConfigure: ['PUT', '/api/bff/admin/backups/settings'], backupRun: ['POST', '/api/bff/admin/backups/run'],
  banList: ['GET', '/api/bff/admin/bans'], banCreate: ['POST', '/api/bff/admin/bans'],
} as const
export type AdminCommand = keyof typeof commands

// This is a browser boundary, not an arbitrary same-origin fetch wrapper.
// Methods, nested actions and query names are closed independently of the BFF.
export function adminRequestPath(input: AdminRequest): string {
  if (!(resources as readonly string[]).includes(input.resource)) throw new Error('Unknown admin resource')
  const method = input.method ?? 'GET'
  if (!['GET', 'POST', 'PUT', 'DELETE'].includes(method)) throw new Error('Unknown admin method')
  const hasId = input.id !== undefined
  if (hasId && (!Number.isSafeInteger(input.id) || input.id! <= 0)) throw new Error('Invalid admin id')
  const actionMethod: Partial<Record<Action, Method>> = {
    restore: 'POST', approve: 'POST', reject: 'POST', status: 'POST', settle: 'POST',
    results: 'PUT', participants: 'GET', password: 'PUT', 'twofa-reset': 'PUT',
  }
  const actions: Partial<Record<AdminResource, readonly Action[]>> = {
    activities: ['restore'], members: ['restore'], history: ['restore'],
    events: ['approve', 'reject', 'status', 'settle', 'results', 'participants'],
    users: ['password', 'twofa-reset'],
  }
  if (input.action && (!hasId || !actions[input.resource]?.includes(input.action) || actionMethod[input.action] !== method))
    throw new Error('Invalid admin action')
  const queryKeys: Partial<Record<AdminResource, readonly string[]>> = {
    activities: ['page', 'limit', 'includeDeleted'], members: ['includeDeleted', 'original', 'school'],
    history: ['includeDeleted'], events: ['page', 'limit', 'status', 'type'], logs: ['page', 'limit', 'username', 'action'],
  }
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (!queryKeys[input.resource]?.includes(key) || method !== 'GET' || hasId) throw new Error('Invalid admin query')
    if (value !== undefined) query.set(key, typeof value === 'boolean' ? value ? '1' : '0' : String(value))
  }
  return `/api/bff/admin/${input.resource}${hasId ? `/${input.id}` : ''}${input.action ? `/${input.action}` : ''}${query.size ? `?${query}` : ''}`
}

async function boundedJson(response: Response, maxBytes: number): Promise<unknown> {
  const reader = response.body?.getReader()
  if (!reader) throw new BffRequestError(response.status, 'invalid_response', '服务响应异常')
  let length = 0
  const parts: Uint8Array[] = []
  try {
    for (;;) {
      const part = await reader.read()
      if (part.done) break
      length += part.value.byteLength
      if (length > maxBytes) throw new Error('Response limit')
      parts.push(part.value)
    }
    const bytes = new Uint8Array(length)
    let offset = 0
    for (const part of parts) { bytes.set(part, offset); offset += part.byteLength }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown
  }
  catch { throw new BffRequestError(response.status, 'invalid_response', '服务响应异常') }
  finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
}

export function createAdminTransport(session: Session, fetchImpl: typeof fetch = fetch) {
    async function execute<T>(path: string, method: Method, body: unknown, project: (value: unknown) => T, requestSignal?: AbortSignal, timeoutMs = 20_000): Promise<T> {
      const revision = session.currentRevision()
      try {
        const result = await session.performMutation({
          isCsrfRejection,
          async send(csrf) {
            const timeout = AbortSignal.timeout(timeoutMs)
            const signal = requestSignal ? AbortSignal.any([requestSignal, timeout]) : timeout
            let response: Response
            try {
              response = await fetchImpl(path, { method, credentials: 'same-origin', redirect: 'error', signal,
                headers: { accept: 'application/json', ...(method === 'GET' ? {} : { ...(body instanceof FormData ? {} : { 'content-type': 'application/json' }), 'x-csrf-token': csrf }) },
                body: method === 'GET' ? undefined : body instanceof FormData ? body : JSON.stringify(body ?? {}) })
            }
            catch { throw new BffRequestError(0, signal.aborted ? 'aborted' : 'network_error', '请求未完成，请重试') }
            const payload = await boundedJson(response, response.ok ? 4 * 1024 * 1024 : 64 * 1024)
            if (!response.ok) {
              const error = typeof payload === 'object' && payload !== null && 'error' in payload ? payload.error : null
              const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : null
              throw new BffRequestError(response.status,
                response.status === 403 && code === 'csrf_invalid' ? 'csrf_invalid'
                  : response.status === 401 ? 'session_expired' : response.status === 403 ? 'forbidden' : 'invalid_request',
                response.status === 401 ? '登录状态已失效，请重新登录' : response.status === 403 ? '权限不足' : '操作失败，请刷新后重试')
            }
            return payload
          },
        })
        if (session.currentRevision() !== revision) throw new BffRequestError(0, 'aborted', '登录状态已变化')
        const projected = project(result)
        if (typeof result === 'object' && result !== null && 'reauthenticate' in result && result.reauthenticate === true)
          session.clearPrivateState()
        return projected
      }
      catch (error) {
        // An ordinary permission denial must not log out the user. Re-read the
        // identity to observe a role downgrade, then discard private queries.
        if (error instanceof BffRequestError && error.status === 403 && error.code !== 'csrf_invalid'
          && session.currentRevision() === revision) await session.refresh()
        throw error
      }
    }
  return {
    memberSync<T>(action:'settings'|'requests'|'job'|'apply'|'profile'|'profiles',method:Method,body:unknown,project:(value:unknown)=>T,id?:string|number,signal?:AbortSignal) {
      const query=new URLSearchParams(id===undefined?{}:{id:String(id)})
      if(action==='job' && body && typeof body==='object') {
        if('page' in body)query.set('page',String(body.page))
        if('search' in body && typeof body.search==='string' && body.search)query.set('search',body.search)
      }
      return execute(`/api/bff/admin/member-sync/${action}${query.size?'?'+query:''}`,method,body,project,signal)
    },
    uploadEventAvatar(file: File, eventId: number, signal?: AbortSignal): Promise<string> {
      const path = adminRequestPath({ resource: 'events', id: eventId })
      if (!file.type.startsWith('image/') || file.size > 50 * 1024 * 1024) throw new Error('图片类型或大小无效')
      const body = new FormData()
      body.append('file', file)
      return execute(`${path}/avatar`, 'POST', body, value => {
        if (!value || typeof value !== 'object' || !('url' in value) || typeof value.url !== 'string') throw new Error('上传响应无效')
        return value.url
      }, signal, 60_000)
    },
    removeBan(ip: string, signal?: AbortSignal) {
      const input = adminBanInputSchema.parse({ ip })
      return execute(`/api/bff/admin/bans/${encodeURIComponent(input.ip)}`, 'DELETE', {}, value => value, signal)
    },
    deleteBackup(file: string, signal?: AbortSignal) {
      const selector = backupSelectorSchema.parse({ file })
      return execute(`/api/bff/admin/backups?${new URLSearchParams(selector)}`, 'DELETE', {}, value => value, signal)
    },
    command<T>(name: AdminCommand, body: unknown, project: (value: unknown) => T, signal?: AbortSignal): Promise<T> {
      if (!Object.hasOwn(commands, name)) throw new Error('Unknown admin command')
      const [method, path] = commands[name]
      return execute(path, method, body, project, signal, name === 'backupRun' ? 310_000 : 20_000)
    },
    request<T>(input: AdminRequest, project: (value: unknown) => T): Promise<T> {
      return execute(adminRequestPath(input), input.method ?? 'GET', input.body, project, input.signal)
    },
    upload(file: File, signal?: AbortSignal, activityId?: number, icon = false): Promise<string> {
      if (!file.type.startsWith('image/') || file.size > 50 * 1024 * 1024) throw new Error('图片类型或大小无效')
      if (activityId !== undefined && (!Number.isSafeInteger(activityId) || activityId <= 0)) throw new Error('Invalid activity id')
      const data = new FormData()
      data.append('file', file)
      if (icon && activityId !== undefined) throw new Error('Conflicting upload categories')
      return execute(`/api/bff/admin/upload${icon ? '?category=icon_svg' : activityId === undefined ? '' : `?activityId=${activityId}`}`, 'POST', data, value => {
        if (!value || typeof value !== 'object' || !('url' in value) || typeof value.url !== 'string') throw new Error('上传响应无效')
        return value.url
      }, signal, 60_000)
    },
  }
}
