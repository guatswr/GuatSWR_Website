import { createHash, randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

// Test-only dependencies of the unmodified archived MdPreview. Pin both bytes
// and version: a live CDN, missing highlighter or newer renderer is not a
// valid visual reference. Nothing here is imported by the application/build.
const references = {
  katex: {
    url: 'https://registry.npmjs.org/katex/-/katex-0.16.11.tgz',
    integrity: 'sha512-RQrI8rlHY92OLf3rho/Ts8i/XvjgguEjOkO1BEXcU3N8BqPpSzBNwV/G0Ukr+P/l3ivvJUE/Fa/CwbS6HesGNQ==',
    file: new URL('../../.tools/reference-katex-0.16.11.tgz', import.meta.url),
  },
  highlight: {
    url: 'https://registry.npmjs.org/@highlightjs/cdn-assets/-/cdn-assets-11.10.0.tgz',
    integrity: 'sha512-vWXpu+Rdm0YMJmugFdUiL/9DmgYjEiV+d5DBqlXdApnGPSIeo6+LRS5Hpx6fvVsKkvR4RsLYD9rQ6DOLkj7OKA==',
    file: new URL('../../.tools/reference-highlight-11.10.0.tgz', import.meta.url),
  },
}
let preparation

export function prepareArchiveMathReference() {
  preparation ??= (async () => {
    await mkdir(new URL('../../.tools/', import.meta.url), { recursive: true })
    for (const reference of Object.values(references)) {
      let bytes = await readFile(reference.file).catch(error => { if (error.code === 'ENOENT') return null; throw error })
      const cached = bytes !== null
      if (!bytes) {
        const response = await fetch(reference.url, { signal: AbortSignal.timeout(30_000) })
        if (!response.ok) throw new Error(`Archived math reference HTTP ${response.status}`)
        bytes = Buffer.from(await response.arrayBuffer())
      }
      const integrity = `sha512-${createHash('sha512').update(bytes).digest('base64')}`
      if (integrity !== reference.integrity) throw new Error(`Archived math reference integrity mismatch: ${reference.url}`)
      if (cached) continue
      // Atomic publication also permits independent test workers to prepare
      // the same verified reference without exposing a partial tarball.
      const temporary = new URL(`${reference.file.href}.${randomUUID()}.tmp`)
      await writeFile(temporary, bytes)
      await rename(temporary, reference.file)
    }
  })()
  return preparation
}

/** Only the exact archived loader URLs and inert font files may be fulfilled. */
export function archiveMathAsset(rawUrl) {
  const url = new URL(rawUrl)
  if (url.origin !== 'https://unpkg.com' || url.search || url.hash) return null
  const katex = url.pathname.startsWith('/katex@0.16.11/dist/')
  const prefix = katex ? '/katex@0.16.11/dist/' : '/@highlightjs/cdn-assets@11.10.0/'
  if (!url.pathname.startsWith(prefix)) return null
  const name = url.pathname.slice(prefix.length)
  const allowed = katex
    ? /^(?:katex\.min\.(?:js|css)|fonts\/KaTeX_[A-Za-z0-9_-]+\.(?:woff2?|ttf))$/.test(name)
    : /^(?:highlight\.min\.js|styles\/atom-one-dark\.min\.css)$/.test(name)
  if (!allowed) throw new Error(`Unexpected archived math reference asset: ${rawUrl}`)
  const reference = references[katex ? 'katex' : 'highlight']
  const entry = `package/${katex ? 'dist/' : ''}${name}`
  const body = execFileSync('tar', ['-xOf', fileURLToPath(reference.file), entry], { maxBuffer: 2 * 1024 * 1024 })
  const contentType = name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : name.endsWith('.woff2') ? 'font/woff2' : 'application/octet-stream'
  return { body, contentType, headers: { 'Access-Control-Allow-Origin': '*' } }
}
