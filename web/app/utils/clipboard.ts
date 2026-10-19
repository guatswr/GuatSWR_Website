/**
 * Clipboard copy outcome, independent of the DOM.
 *
 * Extracted from the code-block component so the failure paths can be tested
 * directly: a rejected Clipboard API call, an `execCommand` that returns
 * `false` and an `execCommand` that throws are all failures. The legacy path
 * never reports success just because there was text to copy.
 */

export type CopyOutcome = 'copied' | 'failed'

export interface ClipboardAdapter {
  /** Async Clipboard API writer, or `undefined` when the API is unavailable. */
  readonly write?: ((text: string) => Promise<void>) | undefined
  /** Selection-based fallback; must report the real result of the command. */
  readonly copySelection: () => boolean
}

export async function copyText(text: string, adapter: ClipboardAdapter): Promise<CopyOutcome> {
  if (!text) return 'failed'
  if (adapter.write) {
    try {
      await adapter.write(text)
      return 'copied'
    }
    catch {
      // Denied, unavailable or interrupted: try the selection command instead.
    }
  }
  try {
    return adapter.copySelection() ? 'copied' : 'failed'
  }
  catch {
    return 'failed'
  }
}
