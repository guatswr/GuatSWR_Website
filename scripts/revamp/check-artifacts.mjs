import { readdir, readFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { gzipSync } from 'node:zlib'

const root = resolve('web/.output')
const files = []
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) await walk(path)
    else files.push(path)
  }
}
await walk(root)
const maps = files.filter(path => /\.map(?:\.(?:br|gz))?$/.test(path))
if (maps.length) throw new Error(`Production contains ${maps.length} source maps`)
// Conservative foundation budget: all public JS, not only the initial route.
// Replace with manifest/route traversal when other routes are introduced.
const scripts = files.filter(path => path.includes(`${join('public', '_nuxt')}`) && path.endsWith('.js'))
let bytes = 0
for (const file of scripts) bytes += gzipSync(await readFile(file)).byteLength
if (bytes > 150 * 1024) throw new Error(`Public JS budget exceeded: ${bytes} gzip bytes`)
console.log(JSON.stringify({ sourceMaps: maps.length, publicJavaScriptGzipBytes: bytes, budgetBytes: 150 * 1024 }))
