/** Errors that are safe to translate into a fixed public HTTP response. */
export interface BffErrorOptions {
  /** Optional bounded `Retry-After` seconds, never copied from a raw header. */
  retryAfterSeconds?: number
}

export class BffError extends Error {
  readonly statusCode: number
  readonly code: string
  readonly retryAfterSeconds: number | undefined

  constructor(statusCode: number, code: string, message: string, options: BffErrorOptions = {}) {
    super(message)
    this.name = 'BffError'
    this.statusCode = statusCode
    this.code = code
    this.retryAfterSeconds = options.retryAfterSeconds
  }
}

export interface BffErrorBody {
  error: { code: string, message: string }
}

export function bffErrorBody(error: BffError): BffErrorBody {
  return { error: { code: error.code, message: error.message } }
}

/**
 * Configuration failures (missing/weak session secret, malformed allowlists)
 * fail closed. The message is for server-side diagnosis only; the route layer
 * never returns it to the browser.
 */
export class BffConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BffConfigError'
  }
}

/** Upstream JWT metadata could not be trusted; the token is discarded. */
export class TokenMetadataError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TokenMetadataError'
  }
}

export type ClientIpErrorCode =
  | 'invalid_socket_address'
  | 'invalid_forwarded_for'
  | 'forwarded_for_too_long'

export class ClientIpError extends Error {
  readonly code: ClientIpErrorCode

  constructor(code: ClientIpErrorCode, message: string) {
    super(message)
    this.name = 'ClientIpError'
    this.code = code
  }
}
