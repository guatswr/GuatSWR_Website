import { createFixedUpstreamClient } from './bff-upstream'
import type { UpstreamClientOptions, UpstreamRouteTable } from './bff-upstream'

/**
 * Closed admin upstream table for the frozen v1 API.
 *
 * Only the routes implemented in this batch are present. Each route fixes the
 * verb, the path, the query keys the caller may set and its caps. There is no
 * pattern-forwarding path, no browser-supplied path/verb/query and no response
 * data outside the explicit projection schemas in the handlers.
 */
export const ADMIN_UPSTREAM_ROUTES = {
  'activity.list': { method: 'GET', path: '/api/activities', query: ['all', 'includeDeleted', 'page', 'limit'] },
  'activity.detail': { method: 'GET', path: '/api/activities/:id' },
  'activity.draft': { method: 'POST', path: '/api/activities/draft' },
  'activity.create': { method: 'POST', path: '/api/activities', maxRequestBytes: 4 * 1024 * 1024 },
  'activity.update': { method: 'PUT', path: '/api/activities/:id', maxRequestBytes: 4 * 1024 * 1024 },
  'activity.delete': { method: 'DELETE', path: '/api/activities/:id' },
  'activity.restore': { method: 'POST', path: '/api/activities/:id/restore' },

  'member.list': { method: 'GET', path: '/api/members', query: ['includeDeleted', 'original', 'school'] },
  'member.create': { method: 'POST', path: '/api/members', maxRequestBytes: 64 * 1024 },
  'member.update': { method: 'PUT', path: '/api/members/:id', maxRequestBytes: 64 * 1024 },
  'member.delete': { method: 'DELETE', path: '/api/members/:id' },
  'member.restore': { method: 'POST', path: '/api/members/:id/restore' },

  'history.list': { method: 'GET', path: '/api/history', query: ['includeDeleted'] },
  'history.create': { method: 'POST', path: '/api/history', maxRequestBytes: 64 * 1024 },
  'history.update': { method: 'PUT', path: '/api/history/:id', maxRequestBytes: 64 * 1024 },
  'history.delete': { method: 'DELETE', path: '/api/history/:id' },
  'history.restore': { method: 'POST', path: '/api/history/:id/restore' },

  'config.read': { method: 'GET', path: '/api/config', maxResponseBytes: 64 * 1024 },
  'config.write': { method: 'POST', path: '/api/config', maxRequestBytes: 16 * 1024 },

  'log.list': { method: 'GET', path: '/api/admin/logs', query: ['page', 'limit', 'username', 'action'], maxResponseBytes: 2 * 1024 * 1024 },
  'log.delete': { method: 'DELETE', path: '/api/admin/logs/:id' },

  'user.list': { method: 'GET', path: '/api/admin/users', maxResponseBytes: 256 * 1024 },
  'user.delete': { method: 'DELETE', path: '/api/admin/users/:id' },
  'user.resetPassword': { method: 'PUT', path: '/api/admin/users/:id/password', maxRequestBytes: 16 * 1024 },
  'user.resetTwofa': { method: 'PUT', path: '/api/admin/users/:id/twofa/reset' },
  'tokenVersion.refresh': { method: 'POST', path: '/api/admin/token-version/refresh' },

  'profile.update': { method: 'PUT', path: '/api/auth/profile', maxRequestBytes: 16 * 1024 },
  'user.create': { method: 'POST', path: '/api/auth/register', maxRequestBytes: 16 * 1024 },
  'event.list': { method: 'GET', path: '/api/event/admin/list', query: ['page', 'limit', 'type', 'status'] },
  'event.detail': { method: 'GET', path: '/api/event/:id' },
  'event.create': { method: 'POST', path: '/api/event/admin', maxRequestBytes: 4 * 1024 * 1024 },
  'event.update': { method: 'PUT', path: '/api/event/:id', maxRequestBytes: 4 * 1024 * 1024 },
  'event.approve': { method: 'POST', path: '/api/event/:id/approve' },
  'event.reject': { method: 'POST', path: '/api/event/:id/reject' },
  'event.status': { method: 'POST', path: '/api/event/:id/status' },
  'event.delete': { method: 'POST', path: '/api/event/:id/delete' },
  'event.settle': { method: 'POST', path: '/api/event/:id/settle', maxRequestBytes: 64 * 1024 },
  'event.results': { method: 'POST', path: '/api/event/:id/set_result', maxRequestBytes: 64 * 1024 },
  'event.participants': { method: 'GET', path: '/api/event/:id/participants' },
  'recycle.purge': { method: 'POST', path: '/api/admin/recycle-bin/purge' },
  'ban.list': { method: 'GET', path: '/api/admin/bans' },
  'ban.create': { method: 'POST', path: '/api/admin/bans', maxRequestBytes: 16 * 1024 },
  'backup.settings': { method: 'GET', path: '/api/admin/backups/settings' },
  'backup.configure': { method: 'POST', path: '/api/admin/backups/settings', maxRequestBytes: 16 * 1024 },
  'backup.list': { method: 'GET', path: '/api/admin/backups' },
  'backup.delete': { method: 'DELETE', path: '/api/admin/backups', query: ['type', 'file'] },
  'upload.asset': { method: 'POST', path: '/api/upload', query: ['activityId', 'category'], multipart: true, maxRequestBytes: 51 * 1024 * 1024, maxResponseBytes: 64 * 1024 },
} as const satisfies UpstreamRouteTable

export type AdminUpstreamRouteName = keyof typeof ADMIN_UPSTREAM_ROUTES

const ADMIN_DEFAULT_MAX_REQUEST_BYTES = 51 * 1024 * 1024
const ADMIN_DEFAULT_MAX_RESPONSE_BYTES = 4 * 1024 * 1024

export function createAdminUpstreamClient(options: UpstreamClientOptions) {
  return createFixedUpstreamClient<typeof ADMIN_UPSTREAM_ROUTES, AdminUpstreamRouteName>({
    maxRequestBytes: ADMIN_DEFAULT_MAX_REQUEST_BYTES,
    maxResponseBytes: ADMIN_DEFAULT_MAX_RESPONSE_BYTES,
    ...options,
    routes: ADMIN_UPSTREAM_ROUTES,
  })
}
