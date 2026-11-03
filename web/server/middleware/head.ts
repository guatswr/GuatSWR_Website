import { defineEventHandler } from 'h3'

export default defineEventHandler((event) => {
  if (event.node.req.method === 'HEAD') {
    // Treat HEAD as GET for route matching.
    // Node.js http.ServerResponse natively omits the response body for HEAD requests.
    ;(event as unknown as { _method: string })._method = 'GET'
  }
})
