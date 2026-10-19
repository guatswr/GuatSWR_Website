/** Homepage copy and routes, kept identical to the archived `views/public/Home.vue`. */

export type InterestTone = 'sky' | 'violet' | 'rose' | 'amber'
export type InterestIconName = 'duel' | 'danmaku' | 'music' | 'creation'

export interface HomeInterest {
  number: string
  icon: InterestIconName
  title: string
  subtitle: string
  description: string
  path: string
  cta: string
  color: InterestTone
}

export const HOME_INTERESTS: readonly HomeInterest[] = [
  {
    number: '01',
    icon: 'duel',
    title: '非想天则',
    subtitle: '在对局中认识彼此',
    description:
      '从第一发弹幕到第一场对战，和同好一起练习、切磋，分享每一次进步。',
    path: '/events/zetime',
    cta: '看看活动',
    color: 'sky'
  },
  {
    number: '02',
    icon: 'danmaku',
    title: '东方 STG',
    subtitle: '再来一把，就这一把',
    description:
      '正作通关、符卡挑战、路线交流。无论初见还是打分，都能找到一起玩的人。',
    path: '/events/stg',
    cta: '看看活动',
    color: 'violet'
  },
  {
    number: '03',
    icon: 'music',
    title: '音乐与现场',
    subtitle: '一首歌，连接幻想乡',
    description: '交换循环播放的东方曲目，分享演奏与翻唱，在熟悉的旋律里相遇。',
    path: '/social',
    cta: '去社群看看',
    color: 'rose'
  },
  {
    number: '04',
    icon: 'creation',
    title: '同人创作',
    subtitle: '让喜欢，有自己的形状',
    description:
      '画画、摄影、文字、Cosplay……欢迎展示作品，也欢迎从一个小小的灵感开始。',
    path: '/social',
    cta: '去社群看看',
    color: 'amber'
  }
]
