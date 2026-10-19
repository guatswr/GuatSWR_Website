/**
 * Server-derived member ordering.
 *
 * Expected keys are the archived `Members.vue` `getSortKey` values, produced by
 * the pinned `pinyin-pro` 3.28.0 call `pinyin(firstChar, { toneType: 'none' })`
 * (whose `[0]` is the tone-less vowel of the syllable) and, equivalently,
 * `{ pattern: 'first', toneType: 'none' }`. Written but not run here: the
 * worktree has no `node_modules`; Codex installs the pinned dependency
 * centrally before running the suite.
 */
import { describe, expect, it } from 'vitest'
import { deriveMemberSortKeys, hanInitial, memberSortKey } from '../server/utils/member-sort'

describe('archived member sort keys', () => {
  it('keeps the archived categories and keys for Latin names', () => {
    expect(memberSortKey('Cirno')).toEqual({ category: 0, key: 'cirno' })
    expect(memberSortKey('  Taropoi ')).toEqual({ category: 0, key: 'taropoi' })
    expect(memberSortKey('Reimu')).toEqual({ category: 0, key: 'reimu' })
  })

  it('uses the pinyin initial of the first Han character', () => {
    expect(memberSortKey('张三')).toEqual({ category: 1, key: 'z' })
    expect(memberSortKey('安琪')).toEqual({ category: 1, key: 'a' })
    expect(memberSortKey('李四')).toEqual({ category: 1, key: 'l' })
    expect(memberSortKey('王五')).toEqual({ category: 1, key: 'w' })
  })

  it('matches pinyin-pro for polyphonic characters', () => {
    // pinyin-pro 3.28.0 reads 曾 as ceng, 长 as chang, 重 as zhong, 乐 as le.
    expect(hanInitial('曾')).toBe('c')
    expect(hanInitial('长')).toBe('c')
    expect(hanInitial('重')).toBe('z')
    expect(hanInitial('乐')).toBe('l')
    expect(hanInitial('单')).toBe('d')
    expect(hanInitial('解')).toBe('j')
    expect(hanInitial('仇')).toBe('c')
    expect(hanInitial('翟')).toBe('z')
  })

  it('keeps symbols and empty names in the archived "other" category', () => {
    expect(memberSortKey('④')).toEqual({ category: 2, key: '④' })
    expect(memberSortKey('')).toEqual({ category: 2, key: '' })
    expect(memberSortKey(null)).toEqual({ category: 2, key: '' })
    expect(hanInitial('A')).toBe('')
    expect(hanInitial('④')).toBe('')
  })

  it('derives one key per member id', () => {
    expect(deriveMemberSortKeys([
      { id: 1, name: 'Cirno' },
      { id: 2, name: '阿离' },
      { id: 7, name: 'Reimu' },
    ])).toEqual({
      '1': { category: 0, key: 'cirno' },
      '2': { category: 1, key: 'a' },
      '7': { category: 0, key: 'reimu' },
    })
  })
})
