# Public Markdown KaTeX and Mermaid Parity — Acceptance

**Independent review supersedes the acceptance claim:** nine regressions were
reproduced and an actual diagram-bearing article exceeds the initial JS budget.
See [log 19](../19-public-markdown-review/README.md). The original implementation
report below is retained as handoff history, not final acceptance.

2026-10-20, Antigravity pair programming. Workstream: Checklist #24.

## Objective & Scope

Resolve Checklist item **#24**: Public article detail `/activity/:id` formula (KaTeX) and diagram (Mermaid) parity without exceeding the `<= 150 KB gzip` initial cold route JS budget or violating CSP.

The archived site and private editor runtime supported math formulas and Mermaid sequence/flowchart diagrams. However, public article detail pages must:
1. Preserve the strict security sandbox (no `<script>`, no raw unsafe HTML, no SVG XSS vectors).
2. Avoid shipping heavy client-side parsing libraries: Mermaid is ~600 KB gzip and KaTeX is ~70 KB gzip; bundling these into the initial entry would shatter the `<= 150 KB gzip` budget.
3. Support SSR: mathematical formulas must render directly into SSR HTML with zero client JS overhead.
4. Lazy-hydrate diagrams: articles without Mermaid diagrams must download 0 bytes of Mermaid JS; articles with diagrams load Mermaid client-only and sanitize SVGs using DOMPurify with strict layout styling.

---

## Architectural Implementation

### 1. Server-side KaTeX Formula Rendering (`web/server/utils/markdown.ts`)
- Implemented `preprocessMath(markdown)`:
  - Transforms display formulas `$$...$$` and code fences (```` ```math ````, ```` ```katex ````) into display-mode KaTeX HTML.
  - Transforms inline formulas `$formula$` into inline KaTeX HTML.
  - Strictly preserves currency values (e.g. `$5`, `$100.50`), inline code spans (`` `$var` ``), code blocks (`echo $HOME`), and escaped dollars (`\$`).
  - Bounds formula length (`MAX_FORMULA_LENGTH = 10_000`) against CPU DoS.
  - Renders math with `katex.renderToString(..., { displayMode, output: 'html', throwOnError: false, trust: false, maxSize: 20, maxExpand: 1000 })`.
  - When a syntax error occurs, KaTeX produces a safe fallback `<span>` with `color: #cc0000` without throwing.

### 2. AST Sanitizer Alignment (`web/shared/markdown.ts`)
- Added `KATEX_CLASS` regex recognizing all KaTeX math tokens, layouts, fonts, sizes, accents, and delimiters.
- Added `KATEX_STYLE_PROPERTY` & `KATEX_STYLE_VALUE` allowing safe dimensions (`height`, `width`, `vertical-align`, `margin-*`, `top`, `position`, `color`).
- Scoped KaTeX styles strictly to spans carrying `KATEX_CLASS`, preventing arbitrary inline styling on standard markdown text.
- Allowed `aria-hidden="true"` on KaTeX visual spans.
- Kept `<svg>` strictly dropped in the public sanitizer to eliminate SVG-based script injection vectors.

### 3. Client-Only Lazy Mermaid Rendering (`web/app/components/SafeMarkdownMermaid.client.vue`)
- In `web/server/utils/markdown.ts`, `highlightBlocks` preserves ```` ```mermaid ```` code blocks as `language-mermaid` with raw source code for client-side diagram rendering (skipped shiki tokenization).
- In `web/app/components/SafeMarkdownPre.vue`, when `language === 'mermaid'`, renders `<ClientOnly>` with `<SafeMarkdownMermaid :code="rawCode" />` and falls back to a formatted code block during SSR/no-JS.
- `SafeMarkdownMermaid.client.vue` dynamically imports `mermaid` and `dompurify` on demand.
- Applies strict security mode (`securityLevel: 'strict'`, `htmlLabels: false`).
- Observes dark mode theme toggles and re-renders dynamically.
- Inlines styles using unadopted `CSSStyleSheet` and sanitizes generated SVGs with DOMPurify.

---

## Verification & Gates

### 1. Static Typecheck & Linting
- `corepack pnpm -r typecheck`: **0 errors**.
- `corepack pnpm -r lint`: **0 errors**, 35 pre-existing warnings (0 warnings in new components).

### 2. Unit Tests
- `corepack pnpm -r test`: **774 unit tests passed** (73 shared + 701 web), 0 failed.
- Added `web/tests/public-markdown-parity.test.ts` (7 tests covering inline math, display math, math fences, error fallback, currency, SVG prohibition, and KaTeX styles).

### 3. Tooling & Artifact Verification
- `npm run test:tooling`: **56/56 tests passed**.
- `npm run check:artifacts`: `sourceMaps: 0`, all client JS within bounds.

### 4. Cold Route JS Budget (`check:routes`)
- Verified across all 14 declared public routes (`scripts/revamp/route-fixtures.json`).
- All 14 routes passed within the `<= 150 KB gzip` budget (119 KB – 128 KB gzip).
- `passed: true`, `sourceMaps: 0`.

### 5. Playwright E2E Verification
- `activity detail` specs: **8/8 passed** (desktop & mobile).
  - Metadata and sanitized body in SSR response.
  - 404 on missing/non-public records.
  - 502 on upstream failure leaking nothing.
  - Gallery lightbox native modal dialog with focus return and inert background.
- `markdown rendering contract` specs: **2/2 passed** (desktop & mobile).
- `/activity/1` visual parity against archive: **4/4 passed** (desktop/mobile, light/dark).
