import { BffError } from './bff-errors'

// Stable session-store identity, not the per-request client wrapper. A fresh
// role/target read happens INSIDE this critical section in the delete route.
// This protects this single BFF process; frozen legacy/multiple instances still
// require a future backend transaction for a cross-process guarantee.
const queues = new WeakMap<object, { tail: Promise<void>; pending: number }>()
export async function withAdminUserLock<T>(identity: object, run: () => Promise<T>): Promise<T> {
  let state = queues.get(identity)
  if (!state) { state = { tail: Promise.resolve(), pending: 0 }; queues.set(identity, state) }
  if (state.pending >= 32) throw new BffError(503, 'service_unavailable', '账号管理繁忙，请稍后重试')
  state.pending += 1
  const previous = state.tail
  let release!: () => void
  state.tail = new Promise<void>(resolve => { release = resolve })
  await previous
  try { return await run() }
  finally {
    state.pending -= 1
    release()
    if (state.pending === 0) queues.delete(identity)
  }
}
