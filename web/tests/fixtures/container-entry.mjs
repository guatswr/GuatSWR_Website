// Local/CI container harness: the production artifact is imported unchanged,
// with a frozen-contract fixture bound only inside this container's loopback.
import { createServer } from 'node:http'
import { handlePublicFixture } from './public-data.mjs'

const fixture = createServer((request, response) => {
  if (!handlePublicFixture(request, response)) { response.writeHead(404); response.end() }
})
await new Promise((resolve, reject) => {
  fixture.once('error', reject)
  fixture.listen(3181, '127.0.0.1', resolve)
})
process.once('SIGTERM', () => fixture.close())
await import('/app/.output/server/index.mjs')
