/**
 * Archived login backgrounds, copied byte-for-byte from
 * `frontend/src/bg/login/{1,2,3}.jpg` into `web/public/login-bg/`.
 *
 * The archived page chose one at random after mount; the new page does the
 * same, so the SSR markup is identical to the client's first render (no
 * hydration mismatch) and the fade-in behaviour matches. Visual comparison
 * tests seed `Math.random` identically for both apps to force the same bytes.
 */
export const LOGIN_BACKGROUNDS = ['/login-bg/1.jpg', '/login-bg/2.jpg', '/login-bg/3.jpg'] as const

export function pickLoginBackground(
  images: readonly string[] = LOGIN_BACKGROUNDS,
  random: () => number = Math.random,
): string {
  if (images.length === 0) return ''
  const value = random()
  const clamped = Number.isFinite(value) ? Math.min(Math.max(value, 0), 0.999999) : 0
  return images[Math.floor(clamped * images.length)] ?? ''
}
