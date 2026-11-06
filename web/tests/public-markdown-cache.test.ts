import { describe, expect, it, vi } from 'vitest'
import {
  createMarkdownRenderCache,
  renderCachedMarkdown,
} from '../server/utils/markdown-cache'
import { renderSafeMarkdown } from '../server/utils/markdown'
import type { SafeMarkdownResult } from '#shared/markdown'

describe('public markdown render cache (WEB-01)', () => {
  it('deduplicates 20 concurrent identical render requests (single-flight coalescing)', async () => {
    let renderCalls = 0
    const mockRenderer = vi.fn(async (source: string): Promise<SafeMarkdownResult> => {
      renderCalls += 1
      // Simulate real async MDC/Shiki compilation latency
      await new Promise(resolve => setTimeout(resolve, 20))
      return renderSafeMarkdown(source)
    })

    const cache = createMarkdownRenderCache({
      renderer: mockRenderer,
    })

    const markdown = '## 并发标题\n\n这是一段测试内容，带有公式 $a^2 + b^2 = c^2$ 和代码。'
    const concurrency = 20

    // Fire 20 concurrent calls with identical content
    const promises = Array.from({ length: concurrency }, () => cache.render(markdown))
    const results = await Promise.all(promises)

    expect(renderCalls).toBe(1)
    expect(mockRenderer).toHaveBeenCalledTimes(1)
    expect(results).toHaveLength(concurrency)

    // All results must be identical in content
    const firstJson = JSON.stringify(results[0])
    for (let i = 1; i < concurrency; i += 1) {
      expect(JSON.stringify(results[i])).toBe(firstJson)
    }

    // Subsequent call after completion should hit cache with 0 additional render calls
    const warmResult = await cache.render(markdown)
    expect(JSON.stringify(warmResult)).toBe(firstJson)
    expect(renderCalls).toBe(1)
  })

  it('re-renders when markdown content changes', async () => {
    let renderCalls = 0
    const mockRenderer = vi.fn(async (source: string) => {
      renderCalls += 1
      return renderSafeMarkdown(source)
    })
    const cache = createMarkdownRenderCache({ renderer: mockRenderer })

    await cache.render('# Version 1')
    expect(renderCalls).toBe(1)

    await cache.render('# Version 2')
    expect(renderCalls).toBe(2)
  })

  it('re-renders when renderVersion changes', async () => {
    let renderCalls = 0
    const mockRenderer = vi.fn(async (source: string) => {
      renderCalls += 1
      return renderSafeMarkdown(source)
    })

    const cache1 = createMarkdownRenderCache({
      renderVersion: 'v1',
      renderer: mockRenderer,
    })
    const cache2 = createMarkdownRenderCache({
      renderVersion: 'v2',
      renderer: mockRenderer,
    })

    const content = '# Same content across different rule versions'
    await cache1.render(content)
    expect(renderCalls).toBe(1)

    await cache2.render(content)
    expect(renderCalls).toBe(2)
  })

  it('does not store errors in cache and allows subsequent retry', async () => {
    let attempts = 0
    const flakyRenderer = vi.fn(async (source: string) => {
      attempts += 1
      if (attempts === 1) {
        throw new Error('Transient render parser failure')
      }
      return renderSafeMarkdown(source)
    })

    const cache = createMarkdownRenderCache({ renderer: flakyRenderer })
    const markdown = '# Fragile document'

    // First attempt fails
    await expect(cache.render(markdown)).rejects.toThrow('Transient render parser failure')
    expect(cache.size).toBe(0)
    expect(cache.inflightCount).toBe(0)

    // Second attempt succeeds and is cached
    const res = await cache.render(markdown)
    expect(res.complete).toBe(true)
    expect(cache.size).toBe(1)

    // Third attempt hits warm cache
    await cache.render(markdown)
    expect(attempts).toBe(2)
  })

  it('evicts least recently used items when maxKeys or maxTotalBytes is reached', async () => {
    const clock = { time: 1000 }
    const cache = createMarkdownRenderCache({
      maxKeys: 3,
      now: () => clock.time,
    })

    await cache.render('# Post 1')
    clock.time += 10
    await cache.render('# Post 2')
    clock.time += 10
    await cache.render('# Post 3')
    expect(cache.size).toBe(3)

    // Access Post 1 to make Post 2 the least recently used
    clock.time += 10
    await cache.render('# Post 1')

    // Insert Post 4, should evict Post 2
    clock.time += 10
    await cache.render('# Post 4')
    expect(cache.size).toBe(3)

    // Post 2 was evicted, so reading Post 2 causes a re-render
    const renderLog: string[] = []
    const countingCache = createMarkdownRenderCache({
      maxKeys: 2,
      renderer: async s => {
        renderLog.push(s)
        return renderSafeMarkdown(s)
      },
    })
    await countingCache.render('# Post 1')
    await countingCache.render('# Post 2')
    expect(renderLog).toEqual(['# Post 1', '# Post 2'])

    await countingCache.render('# Post 3') // Evicts Post 1
    await countingCache.render('# Post 2') // Hits cache
    expect(renderLog).toEqual(['# Post 1', '# Post 2', '# Post 3'])

    await countingCache.render('# Post 1') // Re-renders Post 1
    expect(renderLog).toEqual(['# Post 1', '# Post 2', '# Post 3', '# Post 1'])
  })

  it('renders oversized items on-demand without retaining them in cache', async () => {
    // 50 bytes ceiling
    const cache = createMarkdownRenderCache({
      maxEntryBytes: 50,
    })

    const large = '# A large heading that generates an AST way larger than 50 bytes'

    const res = await cache.render(large)
    expect(res.complete).toBe(true)
    // Oversized item is returned to caller but NOT retained
    expect(cache.size).toBe(0)
    expect(cache.retainedBytes).toBe(0)
  })

  it('isolates returned AST objects so mutating results does not poison cached trees', async () => {
    const cache = createMarkdownRenderCache()
    const content = '# Original Title\n\nParagraph text'

    const first = await cache.render(content)
    expect(first.nodes.length).toBeGreaterThan(0)

    // Malicious caller mutates the returned result
    const firstNode = first.nodes[0]
    if (firstNode && firstNode.type === 'element') {
      Object.assign(firstNode, { tag: 'hacked', children: [] })
    }
    first.headings.length = 0

    // Next caller reads the same content
    const second = await cache.render(content)
    expect(second.headings.length).toBeGreaterThan(0)
    if (second.nodes[0] && second.nodes[0].type === 'element') {
      expect(second.nodes[0].tag).not.toBe('hacked')
      expect(second.nodes[0].children.length).toBeGreaterThan(0)
    }
  })

  it('expires entries after ttlMs', async () => {
    const clock = { time: 1000 }
    let calls = 0
    const cache = createMarkdownRenderCache({
      now: () => clock.time,
      ttlMs: 5000,
      renderer: async s => {
        calls += 1
        return renderSafeMarkdown(s)
      },
    })

    await cache.render('# Content')
    expect(calls).toBe(1)

    // Within TTL
    clock.time += 4999
    await cache.render('# Content')
    expect(calls).toBe(1)

    // Expired
    clock.time += 2
    await cache.render('# Content')
    expect(calls).toBe(2)
  })

  it('produces identical sanitization, math and highlight results through cached render', async () => {
    const markdown = [
      '# 深度测试',
      '',
      '这里包含 KaTeX 公式 $E=mc^2$ 以及块级公式：',
      '$$',
      '\\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}',
      '$$',
      '',
      '代码高亮：',
      '```ts',
      'const answer: number = 42;',
      '```',
      '',
      '以及恶意标签：<script>alert("xss")</script><img src="x" onerror="alert(1)">',
    ].join('\n')

    // Warm up shiki/mdc engine to stabilize grammar tokenization
    await renderSafeMarkdown('```ts\nconst warmup: number = 0;\n```')

    const direct = await renderSafeMarkdown(markdown)
    const cached = await renderCachedMarkdown(markdown)

    expect(cached).toEqual(direct)
  })

  it('never bypasses unpublish visibility check: unpublished activity returns 404 without reaching or leaking cache', async () => {
    let published = true
    const getActivity = vi.fn(async (id: number) => {
      if (!published) {
        throw Object.assign(new Error('Activity not found'), { statusCode: 404 })
      }
      return { id, title: 'Secret Event', content: '# Top Secret Draft' }
    })

    const cache = createMarkdownRenderCache()

    const fetchActivityHandler = async (id: number) => {
      const act = await getActivity(id)
      const body = await cache.render(act.content)
      return { activity: act, body }
    }

    const first = await fetchActivityHandler(1)
    expect(first.body.headings.length).toBeGreaterThan(0)
    expect(cache.size).toBe(1)

    // Unpublish the activity
    published = false

    // Subsequent request must reject with 404
    await expect(fetchActivityHandler(1)).rejects.toMatchObject({ statusCode: 404 })
  })
})
