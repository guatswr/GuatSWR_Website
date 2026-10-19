import { createServer } from 'node:http'
import { handlePublicFixture } from './public-data.mjs'
import { exitWithParent } from './parent-watch.mjs'

// In-memory test server only. Never starts or writes to the real backend.
// The shared `public-data.mjs` fixture mirrors the frozen v1 public reads and
// keeps the config credential-leak/banner/private-decoy assertions intact.
createServer((request, response) => {
  if (handlePublicFixture(request, response)) return
  response.statusCode = 404
  response.setHeader('Content-Type', 'application/json')
  response.end(JSON.stringify({ message: 'Not Found' }))
}).listen(Number(process.env.PORT ?? 3181), '127.0.0.1')

// A leftover listener on this port makes the next E2E batch's webServer fail to
// start, so this process must not outlive the parent that spawned it.
exitWithParent()
