import type { Page, TestInfo } from '@playwright/test'

/**
 * User approval, 2026-10-20: log 22/VISUAL-PROPOSAL.md. Frozen independent
 * legacy reference projection, never imported by production or applied to Nuxt.
 * The unmodified archive capture and each property change remain in the report.
 * No screenshot mask, pixel allowance, or comparison threshold is changed.
 */
export async function projectApprovedAccessibility(archive: Page, info: TestInfo) {
  const expected = `http://127.0.0.1:${Number(process.env.E2E_PORT_BASE ?? 3100) + 2074}`
  if (new URL(archive.url()).origin !== expected) throw new Error('Approved projection is restricted to the isolated legacy origin')
  if (await archive.evaluate(() => document.documentElement.hasAttribute('data-approved-a11y-reference'))) return
  await info.attach('unmodified-archive-before-accessibility-projection', {
    body: await archive.screenshot({ fullPage: true, animations: 'disabled' }), contentType: 'image/png',
  })
  const changes = await archive.evaluate(() => {
    const path = location.pathname
    const dark = document.documentElement.classList.contains('dark')
    const changes: { selector: string, property: string, before: string, approved: string }[] = []
    function set(selector: string, property: string, value: string) {
      for (const node of document.querySelectorAll<HTMLElement>(selector)) {
        changes.push({ selector, property, before: getComputedStyle(node).getPropertyValue(property), approved: value })
        node.style.setProperty(property, value, 'important')
      }
    }
    set('footer p.font-mono.text-slate-500', 'color', '#94a3b8')
    if (path === '/' && dark) set('main a.club-button-primary[href="/join"]', 'background-color', '#0369a1')
    if (path === '/members') {
      set('main .ring-2.text-white', 'background-color', '#075985')
      set('main .ring-2.text-white', 'border-color', '#075985')
    }
    if (path === '/logs') {
      if (!dark) {
        set('main div.text-gray-400, main p.text-gray-400', 'color', '#6b7280')
      }
      else set('main .border-t.bg-gray-50\\/50', 'background-color', '#0f172a')
      set('main span.bg-emerald-50.text-emerald-600', 'color', '#047857')
      set('main span.bg-red-50.text-red-600', 'color', '#b91c1c')
      set('main button.text-indigo-500', 'color', dark ? '#a5b4fc' : '#4f46e5')
    }
    if (path.startsWith('/events/')) {
      if (!dark) {
        // Cards and the board's type/signup controls; never headings' hover colours.
        set('main article .text-sky-600, main article .text-sky-500, main article .text-sky-400, main button.text-sky-600, main div.text-sky-600', 'color', '#0369a1')
        set('main article .text-pink-500', 'color', '#be185d')
        set('main article .text-rose-500', 'color', '#be123c')
        set('main article .text-amber-500, main article .text-amber-600', 'color', '#92400e')
        set('main article span.font-bold.text-\\[10px\\].opacity-70', 'color', '#0369a1')
        set('main article span.font-bold.text-\\[10px\\].opacity-70', 'opacity', '1')
        set('main aside a.text-sky-600, main .md\\:hidden a.bg-sky-50.text-sky-600', 'color', '#0369a1')
        set('main aside a span.text-\\[10px\\].opacity-70', 'color', '#475569')
        set('main aside a span.text-\\[10px\\].opacity-70', 'opacity', '1')
      }
      set('main article span.text-slate-400.font-medium', 'color', dark ? '#94a3b8' : '#475569')
    }
    if (path === '/history') {
      const rail = document.querySelector<HTMLElement>('main .fixed.right-6 > .w-10')
      if (rail) {
        const list = rail.querySelector<HTMLElement>('.relative.z-10')!
        const buttons = [...list.querySelectorAll<HTMLButtonElement>('button')]
        // Independent geometry specification from the approval, retaining old dots.
        rail.setAttribute('data-approved-history-rail', '')
        list.setAttribute('data-approved-history-list', '')
        for (const [property, value] of Object.entries({
          width: '56px', height: `${buttons.length * 44 + Math.max(0, buttons.length - 1) * 4 + 14}px`,
          'max-height': 'max(58px,calc(100svh - 12rem))', 'overflow-y': 'auto', padding: '6px 0',
          display: 'block', 'scrollbar-width': 'thin', 'overscroll-behavior': 'contain',
        })) set('[data-approved-history-rail]', property, value)
        set('[data-approved-history-list]', 'align-items', 'center')
        set('[data-approved-history-list]', 'gap', '4px')
        for (const [index, button] of buttons.entries()) {
          const dot = document.createElement('span')
          dot.className = button.className
          dot.setAttribute('aria-hidden', 'true')
          button.setAttribute('data-approved-month-index', String(index))
          const selector = `[data-approved-month-index="${index}"]`
          for (const [property, value] of Object.entries({ width: '44px', height: '44px' })) set(selector, property, value)
          changes.push({ selector, property: 'structure', before: `button.${button.className}`, approved: '44px control containing unchanged original 14px decorative dot' })
          button.className = ''
          button.append(dot)
          for (const [property, value] of Object.entries({ display: 'grid', 'place-items': 'center', 'flex-shrink': '0', 'border-radius': '9999px' })) set(selector, property, value)
        }
      }
    }
    document.documentElement.setAttribute('data-approved-a11y-reference', '2026-10-20')
    return { approval: 'docs/revamp/logs/22-public-accessibility/VISUAL-PROPOSAL.md', path, dark, changes }
  })
  await info.attach('approved-accessibility-reference-properties', { body: JSON.stringify(changes, null, 2), contentType: 'application/json' })
}
