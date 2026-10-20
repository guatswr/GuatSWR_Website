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
    command: <T>(name: AdminCommand, body: unknown, project: (value: unknown) => T) => transport.command(name, body, project, lifetime.signal),
    removeBan: (ip: string) => transport.removeBan(ip, lifetime.signal),
    deleteBackup: (file: string) => transport.deleteBackup(file, lifetime.signal),
  }
}
