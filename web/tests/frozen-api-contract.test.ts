import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ADMIN_UPSTREAM_ROUTES } from '../server/utils/bff-admin-upstream'
import { resolveGuestOperation } from '../server/utils/guest-bff'

// The integration fixture previously repeated a misspelled URL from the BFF,
// producing green tests for a route that the frozen Express app never mounts.
// Read only literal mount/router declarations: never import/start the backend,
// open its database, modify its sources, upload files or call its bot hooks.
function frozenRoutes() {
  const root = new URL('../../backend/src/', import.meta.url)
  const app = readFileSync(new URL('app.js', root), 'utf8')
  const modules = new Map([...app.matchAll(/(?:const|let)\s+(\w+)\s*=\s*require\(['"](\.\/routes\/[^'"]+)['"]\)/g)].map(match => [match[1]!, match[2]!]))
  const routes: { method: string; path: string }[] = []
  for (const mount of app.matchAll(/app\.use\(['"]([^'"]+)['"],\s*(?:\w+,\s*)?(\w+)\)/g)) {
    const module = modules.get(mount[2]!)
    if (!module) continue
    const source = readFileSync(new URL(`${module}.js`, root), 'utf8')
    for (const route of source.matchAll(/router\.(get|post|put|delete|head)\(['"]([^'"]*)['"]/g))
      routes.push({ method: route[1]!.toUpperCase(), path: `${mount[1]}${route[2] === '/' ? '' : `/${route[2]!.replace(/^\//, '')}`}`.replace(/\/$/, '') })
  }
  // The additive member-sync routes live in a typed child router. Verify its
  // complete mount chain before reading declarations, rather than teaching a
  // fixture to agree with a misspelled BFF URL or skipping new operations.
  const bot=readFileSync(new URL('routes/bot.js',root),'utf8')
  const api=readFileSync(new URL('integrations/bot/api.ts',root),'utf8')
  expect(bot).toMatch(/router\.use\(createBotApi\(/)
  expect(api).toMatch(/router\.use\(createMemberSyncApi\(/)
  const sync=readFileSync(new URL('integrations/bot/member-sync-api.ts',root),'utf8')
  for(const route of sync.matchAll(/router\.(get|post|put|delete)\(['"]([^'"]+)['"]/g))
    routes.push({method:route[1]!.toUpperCase(),path:`/api/bot${route[2]}`})
  return routes
}
const routes = frozenRoutes()
const normalized = (path: string) => path.replace(/\/:\w+/g, '/27').replace(/\/$/, '')
function assertMounted(method: string, path: string) {
  expect(routes.length, 'the read-only literal route inventory must not silently become empty').toBeGreaterThan(40)
  expect(routes.some(route => route.method === method && normalized(route.path) === normalized(path)), `${method} ${path} must be mounted by the frozen backend`).toBe(true)
}
describe('BFF operations agree with the frozen Express mounts, independently of fixtures', () => {
  for (const [name, route] of Object.entries(ADMIN_UPSTREAM_ROUTES))
    it(`matches authenticated operation ${name}`, () => assertMounted(route.method, route.path))
  for (const name of ['draft', 'save', 'signupRead', 'signupSave', 'signupDelete', 'eventRead', 'uploadContent', 'uploadAvatar'] as const)
    it(`matches visitor operation ${name}`, () => {
      const route = resolveGuestOperation({ name, id: 27 })
      assertMounted(route.method, route.path)
    })
})
