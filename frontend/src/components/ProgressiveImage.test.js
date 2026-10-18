import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parse, compileStyle } from '@vue/compiler-sfc'
import postcss from 'postcss'

test('compiled dark image styles never lower page opacity or repaint the page root', () => {
  const source = readFileSync(new URL('./ProgressiveImage.vue', import.meta.url), 'utf8')
  const { descriptor } = parse(source)
  const { code, errors } = compileStyle({
    source: descriptor.styles.find(style => style.scoped).content,
    filename: 'ProgressiveImage.vue',
    id: 'data-v-image-regression',
    scoped: true
  })
  assert.deepEqual(errors, [])
  const darkRules = []
  postcss.parse(code).walkRules(rule => {
    for (const selector of rule.selectors) {
      if (!selector.includes('.dark')) continue
      // :global(.dark) followed by a descendant silently compiles to just
      // .dark in Vue. An opacity intended for shimmer then fades the whole app.
      assert.ok(!/^(?:html)?\.dark$/.test(selector.trim()), selector)
      assert.match(selector, /\.(?:progressive-image|pi-[\w-]+)\[data-v-image-regression\]/)
      darkRules.push(rule)
    }
  })
  assert.equal(darkRules.length, 4)
  const shimmer = darkRules.find(rule => rule.selector.includes('.pi-shimmer'))
  assert.ok(shimmer)
  assert.equal(shimmer.nodes.find(node => node.prop === 'opacity').value, '0.15')
})
