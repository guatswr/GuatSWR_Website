/**
 * Login-form presentation helpers.
 *
 * TanStack Form surfaces Standard Schema issues as objects (or callback
 * strings), so the page needs one tolerant reader. Focusing the first invalid
 * field is a DOM concern kept out of the component template.
 */

/** Extract the first usable message from a TanStack Form error array. */
export function validationErrorText(errors: readonly unknown[] | undefined): string {
  if (!Array.isArray(errors)) return ''
  for (const error of errors) {
    if (typeof error === 'string' && error.length > 0) return error
    if (typeof error === 'object' && error !== null) {
      const message = (error as { message?: unknown }).message
      if (typeof message === 'string' && message.length > 0) return message
    }
  }
  return ''
}

/**
 * Move focus to the first control the form marked `aria-invalid`.
 *
 * Only invalid controls are targeted: after a successful submit (or a server
 * error with valid fields) this is deliberately a no-op, so it can run after
 * `handleSubmit()` without pulling focus out of the confirmation modal.
 */
export function focusFirstInvalidField(root: ParentNode | null | undefined): void {
  if (!root || typeof (root as ParentNode).querySelector !== 'function') return
  root.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
}
