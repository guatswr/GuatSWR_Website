// Imported only by the private, client-only editor. Never use the editor's
// default CDN loaders or its optional ECharts evaluator on authored content.
import { config } from 'md-editor-v3'
import highlight from 'highlight.js/lib/common'
import katex from 'katex'
import mermaid from 'mermaid'
import screenfull from 'screenfull'
import Cropper from 'cropperjs'
import DOMPurify from 'dompurify'
import 'md-editor-v3/lib/style.css'
import 'highlight.js/styles/github.css'
import 'katex/dist/katex.min.css'
import 'cropperjs/dist/cropper.css'

const diagramConfig = (base: Record<string, unknown>) => ({ ...base, startOnLoad: false, securityLevel: 'strict' as const,
  htmlLabels: false, flowchart: { htmlLabels: false }, maxTextSize: 50_000, maxEdges: 500,
  secure: ['securityLevel', 'startOnLoad', 'maxTextSize', 'maxEdges', 'htmlLabels', 'flowchart', 'themeCSS', 'fontFamily', 'altFontFamily', 'themeVariables'],
})
// md-editor-v3's injected Mermaid instance is initialized on theme changes,
// but not on its first render. Configure it before mounting the editor too.
export function initializeArticleDiagrams(theme: 'light' | 'dark') {
  mermaid.initialize(diagramConfig({ theme: theme === 'dark' ? 'dark' : 'default' }))
}
config({
  editorExtensions: {
    highlight: { instance: highlight }, katex: { instance: katex },
    mermaid: { instance: mermaid }, screenfull: { instance: screenfull },
    cropper: { instance: Cropper },
  },
  mermaidConfig: diagramConfig,
  katexConfig: base => ({ ...base, trust: false, maxExpand: 1000, maxSize: 20 }),
})
// md-editor caches generated diagrams inside its subsequent HTML renders.
// Keep safe SVG on that second pass too. Authored stylesheets and embedded HTML
// are never needed: diagram presentation is inlined below before caching.
export const sanitizeArticlePreview = (html: string) => DOMPurify.sanitize(html, {
  USE_PROFILES: { html: true, mathMl: true, svg: true, svgFilters: true }, FORBID_TAGS: ['style', 'foreignObject'],
})
const diagramPresentation = new Set(['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray',
  'stroke-linecap', 'stroke-linejoin', 'opacity', 'color', 'font-family', 'font-size', 'font-weight', 'font-style',
  'text-anchor', 'text-align', 'dominant-baseline', 'alignment-baseline', 'background-color', 'line-height'])
export const sanitizeArticleDiagram = async (svg: string) => {
  const template = document.createElement('template')
  template.innerHTML = DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true }, FORBID_TAGS: ['foreignObject'] })
  const root = template.content.querySelector('svg')
  if (!root) return ''
  // Parse the strict Mermaid renderer's styles without adopting the stylesheet
  // into a live document. Only presentation declarations survive; no @rules,
  // animation, URLs, event attributes or foreignObject need to be enabled.
  for (const style of root.querySelectorAll('style')) {
    const sheet = new CSSStyleSheet()
    sheet.replaceSync(style.textContent ?? '')
    for (const rule of sheet.cssRules) {
      if (!(rule instanceof CSSStyleRule)) continue
      let targets: Element[]
      try { targets = [...(root.matches(rule.selectorText) ? [root] : []), ...root.querySelectorAll(rule.selectorText)] }
      catch { continue }
      for (const property of rule.style) {
        const value = rule.style.getPropertyValue(property)
        if (!diagramPresentation.has(property) || /url\s*\(|expression\s*\(|@|\\/i.test(value)) continue
        for (const target of targets) if (target instanceof SVGElement)
          target.style.setProperty(property, value, rule.style.getPropertyPriority(property))
      }
    }
    style.remove()
  }
  return sanitizeArticlePreview(root.outerHTML)
}
