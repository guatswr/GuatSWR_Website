import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { resolve, extname, sep } from 'node:path'

// Serve the checkpoint's existing build without loading Vite config or writing
// temporary files into the frozen frontend source directory.
const root = resolve('../frontend/dist')
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.json': 'application/json' }
createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
    let file = resolve(root, `.${pathname}`)
    if (file !== root && !file.startsWith(root + sep)) { response.writeHead(403).end(); return }
    const entry = await stat(file).catch(() => null)
    if (!entry?.isFile()) {
      if (extname(pathname)) { response.writeHead(404).end(); return }
      file = resolve(root, 'index.html')
    }
    response.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream')
    response.end(await readFile(file))
  }
  catch { response.writeHead(500).end('Legacy fixture unavailable; build frontend first') }
}).listen(5174, '127.0.0.1')
