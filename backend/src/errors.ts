export class AppError extends Error {
  readonly code: string
  readonly status: number

  constructor(message: string, code = 'internal_error', status = 500, options?: ErrorOptions) {
    super(message, options)
    this.name = 'AppError'
    this.code = code
    this.status = status
  }
}
