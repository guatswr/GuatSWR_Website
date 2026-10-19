/**
 * URL query handling for the public pages.
 *
 * Public list pages are server-rendered and paginated with ordinary links, so
 * the query string is the only piece of client state that needs to survive a
 * no-JavaScript request. Only allowlisted keys are ever written back into a
 * link: tracking parameters from an inbound URL are dropped instead of being
 * propagated into canonical URLs and the next page.
 */

/**
 * A raw URL query value, exactly as `route.query[key]` hands it over and before
 * any validation. vue-router 5 types that as `string | null`, and as an array of
 * those for a repeated parameter, so the nullable element belongs in this
 * contract instead of an `as` cast at every call site: the parsers below are
 * what make the value safe, and widening the input type changes no runtime
 * behaviour.
 */
export type QueryValue = string | null | undefined | (string | null)[]

/** First value of a possibly repeated query parameter. */
export function queryValue(value: QueryValue): string | undefined {
  if (Array.isArray(value)) return value[0] ?? undefined
  return value ?? undefined
}

/**
 * `page` is a positive integer. A missing/empty value means the first page;
 * anything else that is not a positive integer is invalid (never coerced).
 */
export function parsePageParam(value: QueryValue): number | null {
  const raw = queryValue(value)
  if (raw === undefined || raw === '') return 1
  // Leading zeros are accepted because the value is a page *number*: `?page=02`
  // is page 2, the same reading the archived view had. Only the canonical link
  // is normalized (`buildPublicPath` always writes the parsed number), and
  // `0`, negatives, fractions, exponents and non-digits still yield `null`.
  if (!/^[0-9]{1,6}$/.test(raw)) return null
  const page = Number(raw)
  return page >= 1 ? page : null
}

/**
 * C0 controls and DEL - the characters untrusted text must never carry.
 *
 * Tested by code point rather than written as a `[\u0000-\u001f]` class, so
 * the source never embeds a control-character escape that `no-control-regex`
 * has to be told to ignore. Semantics are unchanged: code units outside these
 * ranges - including the C1 block and lone surrogates - are kept.
 */
const isControlCharacter = (codePoint: number): boolean => codePoint < 0x20 || codePoint === 0x7f

/** Removes C0 controls and DEL from untrusted text. */
export const stripControlCharacters = (value: string): string =>
  [...value].filter(character => !isControlCharacter(character.codePointAt(0) ?? 0)).join('')

/** Allowlisted filter values: trimmed, bounded, and never repeated. */
export function parseTextParam(value: QueryValue, maxLength = 64): string {
  const raw = queryValue(value) ?? ''
  return stripControlCharacters(raw).trim().slice(0, maxLength)
}

/** A page size that must be one of the sizes the archived page offered. */
export function parsePageSizeParam(value: QueryValue, allowed: readonly number[], fallback: number): number {
  const raw = queryValue(value)
  if (raw === undefined || raw === '') return fallback
  const parsed = Number(raw)
  return Number.isInteger(parsed) && allowed.includes(parsed) ? parsed : fallback
}

const encode = (key: string, value: string): string =>
  `${encodeURIComponent(key)}=${encodeURIComponent(value)}`

/**
 * Build a path with only the parameters supplied by the caller. `undefined`,
 * `null` and empty strings are omitted, so "all schools" and "page 1" produce
 * clean canonical URLs.
 */
export function buildPublicPath(
  pathname: string,
  query: Readonly<Record<string, string | number | null | undefined>>,
): string {
  const search: string[] = []
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue
    search.push(encode(key, String(value)))
  }
  return search.length > 0 ? `${pathname}?${search.join('&')}` : pathname
}

/** Copy only the allowlisted keys that are actually present. */
export function pickQuery(
  query: Readonly<Record<string, QueryValue>>,
  allowed: readonly string[],
): Record<string, string> {
  const picked: Record<string, string> = {}
  for (const key of allowed) {
    const value = queryValue(query[key])
    if (value !== undefined && value !== '') picked[key] = value
  }
  return picked
}

/**
 * Every query key the public pages own. A canonical URL is built from this
 * allowlist, so a tracking parameter that reached a page can never become part
 * of the indexed URL.
 */
export const PUBLIC_QUERY_KEYS: readonly string[] = Object.freeze([
  'page', 'school', 'limit', 'username', 'action', 'range', 'env', 'top',
])

/** Absolute canonical path: configured origin, clean path, no tracking query. */
export function canonicalUrl(origin: string, pathname: string, query: Readonly<Record<string, string | number | null | undefined>> = {}): string {
  const allowed: Record<string, string | number | null | undefined> = {}
  for (const key of PUBLIC_QUERY_KEYS) {
    if (Object.hasOwn(query, key)) allowed[key] = query[key]
  }
  return new URL(buildPublicPath(pathname, allowed), origin).href
}
