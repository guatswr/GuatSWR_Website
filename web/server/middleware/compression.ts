import compression from 'compression'
import { fromNodeMiddleware } from 'h3'
import type { NodeMiddleware } from 'h3'

// compression uses the Node request/response interface; its published types
// describe the richer Express interface. Keep that adaptation at this boundary.
const compressHtml = compression({
  filter(req, res) {
    const type = String(res.getHeader('Content-Type') ?? '')
    const cache = String(res.getHeader('Cache-Control') ?? '')
    return !req.url?.startsWith('/api/')
      && type.startsWith('text/html')
      && !cache.includes('no-store')
      && compression.filter(req, res)
  },
}) as NodeMiddleware

export default fromNodeMiddleware(compressHtml)
