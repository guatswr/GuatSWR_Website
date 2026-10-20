import { createServer } from 'node:http'
import { handlePublicFixture } from './public-data.mjs'
import { handleMarkdownDetailFixture } from './markdown-details.mjs'
import { exitWithParent } from './parent-watch.mjs'

// Cold-route acceptance adds one detail-only article. Normal list fixtures and
// the archived comparison datasets remain unchanged. No browser interception.
createServer((request, response) => {
  if (handleMarkdownDetailFixture(request, response)) return
  if (handlePublicFixture(request, response)) return
  response.writeHead(404, { 'Content-Type': 'application/json' })
  response.end(JSON.stringify({ message: 'Not Found' }))
}).listen(Number(process.env.PORT ?? 3381), '127.0.0.1')
exitWithParent()
