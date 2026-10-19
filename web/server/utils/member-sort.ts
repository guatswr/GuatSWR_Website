/**
 * Server-derived member sort keys.
 *
 * The archived `Members.vue` imported `pinyin-pro` in the browser and sorted
 * with `pinyin(firstCharacter, { toneType: 'none' })[0]` - the pinyin initial
 * of the first character. `pinyin-pro` 3.x returns that value as a string, so
 * the archived key is the initial letter, and the same call with
 * `pattern: 'first'` states the intent explicitly.
 *
 * Sorting happens on the server so the browser never needs a pinyin library:
 * the initial page render, a school filter and a client-side navigation all
 * consume the same serialized keys, and Node and the browser cannot disagree
 * about the order.
 */
import { pinyin } from 'pinyin-pro'
import type { MemberSortKey } from '#shared/content'

const LATIN_FIRST = /^[A-Za-z]$/
const HAN_FIRST = /^[一-鿿]$/

/** Archived fallback for a character pinyin-pro cannot read. */
const FALLBACK_INITIAL = 'z'

/** Pinyin initial of one Han character; the archived `'z'` fallback applies. */
export const hanInitial = (character: string): string => {
  if (!HAN_FIRST.test(character)) return ''
  try {
    const result: unknown = pinyin(character, { pattern: 'first', toneType: 'none' })
    const initial = Array.isArray(result) ? result[0] : result
    return typeof initial === 'string' && initial ? initial.toLowerCase() : FALLBACK_INITIAL
  }
  catch {
    return FALLBACK_INITIAL
  }
}

/** Archived `getSortKey`, verbatim categories and keys. */
export const memberSortKey = (name: string | null | undefined): MemberSortKey => {
  const trimmed = String(name ?? '').trim()
  const first = trimmed.charAt(0)
  if (!first) return { category: 2, key: '' }
  if (LATIN_FIRST.test(first)) return { category: 0, key: trimmed.toLowerCase() }
  if (HAN_FIRST.test(first)) return { category: 1, key: hanInitial(first) }
  return { category: 2, key: trimmed }
}

/** Key per member id, for the serialized payload consumed by the UI. */
export const deriveMemberSortKeys = (
  members: readonly { readonly id: number, readonly name: string }[],
): Record<string, MemberSortKey> => {
  const keys: Record<string, MemberSortKey> = {}
  for (const member of members) keys[String(member.id)] = memberSortKey(member.name)
  return keys
}
