import type { PublicEvent } from '@guatswr/shared'
import { eventSignupDeadline } from './event-display'

export interface EventCategoryMeta {
  readonly path: string
  readonly label: string
  readonly kind: 'all' | 'bounty' | 'betting' | 'stg' | 'zetime' | 'party'
  readonly type: string
  readonly seal: string
  readonly subtitle: string
  readonly color: string
  readonly darkColor: string
}

export const EVENT_NAVIGATION: readonly EventCategoryMeta[] = [
  {
    path: '/events',
    label: '全部活动',
    kind: 'all',
    type: '',
    seal: '总览',
    subtitle: '汇集社团近期悬赏委托、契约对决、弹幕则赛与线下茶会动态。',
    color: '#0369a1',
    darkColor: '#38bdf8',
  },
  {
    path: '/events/bounty',
    label: '悬赏令',
    kind: 'bounty',
    type: '悬赏令',
    seal: '悬赏',
    subtitle: '发布你的挑战课题与悬赏报酬，静候同好揭榜应战。',
    color: '#b45309',
    darkColor: '#fbbf24',
  },
  {
    path: '/events/betting',
    label: '对赌协议',
    kind: 'betting',
    type: '对赌协议',
    seal: '立约',
    subtitle: '立下双方目标与败者罚则，在截止之日前见证彼此的决心。',
    color: '#be123c',
    darkColor: '#fb7185',
  },
  {
    path: '/events/stg',
    label: '东方弹幕',
    kind: 'stg',
    type: 'STG',
    seal: '弹幕',
    subtitle: '正作避弹、一命通关与收点切磋，欢迎各位机师报名参战。',
    color: '#0284c7',
    darkColor: '#38bdf8',
  },
  {
    path: '/events/zetime',
    label: '非想天则',
    kind: 'zetime',
    type: '则则',
    seal: '天则',
    subtitle: '萃梦想至非想天则格斗大本营，立回切磋与正式则赛报名处。',
    color: '#6d28d9',
    darkColor: '#a78bfa',
  },
  {
    path: '/events/party',
    label: '线下聚会',
    kind: 'party',
    type: '线下聚会',
    seal: '雅集',
    subtitle: '小聚、大聚、聚餐与同好面基，在现世相聚畅聊东方。',
    color: '#047857',
    darkColor: '#34d399',
  },
] as const

export function eventCategory(type: string): EventCategoryMeta {
  return EVENT_NAVIGATION.find(item => item.type === type) ?? EVENT_NAVIGATION[0]!
}

export function eventCategoryByPath(path: string): EventCategoryMeta {
  const clean = path.replace(/\/$/, '') || '/events'
  return EVENT_NAVIGATION.find(item => item.path === clean) ?? EVENT_NAVIGATION[0]!
}

export function eventAcceptingParticipants(event: PublicEvent, now: number): boolean {
  if (!['published', 'ongoing'].includes(event.status)) return false
  const deadline = eventSignupDeadline(event.content)
  return deadline === null || deadline > now
}

export function eventSupportsSignup(event: PublicEvent): boolean {
  return event.type === 'STG' || event.type === '则则'
}
