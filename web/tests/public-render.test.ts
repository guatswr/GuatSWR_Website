/**
 * Browser-renderer contract for sanitized nodes.
 *
 * Renders through `vue/server-renderer`, so these assertions are about the real
 * markup the application emits - not about the render function's return value.
 * The renderer is the second line of defence: it re-validates the tag allowlist
 * and the one permitted `input` shape, so a tree that did not come from the
 * server sanitizer still cannot produce an active control or a component.
 */
import { describe, expect, it } from 'vitest'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { renderSafeNode } from '../app/utils/safe-markdown-render'
import type { PreRenderer } from '../app/utils/safe-markdown-render'
import type { SafeMarkdownNode } from '../shared/markdown'

const element = (
  tag: string,
  props: Record<string, string | number | boolean> = {},
  children: SafeMarkdownNode[] = [],
): SafeMarkdownNode => ({ type: 'element', tag, props, children })

const text = (value: string): SafeMarkdownNode => ({ type: 'text', value })

const languages: (string | null)[] = []
const renderPre: PreRenderer = (language, children) => {
  languages.push(language)
  return h('pre', { 'data-pre': language ?? 'none' }, children)
}

const render = async (node: SafeMarkdownNode): Promise<string> => {
  languages.length = 0
  return renderToString(createSSRApp({ render: () => renderSafeNode(node, renderPre) }))
}

describe('sanitized node rendering', () => {
  it('renders a checked task as a disabled checkbox', async () => {
    const markup = await render(element('input', { type: 'checkbox', disabled: true, checked: true }))
    expect(markup).toContain('type="checkbox"')
    expect(markup).toContain('disabled')
    expect(markup).toContain('checked')
  })

  it('renders an unchecked task as a disabled checkbox without checked', async () => {
    const markup = await render(element('input', { type: 'checkbox', disabled: true }))
    expect(markup).toContain('type="checkbox"')
    expect(markup).toContain('disabled')
    expect(markup).not.toContain('checked')
  })

  it('refuses every non-checkbox input and neutralizes hostile checkbox attributes', async () => {
    for (const node of [
      element('input', { type: 'text', value: 'x' }),
      element('input', { type: 'submit' }),
      element('input', { type: 'file' }),
      element('input', {}),
      element('input', { type: 'checkbox', disabled: true }, [text('child')]),
    ]) {
      expect(await render(node), JSON.stringify(node.props)).not.toContain('<input')
    }

    // An enabled checkbox, an extra name/handler or an uppercase type are all
    // normalized to the one inert shape; nothing else reaches the markup.
    const hostile = await render(element('input', {
      type: 'CHECKBOX',
      disabled: false,
      checked: 'checked',
      name: 'q',
      formaction: '/steal',
      onclick: 'steal()',
    }))
    expect(hostile).toContain('type="checkbox"')
    expect(hostile).toContain('disabled')
    expect(hostile).toContain('checked')
    for (const forbidden of ['name=', 'formaction', 'onclick', 'CHECKBOX']) {
      expect(hostile, forbidden).not.toContain(forbidden)
    }
  })

  it('refuses active or unknown tags and keeps readable text escaped', async () => {
    for (const tag of ['script', 'iframe', 'svg', 'form', 'button', 'style', 'UiDialog', 'component']) {
      // A refused node is rendered as `null`, which Vue serializes as its empty
      // comment placeholder - never as element markup and never with the
      // subtree text, which is what this assertion pins down.
      expect(await render(element(tag, { src: 'x' }, [text('payload')])), tag).toBe('<!---->')
    }
    expect(await render(text('<script>alert(1)</script>'))).toBe('&lt;script&gt;alert(1)&lt;/script&gt;')
  })

  it('renders allowlisted prose with its sanitized attributes', async () => {
    const markup = await render(element('p', {}, [
      element('a', { href: '/members', title: '成员' }, [text('in')]),
      element('img', { src: '/uploads/a.png', alt: 'cover', loading: 'lazy', decoding: 'async' }),
    ]))
    expect(markup).toContain('<p>')
    expect(markup).toContain('href="/members"')
    expect(markup).toContain('src="/uploads/a.png"')
    expect(markup).toContain('loading="lazy"')
  })

  it('routes fenced blocks through the injected chrome with their language', async () => {
    const markup = await render(element('pre', { class: 'language-js' }, [
      element('code', {}, [element('span', { style: 'color: #d73a49' }, [text('const')])]),
    ]))
    expect(languages).toEqual(['js'])
    expect(markup).toContain('data-pre="js"')
    expect(markup).toContain('color: #d73a49')

    await render(element('pre', {}, [element('code', {}, [text('plain')])]))
    expect(languages).toEqual([null])
  })
})
