import { publicActivitiesFixture } from './public-data.mjs'
import { publicAdvancedMarkdownFixture, publicMathMarkdownFixture } from './public-markdown-advanced.mjs'

// Stable, detail-only IDs exercise the real BFF cache. Never replace article 1,
// opt into the admin dataset, or invalidate/disable production caching for tests.
export function handleMarkdownDetailFixture(request, response) {
  if (request.method !== 'GET') return false
  const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname
  const content = path === '/api/activities/991' ? publicAdvancedMarkdownFixture
    : path === '/api/activities/992' ? publicMathMarkdownFixture : undefined
  if (content === undefined) return false
  response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
  response.end(JSON.stringify({ ...publicActivitiesFixture.find(row => row.id === 1), id: Number(path.split('/').at(-1)), content }))
  return true
}
