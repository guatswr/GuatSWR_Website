import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { discoverInstalledPackages } from './check-dependency-security.mjs'

const require = createRequire(import.meta.url)
const root = fileURLToPath(new URL('../../', import.meta.url))
test('all reachable copies use the reviewed upstream security releases', async () => {
  const versions = { 'node-forge': ['1.4.2'], minimatch: ['10.2.6', '11.0.3'], glob: ['14.0.3'], seroval: ['1.7.5'], nuxt: ['4.6.3'] }
  const copies = await discoverInstalledPackages(root, new Set(Object.keys(versions)))
  for (const [name, version] of Object.entries(versions)) {
    const installed = copies.filter(copy => copy.name === name)
    assert.ok(installed.length > 0, name)
    for (const copy of installed) assert.ok(version.includes(copy.version), copy.path)
  }
})

test('minimatch keeps CommonJS named exports, ESM and normal pattern semantics', async () => {
  const cjs = require('minimatch'), esm = await import('minimatch')
  for (const api of [cjs, esm]) {
    assert.equal(api.minimatch('src/app/main.ts', 'src/**/!(*.test).ts'), true)
    assert.equal(api.minimatch('src/app/main.test.ts', 'src/**/!(*.test).ts'), false)
    assert.equal(new api.Minimatch('**/*.{js,ts}').match('lib/file.js'), true)
  }
  const legacy = createRequire(require.resolve('eslint-plugin-import-x'))('minimatch')
  assert.ok(legacy.makeRe('**/*.js') instanceof RegExp)
})

test('glob aliases and real archiver/readdir-glob consumers keep their file selection', async () => {
  const base = resolve(tmpdir()), dir = await mkdtemp(join(base, 'guatswr-dependency-compat-'))
  assert.equal(dirname(dir), base)
  try {
    await mkdir(join(dir, 'lib'))
    for (const file of ['main.js', 'lib/a.js', 'lib/b.txt']) await writeFile(join(dir, file), 'fixture')
    const expected = ['lib/a.js', 'main.js']
    const glob = require('glob')
    const normalized = files => files.map(file => file.replaceAll('\\', '/')).sort()
    assert.deepEqual(normalized(glob.sync('**/*.js', { cwd: dir })), expected)
    assert.deepEqual(normalized(await glob.glob('**/*.js', { cwd: dir })), expected)
    assert.deepEqual(normalized(require('archiver-utils/file').expand({ cwd: dir }, ['**/*.js'])), expected)
    const selected = await new Promise((resolve, reject) => {
      const files = [], walker = require('readdir-glob')(dir, { pattern: '**/*.js' })
      walker.on('match', entry => files.push(entry.relative.replaceAll('\\', '/')))
      walker.on('error', reject)
      walker.on('end', () => resolve(files.sort()))
    })
    assert.deepEqual(selected, expected)
    const controller = new AbortController()
    controller.abort(new Error('fixture cancellation'))
    await assert.rejects(glob.glob('**/*', { cwd: dir, signal: controller.signal }), /fixture cancellation/)
  } finally { await rm(dir, { recursive: true, force: true }) }
})
