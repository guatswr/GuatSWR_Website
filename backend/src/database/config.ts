import { AppError } from '../errors.js'

export type DatabaseConfiguration = { driver: 'sqlite' } | { driver: 'postgres'; connectionString: string }
const invalid = (key: string): never => { throw new AppError(`Invalid configuration: ${key}`, 'invalid_configuration') }

export function parseDatabaseConfiguration(env: Readonly<Record<string, string | undefined>>): DatabaseConfiguration {
  const driver = env.DATABASE_DRIVER || 'sqlite'
  if (driver === 'sqlite') return { driver }
  if (driver !== 'postgres') return invalid('DATABASE_DRIVER')
  const connectionString = env.POSTGRES_URL
  if (!connectionString || /[\r\n\0]/.test(connectionString)) return invalid('POSTGRES_URL')
  try {
    const url = new URL(connectionString)
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !url.username
      || url.pathname.length < 2 || url.hash || url.searchParams.has('options')) return invalid('POSTGRES_URL')
  } catch { return invalid('POSTGRES_URL') }
  return { driver, connectionString }
}
