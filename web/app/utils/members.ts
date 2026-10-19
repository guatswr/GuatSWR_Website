/**
 * Members page helpers, ported from the archived `Members.vue`.
 *
 * The archived page sorted members in the browser with `pinyin-pro`. Sorting
 * now happens once on the server (`server/utils/member-sort.ts`), which returns
 * the projected list together with a sort key per member; this module only
 * orders by those keys, so no pinyin library (and no locale-dependent
 * collation of Han characters) is needed on the client, and the SSR order is
 * replayed unchanged during hydration and on every filter change.
 */
import type { PublicSchoolStat } from '@guatswr/shared'
import type { MemberSortKey } from '#shared/content'

export interface SchoolOption {
  readonly value: string
  readonly color: string
  readonly label: string
}

/** Archived representative colours, in the order that groups chart seats. */
export const SCHOOL_OPTIONS: readonly SchoolOption[] = Object.freeze([
  { value: '桂航', color: '#2B65EC', label: '桂航' },
  { value: '桂电', color: '#002060', label: '桂电' },
  { value: '师大', color: '#722E87', label: '师大' },
  { value: '桂师', color: '#E60012', label: '桂师' },
  { value: '桂信', color: '#F39C12', label: '桂信' },
  { value: '漓院', color: '#00BFFF', label: '漓院' },
  { value: '桂理', color: '#607D8B', label: '桂理' },
  { value: '桂旅', color: '#20B2AA', label: '桂旅' },
  { value: '桂医', color: '#2E8B57', label: '桂医' },
  { value: '联外', color: '#800000', label: '联外' },
  { value: 'bot', color: '#424242', label: 'bot' },
])

const FALLBACK_SCHOOL_COLOR = '#9ca3af'
const ALL_TAB_COLOR = '#38bdf8'

export function getSchoolColor(schoolName: string): string {
  const school = SCHOOL_OPTIONS.find(option => option.value === schoolName)
  return school ? school.color : FALLBACK_SCHOOL_COLOR
}

export function getMemberTags(tags: readonly string[] | null | undefined): string[] {
  if (!Array.isArray(tags)) return []
  return tags.map(tag => String(tag || '').trim()).filter(Boolean)
}

/**
 * Archived `parliamentData`: configured schools in configuration order, then
 * unknown schools in backend order (grey). Zero-count groups are dropped.
 */
export function buildParliamentData(stats: readonly PublicSchoolStat[]): {
  readonly label: string
  readonly value: number
  readonly color: string
}[] {
  if (stats.length === 0) return []
  const counts = new Map<string, number>()
  for (const stat of stats) counts.set(stat.school, stat.count)

  const known = new Set(SCHOOL_OPTIONS.map(option => option.value))
  const groups = SCHOOL_OPTIONS
    .map(option => ({
      label: option.label,
      value: counts.get(option.value) ?? 0,
      color: option.color,
    }))
    .filter(group => group.value > 0)

  for (const stat of stats) {
    if (known.has(stat.school) || !stat.school) continue
    groups.push({ label: stat.school, value: stat.count, color: FALLBACK_SCHOOL_COLOR })
  }
  return groups
}

export interface MemberFilterTab extends SchoolOption {
  readonly count: number
}

/** Archived `filterTabs`: "全部" first, then every configured school. */
export function buildMemberFilterTabs(stats: readonly PublicSchoolStat[]): MemberFilterTab[] {
  const counts = new Map<string, number>()
  let total = 0
  for (const stat of stats) {
    counts.set(stat.school, stat.count)
    total += stat.count
  }
  return [
    { label: '全部', value: '', count: total, color: ALL_TAB_COLOR },
    ...SCHOOL_OPTIONS.map(option => ({ ...option, count: counts.get(option.value) ?? 0 })),
  ]
}

/** Archived `getSortKey` output, produced on the server. */
export type { MemberSortKey }

let latinCollator: Intl.Collator | null = null

/** Archived comparison: category first, then `localeCompare('en', 'base')`. */
export function compareMemberNames(a: MemberSortKey, b: MemberSortKey): number {
  if (a.category !== b.category) return a.category - b.category
  latinCollator ??= new Intl.Collator('en', { sensitivity: 'base' })
  return latinCollator.compare(a.key, b.key)
}

/**
 * Stable sort using the server-computed keys. A member without a key (which
 * cannot happen for a server payload) sorts last instead of guessing a key.
 */
export function sortMembersByKeys<T extends { readonly id: number, readonly name: string }>(
  members: readonly T[],
  sortKeys: Readonly<Record<string, MemberSortKey>>,
): T[] {
  return members
    .map((member, index) => {
      const id = String(member.id)
      // Own properties only: an inherited key must never become a sort key.
      const key = Object.hasOwn(sortKeys, id) ? sortKeys[id] : undefined
      return { member, index, key: key ?? { category: 2 as const, key: '' } }
    })
    .sort((a, b) => compareMemberNames(a.key, b.key) || a.index - b.index)
    .map(entry => entry.member)
}
