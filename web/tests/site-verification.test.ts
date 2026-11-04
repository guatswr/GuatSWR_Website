import { describe, expect, it } from 'vitest'
import {
  extractMetaContent,
  isValidMetaName,
  parseCustomVerification,
  resolveSiteVerificationMeta,
} from '../app/utils/site-verification'

describe('site verification utility', () => {
  describe('extractMetaContent', () => {
    it('extracts bare token string', () => {
      expect(extractMetaContent('codeva-g9JIawSEQ3')).toBe('codeva-g9JIawSEQ3')
      expect(extractMetaContent('  codeva-g9JIawSEQ3  ')).toBe('codeva-g9JIawSEQ3')
    })

    it('strips surrounding single or double quotes', () => {
      expect(extractMetaContent('"codeva-g9JIawSEQ3"')).toBe('codeva-g9JIawSEQ3')
      expect(extractMetaContent("'codeva-g9JIawSEQ3'")).toBe('codeva-g9JIawSEQ3')
    })

    it('extracts content attribute from full HTML meta tags', () => {
      expect(extractMetaContent('<meta name="baidu-site-verification" content="codeva-g9JIawSEQ3" />')).toBe('codeva-g9JIawSEQ3')
      expect(extractMetaContent("<meta name='baidu-site-verification' content='codeva-g9JIawSEQ3'>")).toBe('codeva-g9JIawSEQ3')
      expect(extractMetaContent('<meta name="baidu-site-verification"   content = "codeva-g9JIawSEQ3"  />')).toBe('codeva-g9JIawSEQ3')
    })

    it('sanitizes dangerous characters and newlines', () => {
      expect(extractMetaContent('codeva<script>alert(1)</script>')).toBe('codevascriptalert(1)/script')
      expect(extractMetaContent('codeva\r\ntoken')).toBe('codevatoken')
    })

    it('handles empty or non-string inputs safely', () => {
      expect(extractMetaContent('')).toBe('')
      expect(extractMetaContent('   ')).toBe('')
      expect(extractMetaContent(null)).toBe('')
      expect(extractMetaContent(undefined)).toBe('')
      expect(extractMetaContent(12345)).toBe('')
    })
  })

  describe('isValidMetaName', () => {
    it('accepts valid standard meta names', () => {
      expect(isValidMetaName('baidu-site-verification')).toBe(true)
      expect(isValidMetaName('google-site-verification')).toBe(true)
      expect(isValidMetaName('msvalidate.01')).toBe(true)
      expect(isValidMetaName('sogou_site_verification')).toBe(true)
      expect(isValidMetaName('360-site-verification')).toBe(true)
      expect(isValidMetaName('custom-verification_tag.1')).toBe(true)
    })

    it('rejects invalid or unsafe meta names', () => {
      expect(isValidMetaName('')).toBe(false)
      expect(isValidMetaName('name with space')).toBe(false)
      expect(isValidMetaName('<script>')).toBe(false)
      expect(isValidMetaName('tag"quote')).toBe(false)
      expect(isValidMetaName('tag/slash')).toBe(false)
    })
  })

  describe('parseCustomVerification', () => {
    it('parses JSON array format', () => {
      const json = JSON.stringify([
        { name: 'custom-tag-1', content: 'value-1' },
        { name: 'custom-tag-2', content: '<meta name="custom-tag-2" content="value-2" />' },
      ])
      const result = parseCustomVerification(json)
      expect(result).toEqual([
        { name: 'custom-tag-1', content: 'value-1' },
        { name: 'custom-tag-2', content: 'value-2' },
      ])
    })

    it('parses JSON object format', () => {
      const json = JSON.stringify({
        'bytedance-verification-code': 'byte123',
        'yandex-verification': 'yan456',
      })
      const result = parseCustomVerification(json)
      expect(result).toEqual([
        { name: 'bytedance-verification-code', content: 'byte123' },
        { name: 'yandex-verification', content: 'yan456' },
      ])
    })

    it('parses delimited key-value string format', () => {
      const str = 'custom1=val1, custom2=val2; custom3=val3'
      const result = parseCustomVerification(str)
      expect(result).toEqual([
        { name: 'custom1', content: 'val1' },
        { name: 'custom2', content: 'val2' },
        { name: 'custom3', content: 'val3' },
      ])
    })
  })

  describe('resolveSiteVerificationMeta', () => {
    it('resolves Baidu site verification from flat runtime config', () => {
      const config = { siteVerificationBaidu: 'codeva-g9JIawSEQ3' }
      const meta = resolveSiteVerificationMeta(config)
      expect(meta).toEqual([
        { name: 'baidu-site-verification', content: 'codeva-g9JIawSEQ3' },
      ])
    })

    it('resolves Baidu site verification from nested runtime config', () => {
      const config = {
        siteVerification: {
          baidu: '<meta name="baidu-site-verification" content="codeva-g9JIawSEQ3" />',
        },
      }
      const meta = resolveSiteVerificationMeta(config)
      expect(meta).toEqual([
        { name: 'baidu-site-verification', content: 'codeva-g9JIawSEQ3' },
      ])
    })

    it('resolves multiple search engines in order without duplicates', () => {
      const config = {
        siteVerification: {
          baidu: 'codeva-g9JIawSEQ3',
          google: 'google-token-123',
          bing: 'bing-token-456',
          sogou: 'sogou-token-789',
          so: '360-token-012',
        },
        siteVerificationBaidu: 'codeva-g9JIawSEQ3',
      }
      const meta = resolveSiteVerificationMeta(config)
      expect(meta).toEqual([
        { name: 'baidu-site-verification', content: 'codeva-g9JIawSEQ3' },
        { name: 'google-site-verification', content: 'google-token-123' },
        { name: 'msvalidate.01', content: 'bing-token-456' },
        { name: 'sogou_site_verification', content: 'sogou-token-789' },
        { name: '360-site-verification', content: '360-token-012' },
      ])
    })

    it('combines standard engines and custom verification tags', () => {
      const config = {
        siteVerificationBaidu: 'codeva-g9JIawSEQ3',
        siteVerificationCustom: 'my-verification=secret123',
      }
      const meta = resolveSiteVerificationMeta(config)
      expect(meta).toEqual([
        { name: 'baidu-site-verification', content: 'codeva-g9JIawSEQ3' },
        { name: 'my-verification', content: 'secret123' },
      ])
    })

    it('returns empty array when no verification variables are configured', () => {
      expect(resolveSiteVerificationMeta({})).toEqual([])
      expect(resolveSiteVerificationMeta(undefined)).toEqual([])
      expect(resolveSiteVerificationMeta({ siteVerification: { baidu: '' } })).toEqual([])
    })

    it('renders valid head meta tags in server unhead output', async () => {
      const { createHead } = await import('unhead/server')
      const head = createHead()
      const meta = resolveSiteVerificationMeta({
        siteVerificationBaidu: '<meta name="baidu-site-verification" content="codeva-g9JIawSEQ3" />',
        siteVerificationGoogle: 'goog123',
      })
      head.push({ meta })
      const rendered = await head.render()
      expect(rendered.headTags).toContain('<meta name="baidu-site-verification" content="codeva-g9JIawSEQ3">')
      expect(rendered.headTags).toContain('<meta name="google-site-verification" content="goog123">')
    })
  })
})
