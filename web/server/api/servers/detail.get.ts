import { getQuery, setResponseHeader } from 'h3'
import { readPublicServerDetailSnapshot } from '../../utils/komari'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  const query = getQuery(event)
  const nodeId = typeof query.id === 'string' ? query.id.trim().slice(0, 80) : ''
  const rawHours = Number(query.hours ?? 0)
  const hours = [0, 1, 4, 24, 168, 720].includes(rawHours) ? rawHours : 0

  const config = useRuntimeConfig(event)
  const komariConfig = (config.komari || {}) as {
    baseUrl?: string
    timeoutMs?: number
  }
  return await readPublicServerDetailSnapshot(komariConfig, { nodeId, hours })
})
