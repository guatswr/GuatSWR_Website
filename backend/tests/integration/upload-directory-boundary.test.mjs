import path from 'node:path'
import { expect, it } from 'vitest'
import { fixture, token, png } from '../helpers/fixture.mjs'

it.each(['content', 'avatar'])('rejects a %s directory symlink before creating any directory outside public', async mode => {
  const f = await fixture(), outside = path.join(f.root, 'outside-public'), root = path.join(f.context.IMG_ROOT_DIR, 'events')
  const link = mode === 'content' ? root : path.join(root, '1')
  await f.fs.mkdir(outside)
  if (mode === 'content') {
    await f.fs.rmdir(root)
    await f.fs.symlink(outside, root, process.platform === 'win32' ? 'junction' : 'dir')
  } else await f.fs.symlink(outside, path.join(root, '1'), process.platform === 'win32' ? 'junction' : 'dir')
  try {
    const response = await f.http.post('/api/upload/visitor' + (mode === 'avatar' ? '/avatar' : '')).set('Authorization', `Bearer ${token(2, 'admin')}`).field('eid', mode === 'avatar' ? '1' : '2').attach('file', png, 'safe.png')
    expect(response.status).toBe(500)
    expect(await f.fs.readdir(outside)).toEqual([])
  } finally {
    if (process.platform === 'win32') {
      const { promisify } = await import('node:util'), { execFile } = await import('node:child_process')
      if (!path.resolve(link).startsWith(path.resolve(f.root) + path.sep)) throw new Error('Unsafe fixture link cleanup')
      await promisify(execFile)('pwsh.exe', ['-NoProfile', '-NonInteractive', '-Command', "$item = Get-Item -LiteralPath $env:GUATSWR_TEST_LINK -Force; if ($item.LinkType -notin @('Junction','SymbolicLink')) { throw 'Expected fixture link' }; Remove-Item -LiteralPath $env:GUATSWR_TEST_LINK -Force"], { env: { ...process.env, GUATSWR_TEST_LINK: link } })
    } else {
      if (!(await f.fs.lstat(link)).isSymbolicLink()) throw new Error('Expected fixture symlink')
      await f.fs.unlink(link)
    }
  }
})
