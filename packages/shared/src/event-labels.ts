/** Schema-free display labels: public cards must not import form validators. */
export const EVENT_STATUS_LABELS: Readonly<Record<string, string>> = {
  draft: '草稿',
  pending: '待审核',
  published: '已发布',
  ongoing: '进行中',
  ended: '已结束',
  settled: '已验收',
  rejected: '已驳回',
}

export function eventStatusLabel(type: unknown, status: unknown): string {
  const value = typeof status === 'string' ? status : ''
  if ((type === 'STG' || type === '则则') && value === 'published') return '报名中'
  if (type === '线下聚会' && value === 'published') return '倒计时'
  return EVENT_STATUS_LABELS[value] ?? value
}
