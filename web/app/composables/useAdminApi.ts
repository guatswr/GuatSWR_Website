import { createAdminTransport } from '~/utils/admin-transport'
import type { AdminCommand } from '~/utils/admin-transport'

/** Session and transport are owned by the current Nuxt app, never global. */
export function useAdminApi() {
  const session = useBffSession()
  const transport = createAdminTransport(session)
  const lifetime = new AbortController()
  const unregister = session.registerPrivateCleanup(() => lifetime.abort())
  onScopeDispose(() => { unregister(); lifetime.abort() })
  return {
    request: (<T>(input: Parameters<typeof transport.request>[0], project: (value: unknown) => T) =>
      transport.request({ ...input, signal: input.signal ? AbortSignal.any([input.signal, lifetime.signal]) : lifetime.signal }, project)),
    upload: (file: File, activityId?: number) => transport.upload(file, lifetime.signal, activityId),
    uploadEventAvatar: (file: File, eventId: number) => transport.uploadEventAvatar(file, eventId, lifetime.signal),
    uploadIcon: (file: File) => transport.upload(file, lifetime.signal, undefined, true),
    // Query reads consume Vue Query's signal so disposal cancels the cached
    // query too; otherwise an aborted first mount can leave an error on remount.
    command: <T>(name: AdminCommand, body: unknown, project: (value: unknown) => T, signal?: AbortSignal) =>
      transport.command(name, body, project, signal ? AbortSignal.any([signal, lifetime.signal]) : lifetime.signal),
    removeBan: (ip: string) => transport.removeBan(ip, lifetime.signal),
    deleteBackup: (file: string) => transport.deleteBackup(file, lifetime.signal),
    botDeliveries: <T>(method:'GET'|'POST', body:{page?:number;id?:string}, project:(value:unknown)=>T, signal?:AbortSignal) =>
      transport.botDeliveries(method,body,project,signal?AbortSignal.any([signal,lifetime.signal]):lifetime.signal),
    botCredentials: <T>(method: 'GET' | 'POST' | 'DELETE' | 'REVEAL', body: unknown, project: (value: unknown) => T, id?: string, signal?: AbortSignal) =>
      transport.botCredentials(method, body, project, id, signal ? AbortSignal.any([signal, lifetime.signal]) : lifetime.signal),
    memberSync:<T>(action:Parameters<typeof transport.memberSync>[0],method:Parameters<typeof transport.memberSync>[1],body:unknown,project:(value:unknown)=>T,id?:string|number,signal?:AbortSignal)=>transport.memberSync(action,method,body,project,id,signal?AbortSignal.any([signal,lifetime.signal]):lifetime.signal),
  }
}
