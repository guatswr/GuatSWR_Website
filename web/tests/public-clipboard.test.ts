/**
 * Clipboard outcome contract.
 *
 * Regression guard for the P4 review: the legacy selection path used to report
 * success whenever there was text to copy, so a denied Clipboard API plus a
 * failing `execCommand` still showed "已复制". Every branch below is exercised
 * with an explicit adapter, so the outcome is the *actual* result.
 */
import { describe, expect, it, vi } from 'vitest'
import { copyText } from '../app/utils/clipboard'

describe('copyText outcomes', () => {
  it('reports success when the Clipboard API resolves', async () => {
    const write = vi.fn().mockResolvedValue(undefined)
    const copySelection = vi.fn(() => false)
    await expect(copyText('const a = 1', { write, copySelection })).resolves.toBe('copied')
    expect(write).toHaveBeenCalledWith('const a = 1')
    expect(copySelection).not.toHaveBeenCalled()
  })

  it('falls back to the selection command when the Clipboard API rejects', async () => {
    const write = vi.fn().mockRejectedValue(new Error('NotAllowedError'))
    const copySelection = vi.fn(() => true)
    await expect(copyText('code', { write, copySelection })).resolves.toBe('copied')
    expect(copySelection).toHaveBeenCalledTimes(1)
  })

  it('reports failure when the Clipboard API rejects and the command returns false', async () => {
    const write = vi.fn().mockRejectedValue(new Error('NotAllowedError'))
    const copySelection = vi.fn(() => false)
    await expect(copyText('code', { write, copySelection })).resolves.toBe('failed')
  })

  it('reports failure when the Clipboard API rejects and the command throws', async () => {
    const write = vi.fn().mockRejectedValue(new Error('NotAllowedError'))
    const copySelection = vi.fn(() => { throw new Error('execCommand unavailable') })
    await expect(copyText('code', { write, copySelection })).resolves.toBe('failed')
  })

  it('never reports success from the legacy path alone', async () => {
    // The exact P4 regression: text present, no Clipboard API, command false.
    await expect(copyText('non-empty code', { copySelection: () => false })).resolves.toBe('failed')
    await expect(copyText('non-empty code', { copySelection: () => { throw new Error('boom') } }))
      .resolves.toBe('failed')
    await expect(copyText('non-empty code', { copySelection: () => true })).resolves.toBe('copied')
  })

  it('does not touch the clipboard for empty text', async () => {
    const write = vi.fn().mockResolvedValue(undefined)
    const copySelection = vi.fn(() => true)
    await expect(copyText('', { write, copySelection })).resolves.toBe('failed')
    expect(write).not.toHaveBeenCalled()
    expect(copySelection).not.toHaveBeenCalled()
  })
})
