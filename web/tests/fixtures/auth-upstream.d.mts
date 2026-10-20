import type { Server } from 'node:http'

// Types for the JavaScript fixture so the vitest integration file does not
// have to treat it as `any`.

export interface AuthFixtureRequest {
  method: string | undefined
  path: string
  headers: Record<string, string | string[] | undefined>
}

export interface AuthFixtureUser {
  id: number
  username: string
  password: string
  role: string
  twofa: string | null
  avatar: string | null
  twofaEnabled: number
}

export interface AuthFixtureState {
  requests: AuthFixtureRequest[]
  loginAttempts: number
  lockLogin: boolean
  loginDelayMs: number
  tokenTtlSeconds: number
  tokenVersion: number
  meStatus: number | null
  hugeMe: boolean
  users: Map<string, AuthFixtureUser>
}

export interface AuthUpstreamFixture {
  server: Server
  state: AuthFixtureState
  listen: (port?: number) => Promise<number>
  close: () => Promise<void>
}

export function createAuthUpstreamFixture(): AuthUpstreamFixture
