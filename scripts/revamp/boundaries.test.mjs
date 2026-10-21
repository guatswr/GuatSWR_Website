import { test } from 'node:test'
import assert from 'node:assert/strict'
import { inspectSource } from './check-boundaries.mjs'

test('shared contracts reject framework, server and cross-package imports', () => {
  for (const specifier of ['node:crypto', 'fs', '#imports', 'vue', '../../../web/server/utils/bff-session', '@guatswr/shared']) {
    assert.equal(inspectSource('packages/shared/src/auth.ts', `import x from '${specifier}'`).length, 1, specifier)
  }
})
test('Nuxt shared permits local DTOs and independent contracts', () => {
  assert.deepEqual(inspectSource('web/shared/content.ts', "import type { X } from './markdown'; export type { Y } from '@guatswr/shared'"), [])
  assert.equal(inspectSource('web/shared/content.ts', "import type { X } from '../server/utils/bff-session'").length, 1)
})
test('Vue scripts reject server access through aliases and relative escapes', () => {
  for (const specifier of ['~~/server/utils/bff-session', '~/../server/utils/bff-session', '#shared/../server/utils/bff-session', '../../../backend/server.js']) {
    assert.equal(inspectSource('web/app/components/Example.vue', `<template><p>Hello</p></template><script setup lang="ts">import x from '${specifier}'</script>`).length, 1, specifier)
  }
})
test('dynamic imports, re-exports and import types are inspected', () => {
  const source = "export { X } from 'node:fs'; type X = import('../../server/utils/bff-session').X; const a = import('node:crypto'); const b = import(path)"
  assert.equal(inspectSource('web/app/utils/example.ts', source).length, 4)
})
test('comments and ordinary strings are not imports', () => {
  assert.deepEqual(inspectSource('web/app/utils/example.ts', "// import x from 'node:fs'\nconst text = \"import('node:fs')\""), [])
})
test('public UI may import its Nuxt helpers, local files and shared package', () => {
  assert.deepEqual(inspectSource('web/app/utils/example.ts', "import { x } from '#imports'; import type { Y } from '#shared/content'; import { z } from '@guatswr/shared'; const a = import('./theme')"), [])
})
