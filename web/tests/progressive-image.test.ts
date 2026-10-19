import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { compileStyle, parse } from '@vue/compiler-sfc'
import postcss from 'postcss'

const source = readFileSync(new URL('../app/components/ProgressiveImage.vue', import.meta.url), 'utf8')
const { descriptor } = parse(source)
const scopedStyle = descriptor.styles.find((style) => style.scoped)?.content ?? ''
const { code, errors } = compileStyle({
  source: scopedStyle,
  filename: 'ProgressiveImage.vue',
  id: 'data-v-image-regression',
  scoped: true
})

describe('progressive image server rendering', () => {
  it('renders a visible, accessible image by default and never gates it on mount', () => {
    // The placeholder only exists once a working client loader manages the image.
    expect(source).toMatch(/v-if="managed"[\s\S]{0,80}class="pi-placeholder"/)
    expect(source).toMatch(/class="pi-placeholder"[\s\S]{0,60}aria-hidden="true"/)
    // The real element is not hidden from assistive technology.
    const img = source.slice(source.indexOf('ref="imageRef"'))
    expect(img.slice(0, img.indexOf('/>'))).not.toContain('aria-hidden')
    expect(img.slice(0, img.indexOf('/>'))).not.toContain('v-if="entered"')
    // Native loading strategy and dimensions stay on the element.
    expect(img.slice(0, img.indexOf('/>'))).toContain(':loading=')
    expect(img.slice(0, img.indexOf('/>'))).toContain(':width=')
  })

  it('never makes the unmanaged image transparent', () => {
    expect(errors).toEqual([])
    const root = postcss.parse(code)
    let checked = 0
    root.walkRules((rule) => {
      for (const selector of rule.selectors) {
        if (!selector.includes('.pi-full')) continue
        const opacity = rule.nodes.find(
          (node) => node.type === 'decl' && node.prop === 'opacity'
        )
        if (!opacity || opacity.type !== 'decl') continue
        checked++
        if (opacity.value === '0') expect(selector).toContain('.is-managed')
      }
    })
    expect(checked).toBeGreaterThan(0)
    const base = [...postcss.parse(code).nodes].find(
      (node) =>
        node.type === 'rule' &&
        node.selectors.some((selector) => /^\.pi-full/.test(selector))
    )
    expect(base?.type === 'rule' ? base.toString() : '').toContain('display: block')
  })

  it('compiled dark image styles never lower page opacity or repaint the page root', () => {
    const darkRules: {
      selector: string
      nodes: { type: string; prop?: string; value?: string }[]
    }[] = []
    postcss.parse(code).walkRules((rule) => {
      for (const selector of rule.selectors) {
        if (!selector.includes('.dark')) continue
        // :global(.dark) followed by a descendant silently compiles to just
        // .dark in Vue. An opacity intended for shimmer then fades the whole app.
        expect(/^(?:html)?\.dark$/.test(selector.trim())).toBe(false)
        expect(selector).toMatch(/\.(?:progressive-image|pi-[\w-]+)\[data-v-image-regression\]/)
        darkRules.push(rule)
      }
    })
    expect(darkRules.length).toBe(4)
    const shimmer = darkRules.find((rule) => rule.selector.includes('.pi-shimmer'))
    const opacity = shimmer?.nodes.find(
      (node) => node.type === 'decl' && node.prop === 'opacity'
    )
    expect(opacity?.type === 'decl' ? opacity.value : undefined).toBe('0.15')
  })
})
