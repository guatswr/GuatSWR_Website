import { defineEventHandler, setHeader, setResponseStatus } from 'h3'
import { useRuntimeConfig } from '#imports'
import { createWebHealthProbe } from './health'

let selected: { origin: string; read: ReturnType<typeof createWebHealthProbe> } | undefined
export const readinessHandler = defineEventHandler(async event => {
  setHeader(event, 'Cache-Control', 'no-store')
  const { apiBase } = useRuntimeConfig(event)
  try {
    if (!selected || selected.origin !== apiBase) selected = { origin: apiBase, read: createWebHealthProbe(apiBase) }
    const report = await selected.read()
    setResponseStatus(event, report.status === 'ready' ? 200 : 503)
    return report
  } catch {
    setResponseStatus(event, 503)
    return { status: 'not_ready', service: 'guatswr-web', checks: { configuration: 'failed' } }
  }
})
