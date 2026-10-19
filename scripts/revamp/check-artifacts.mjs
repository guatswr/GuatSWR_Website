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
// Inventory all chunks (including private/admin and lazy interaction chunks).
// The fixed 150 KiB *initial-route* gate is enforced by check-route-budget.mjs,
// using both the SSR import graph and actual cold-browser script requests.
const scripts = files.filter(path => path.includes(`${join('public', '_nuxt')}`) && path.endsWith('.js'))
let bytes = 0
for (const file of scripts) bytes += gzipSync(await readFile(file)).byteLength
console.log(JSON.stringify({ sourceMaps: maps.length, allClientJavaScriptGzipBytes: bytes, initialRouteBudgetBytes: 150 * 1024, initialRouteGate: 'check:routes' }))
