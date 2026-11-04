import { afterEach, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
it('restores encrypted records in a new process and persists revocation', () => {
  const root = mkdtempSync(join(tmpdir(), 'guatswr-state-test-')); roots.push(root)
  const module = new URL('../server/utils/durable-records.ts', import.meta.url).href
  const run = (code: string) => {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', `import { durableRecords } from ${JSON.stringify(module)}; const m=durableRecords('test', Buffer.from('secret')); ${code}`], { env: { ...process.env, BFF_STATE_DIR: root }, encoding: 'utf8' })
    expect(result.stderr, result.stdout).not.toContain('Error')
    expect(result.status).toBe(0)
    return result.stdout.trim()
  }
  run("m.set('hashed-id', { secret: 'never-plaintext-on-disk' })")
  expect(readFileSync(join(root, readdirSync(root)[0]!)).includes(Buffer.from('never-plaintext-on-disk'))).toBe(false)
  expect(run("console.log(m.get('hashed-id').secret)")).toBe('never-plaintext-on-disk')
  run("m.delete('hashed-id')")
  expect(run('console.log(m.size)')).toBe('0')
})

