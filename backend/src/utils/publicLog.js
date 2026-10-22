// Kept aligned with web/server/lib/public-read/log-projection.ts until BM-14 shared consumption.

/**
 * Public audit-log descriptions are bounded before any redaction regex runs.
 * Every frozen `addLog` call site is a short sentence; 4096 UTF-16 code units
 * is far above legitimate data while keeping defensive scanning predictable.
 */
const MAX_PUBLIC_LOG_DETAILS_LENGTH = 4_096
/** Fixed replacement for an over-bound log description (never a partial copy). */
const PUBLIC_LOG_DETAILS_OMITTED = '日志详情过长，已省略'
/**
 * Security and admin-only actions whose frozen descriptions embed the caller
 * IP, credential values or failing internal details (`addLog` call sites in
 * `backend/src/routes` and `backend/src/middlewares/ban.js`, for example
 * `登录成功 (IP: ${clientIp})` and `IP ${clientIp} 锁定`). Public readers get
 * fixed safe text instead; ordinary content actions keep their title/name.
 */
const PUBLIC_LOG_DETAILS = new Map([
  ['LOGIN', '登录成功'],
  ['LOGIN_LOCK', '登录尝试过多，已临时锁定'],
  ['BAN_IP', '封禁了一个访问来源'],
  ['UNBAN_IP', '解除了一个访问来源的封禁'],
  ['RESET_PWD', '重置了管理员密码'],
  ['RESET_2FA', '重置了管理员二步验证'],
  ['REFRESH_TOKEN_VERSION', '强制刷新了登录凭证'],
  ['UPDATE_BACKUP_SETTINGS', '更新了自动备份设置'],
  ['DOWNLOAD_BACKUP', '下载了一次备份'],
  ['DELETE_BACKUP', '删除了一次备份'],
  ['AUTO_BACKUP', '执行了自动备份'],
  ['AUTO_BACKUP_FAILED', '自动备份失败'],
  ['DELETE_EVENT_FILE_FAIL', '清理事件文件失败'],
])

/** `site_config` keys that are already public through `/api/config`. */
const PUBLIC_CONFIG_KEYS = new Set([
  'home_bg',
  'join_bg',
  'banner_text',
  'badge_image',
  'mascot_image',
  'qq_qr_image',
  'qq_group_number',
  'qq_join_url',
  'join_question',
  'home_links',
])

const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}(?:\.[A-Za-z0-9_-]+)?/g
const LABELLED_CREDENTIAL_PATTERN = /(?<![a-z0-9])(?:password|passwd|pwd|secret|token(?:_version)?|api[_-]?key|authorization|bearer|credential|jwt)\b\s*[:=]\s*\S+/gi
const IPV4_PATTERN = /\b\d{1,3}(?:\.\d{1,3}){3}\b/g
const IPV6_PATTERN = /(?:[0-9a-f]{0,4}:){3,7}[0-9a-f]{0,4}(?![:0-9a-f])|(?:[0-9a-f]{0,4}:){0,3}[0-9a-f]{0,4}::(?:[0-9a-f]{0,4}:){0,3}[0-9a-f]{0,4}/gi

const isTokenCharacter = (code) =>
  (code >= 48 && code <= 57)
  || (code >= 65 && code <= 90)
  || (code >= 97 && code <= 122)
  || code === 43 // '+'
  || code === 47 // '/'

const isHexCharacter = (code) =>
  (code >= 48 && code <= 57)
  || (code >= 65 && code <= 70)
  || (code >= 97 && code <= 102)

/**
 * Linear replacement for the previous long-token regex. A single pass over
 * maximal `[A-Za-z0-9+/]+` runs redacts base64-shaped runs (>= 40 chars) and
 * hex runs (>= 32 chars) including any `=` padding. That avoids the regex's
 * super-linear backtracking on a long token ending in `===` while redacting a
 * superset of the old matches (only ever safer).
 */
const redactLongTokens = (details) => {
  let result = ''
  let index = 0
  while (index < details.length) {
    if (!isTokenCharacter(details.charCodeAt(index))) {
      result += details.charAt(index)
      index += 1
      continue
    }
    const start = index
    let end = index + 1
    while (end < details.length && isTokenCharacter(details.charCodeAt(end))) end += 1
    let paddingEnd = end
    while (paddingEnd < details.length && details.charCodeAt(paddingEnd) === 61) paddingEnd += 1

    let hex = end - start >= 32
    if (hex) {
      for (let cursor = start; cursor < end; cursor += 1) {
        if (!isHexCharacter(details.charCodeAt(cursor))) {
          hex = false
          break
        }
      }
    }
    result += (end - start >= 40 || hex) ? '[redacted]' : details.slice(start, paddingEnd)
    index = paddingEnd
  }
  return result
}

/**
 * Bounded defence in depth for descriptions that are retained verbatim. This is
 * deliberately *not* a claim that arbitrary text is sanitized: the primary
 * guarantee is the fixed per-action text above. Anything that still matches an
 * address or credential shape is replaced wholesale so a decoy value cannot
 * leak through a retained title.
 */
const redactLogDetails = (details) =>
  redactLongTokens(
    details
      .replace(JWT_PATTERN, '[redacted]')
      .replace(LABELLED_CREDENTIAL_PATTERN, '[redacted]'),
  )
    .replace(IPV4_PATTERN, '[ip]')
    .replace(IPV6_PATTERN, '[ip]')

/**
 * Security actions get fixed text; public config keys survive, others do not.
 * The Map is an own-key lookup: actions named `constructor`, `__proto__` or
 * `toString` cannot inherit a response from `Object.prototype`.
 */
const projectLogDetails = (action, details) => {
  const fixed = PUBLIC_LOG_DETAILS.get(action)
  if (fixed !== undefined) return fixed
  // Bound before parsing/redaction; over-bound text becomes a fixed placeholder
  // rather than a truncated fragment that could look like real content.
  if (details.length > MAX_PUBLIC_LOG_DETAILS_LENGTH) return PUBLIC_LOG_DETAILS_OMITTED
  if (action === 'UPDATE_CONFIG') {
    const separator = details.lastIndexOf(': ')
    const key = separator === -1 ? '' : details.slice(separator + 2).trim()
    return PUBLIC_CONFIG_KEYS.has(key) ? details : '修改了站点配置'
  }
  return details
}

const projectLog = (row) => ({
  id: row.id,
  username: row.username,
  action: row.action,
  // Frozen v1 published these verbatim, including client IPs; the public
  // contract deliberately differs (see docs/revamp/PUBLIC-DATA.md).
  details: redactLogDetails(projectLogDetails(row.action, row.details)),
  created_at: row.created_at,
  user_avatar: row.user_avatar,
})

const projectLogStat = (row) => ({
  username: row.username,
  count: row.count,
  user_avatar: row.user_avatar,
})

module.exports = { projectLog, projectLogStat, PUBLIC_CONFIG_KEYS };
