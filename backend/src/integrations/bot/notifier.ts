import type { Actor } from '../../modules/actor.js'
import type { WebhookResult } from './transport.js'
export function createBotNotifier(post: (payload: unknown) => Promise<WebhookResult>) {
  const envelope = (event: string, data: unknown, actor?: Actor | null) => ({
    event, data, actor: actor ? { id: actor.id, username: actor.username, role: actor.role } : null,
    source: 'guatswr_web', timestamp: new Date().toISOString()
  })
  return {
    notifyActivityPublished: (activity: { id: number; title?: string; tag?: string; date?: string; description?: string; cover_image?: string }, actor?: Actor | null) => post(envelope('activity.published', {
      id: activity.id, title: activity.title, tag: activity.tag, date: activity.date, description: activity.description || '', cover_image: activity.cover_image || ''
    }, actor)),
    notifyHistoryUpdated: (history: { id: number; date?: string; title?: string; description?: string; image?: string; sort_order?: number }, actor?: Actor | null, action = 'update') => post(envelope('history.updated', {
      id: history.id, date: history.date, title: history.title, description: history.description || '', image: history.image || '', sort_order: history.sort_order || 0, action
    }, actor)),
    notifyMemberAdded: (member: { id: number; name?: string; role?: string; school?: string; avatar?: string }, actor?: Actor | null) => post(envelope('member.added', {
      id: member.id, name: member.name, role: member.role, school: member.school || '', avatar: member.avatar || ''
    }, actor))
  }
}
