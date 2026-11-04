import fs from 'node:fs/promises'
import path from 'node:path'

async function processIdentity(pid: number): Promise<string> {
  const boot = (await fs.readFile('/proc/sys/kernel/random/boot_id', 'utf8')).trim()
  const stat = await fs.readFile(`/proc/${pid}/stat`, 'utf8')
  return `${boot}-${stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19]}`
}

/** A stale managed owner can be removed; unknown historical locks fail closed. */
export async function directoryLock(directory: string): Promise<() => Promise<void>> {
  const own = process.platform === 'linux' ? `owner-${process.pid}-${await processIdentity(process.pid)}` : undefined
  try { await fs.mkdir(directory, { mode: 0o700 }) }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || !own) throw error
    if ((await fs.lstat(directory)).isSymbolicLink()) throw error
    const names = await fs.readdir(directory)
    const match = names.length === 1 && /^owner-(\d+)-(.+)$/.exec(names[0]!)
    if (!match) throw error
    let stale: boolean
    try { stale = await processIdentity(Number(match[1])) !== match[2] }
    catch (probeError) { if ((probeError as NodeJS.ErrnoException).code === 'ENOENT') stale = true; else throw probeError }
    if (!stale) throw error
    // Unlink exactly the observed owner's unique name. A racing new owner has
    // a different name; ENOENT must not proceed to removing their directory.
    await fs.unlink(path.join(directory, names[0]!))
    await fs.rmdir(directory)
    await fs.mkdir(directory, { mode: 0o700 })
  }
  if (own) await fs.writeFile(path.join(directory, own), '', { flag: 'wx', mode: 0o600 })
  return async () => { if (own) await fs.unlink(path.join(directory, own)); await fs.rmdir(directory) }
}
