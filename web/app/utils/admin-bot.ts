export const botSections = [
  { id: 'credentials', label: '凭据与权限', super: true },
  { id: 'sync', label: '群成员同步', super: true },
  { id: 'profiles', label: '成员资料', super: false },
  { id: 'deliveries', label: '通知投递', super: true },
] as const
export type BotSection = typeof botSections[number]['id']
export function resolveBotSection(value: unknown, superAdmin: boolean): BotSection {
  return botSections.find(item => item.id === value && (!item.super || superAdmin))?.id ?? (superAdmin ? 'credentials' : 'profiles')
}
export function botMemberId(value: unknown): number | null {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) return null
  return Number(value)
}
export function botPageLink(section: BotSection, member?: number | null) {
  return `/admin/bot?${new URLSearchParams({ section, ...(section === 'profiles' && member && Number.isSafeInteger(member) && member > 0 ? { member: String(member) } : {}) })}`
}
export function legacyMemberBotLink(query: Record<string, unknown>, hash: string): string | null {
  if (query.pending === '1') return botPageLink('profiles', botMemberId(query.member))
  if (hash === '#member-sync') return botPageLink('sync')
  return null
}
export function botActionLink(action: string): string | null {
  if (action.startsWith('BOT_CREDENTIAL_')) return botPageLink('credentials')
  if (action === 'BOT_DELIVERY_RETRY') return botPageLink('deliveries')
  if (action === 'MEMBER_PROFILE_UPDATE') return botPageLink('profiles')
  if (action.startsWith('MEMBER_SYNC_')) return botPageLink('sync')
  return null
}
