import { createServer } from 'node:http'

// In-memory test server only. Never starts or writes to the real backend.
createServer((request, response) => {
  response.setHeader('Content-Type', 'application/json')
  if (request.url === '/health') {
    response.end(JSON.stringify({ status: 'ok' }))
  }
  else if (request.url === '/api/config') {
    response.end(JSON.stringify({
      home_bg: request.headers.authorization || request.headers.cookie ? 'credential-leak' : '/uploads/fixture.webp',
      banner_text: '契约测试',
      token_version: 'private-value',
    }))
  }
  else {
    response.statusCode = 404
    response.end(JSON.stringify({ message: 'Not Found' }))
  }
}).listen(Number(process.env.PORT ?? 3181), '127.0.0.1')
