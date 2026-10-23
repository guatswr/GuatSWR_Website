import path from 'node:path'
import { AppError } from '../errors.js'

export type EnvironmentInput = Readonly<Record<string, string | undefined>>
export interface RuntimePaths {
  readonly data: string
  readonly public: string
  readonly backups: string
}
export interface RuntimeEnvironment {
  readonly nodeEnv: 'development' | 'production' | 'test'
  readonly port: number
  readonly bindHost: string
  readonly jwtSecret: string
  readonly bridgeSecret: string
  readonly guestDraftProofMode: 'optional' | 'required'
  readonly maxBodyBytes: number
  readonly shutdownTimeoutMs: number
  readonly paths: RuntimePaths
}
const invalid = (key: string): never => { throw new AppError(`Invalid configuration: ${key}`, 'invalid_configuration') }
const integer = (input: EnvironmentInput, key: string, fallback: number, min: number, max: number): number => {
  const raw = input[key]
  if (raw === undefined || raw === '') return fallback
  if (!/^\d+$/.test(raw)) return invalid(key)
  const result = Number(raw)
  if (!Number.isSafeInteger(result) || result < min || result > max) return invalid(key)
  return result
}
const absolute = (input: EnvironmentInput, key: string, fallback: string): string => {
  const value = input[key] || fallback
  if (!path.isAbsolute(value) || /[\0\r\n]/.test(value)) return invalid(key)
  return path.resolve(value)
}
export function parseEnvironment(input: EnvironmentInput, backendRoot: string): RuntimeEnvironment {
  if (!path.isAbsolute(backendRoot)) return invalid('backendRoot')
  const nodeEnv = input.NODE_ENV || 'development'
  if (nodeEnv !== 'development' && nodeEnv !== 'production' && nodeEnv !== 'test') return invalid('NODE_ENV')
  const jwtSecret = input.JWT_SECRET || ''
  if (!jwtSecret.trim()) return invalid('JWT_SECRET')
  const bridgeSecret = input.BFF_BRIDGE_SECRET || ''
  if ((nodeEnv === 'production' && !bridgeSecret) || (bridgeSecret && !/^[\x21-\x7e]{32,256}$/.test(bridgeSecret))) return invalid('BFF_BRIDGE_SECRET')
  const guestDraftProofMode = input.GUEST_DRAFT_PROOF_MODE || 'required'
  if (guestDraftProofMode !== 'optional' && guestDraftProofMode !== 'required') return invalid('GUEST_DRAFT_PROOF_MODE')
  const rawSize = input.MAX_BODY_SIZE || '50mb'
  const match = /^(\d+)\s*(b|kb|mb)?$/i.exec(rawSize)
  if (!match) return invalid('MAX_BODY_SIZE')
  const multiplier = match[2]?.toLowerCase() === 'mb' ? 1024 ** 2 : match[2]?.toLowerCase() === 'kb' ? 1024 : 1
  const maxBodyBytes = Number(match[1]) * multiplier
  if (!Number.isSafeInteger(maxBodyBytes) || maxBodyBytes <= 0 || maxBodyBytes > 50 * 1024 ** 2) return invalid('MAX_BODY_SIZE')
  const data = absolute(input, 'DATA_DIR', path.join(backendRoot, 'data'))
  const paths = { data, public: absolute(input, 'PUBLIC_DIR', path.join(data, 'public')), backups: absolute(input, 'BACKUP_ROOT', path.join(backendRoot, 'backups')) }
  return {
    nodeEnv, jwtSecret, bridgeSecret, guestDraftProofMode, paths, maxBodyBytes,
    port: integer(input, 'PORT', 3000, 0, 65535),
    bindHost: input.BIND_HOST || '127.0.0.1',
    shutdownTimeoutMs: integer(input, 'SHUTDOWN_TIMEOUT_MS', 15000, 100, 120000),
  }
}
