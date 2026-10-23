import { spawn, type ChildProcess } from 'node:child_process'
export class BackupError extends Error {
  constructor(readonly code: string, message = code, options?: ErrorOptions) { super(message, options) }
}
export function createBackupRunner(options: {
  script: string; env: NodeJS.ProcessEnv; shutdown: AbortSignal; timeoutMs?: string
  trackChild(child: ChildProcess): void
  command?: { file: string; args: string[] }
}) {
  const timeout = options.timeoutMs ? Number(options.timeoutMs) : 240000
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > 270000) throw new BackupError('BACKUP_CONFIGURATION')
  return () => new Promise<void>((resolve, reject) => {
    if (options.shutdown.aborted) { reject(new BackupError('BACKUP_CANCELLED')); return }
    let escalation: ReturnType<typeof setTimeout> | undefined, stopped: string | undefined
    let bytes = 0, settled = false
    const kill = (signal: NodeJS.Signals) => {
      try {
        if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, signal)
        else child.kill(signal)
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') child.kill(signal) }
    }
    const stop = (reason: string) => {
      if (stopped) return
      stopped = reason; kill('SIGTERM')
      escalation = setTimeout(() => kill('SIGKILL'), 1000)
    }
    const abort = () => stop('BACKUP_CANCELLED')
    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      kill('SIGKILL') // the completed job must not leave its process group running
      clearTimeout(deadline); clearTimeout(escalation); options.shutdown.removeEventListener('abort', abort)
      if (stopped) reject(new BackupError(stopped))
      else if (error) reject(error instanceof BackupError ? error : new BackupError('BACKUP_EXECUTION_FAILED', undefined, { cause: error }))
      else resolve()
    }
    const command = options.command || { file: '/bin/bash', args: [options.script] }
    const child = spawn(command.file, command.args, { env: options.env, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    options.trackChild(child)
    const output = (chunk: Buffer) => { bytes += chunk.byteLength; if (bytes > 65536) stop('BACKUP_OUTPUT_LIMIT') }
    child.stdout?.on('data', output); child.stderr?.on('data', output)
    child.once('error', finish)
    child.once('close', code => finish(code === 0 ? undefined : code === 75 ? new BackupError('BACKUP_BUSY') : new Error('Backup process exited unsuccessfully')))
    options.shutdown.addEventListener('abort', abort, { once: true })
    const deadline = setTimeout(() => stop('BACKUP_TIMEOUT'), timeout)
    if (options.shutdown.aborted) abort()
  })
}
