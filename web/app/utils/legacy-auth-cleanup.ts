const LEGACY_AUTH_KEYS = ['token', 'user', 'role', 'avatar'] as const

/** Only this origin's v1 credentials; do not touch another site's storage. */
export function clearLegacyAuthStorage(storage: Pick<Storage, 'removeItem'>, cookieDocument: Pick<Document, 'cookie'>): void {
  for (const key of LEGACY_AUTH_KEYS) {
    try { storage.removeItem(key) } catch { /* Storage may be disabled. */ }
    // v1 used host-only cookies with Path=/, so no parent-domain deletion.
    try { cookieDocument.cookie = `${key}=; Max-Age=0; Path=/; SameSite=Lax` } catch { /* Cookie access may be disabled. */ }
  }
}
