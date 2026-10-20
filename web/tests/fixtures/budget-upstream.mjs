import { createServer } from 'node:http'
import { handlePublicFixture, publicActivitiesFixture } from './public-data.mjs'
import { publicAdvancedMarkdownFixture } from './public-markdown-advanced.mjs'
import { exitWithParent } from './parent-watch.mjs'

// Cold-route acceptance adds one detail-only article. Normal list fixtures and
// the archived comparison datasets remain unchanged. No browser interception.
createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1')
  if (request.method === 'GET' && url.pathname === '/api/activities/991') {
    response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
    response.end(JSON.stringify({ ...publicActivitiesFixture.find(row => row.id === 1), id: 991, content: publicAdvancedMarkdownFixture }))
    return
  }
  if (handlePublicFixture(request, response)) return
  response.writeHead(404, { 'Content-Type': 'application/json' })
  response.end(JSON.stringify({ message: 'Not Found' }))
}).listen(Number(process.env.PORT ?? 3381), '127.0.0.1')
exitWithParent()
