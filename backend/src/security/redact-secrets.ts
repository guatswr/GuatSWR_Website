/** Bound before scanning. Never pass raw request bodies into the audit log. */
export function redactSecrets(value: string): string {
  if (value.length > 16384) return '[日志详情过长，已省略]'
  return value
    .replace(/gwb_[a-f0-9]{64}/gi, '[token已脱敏]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[token已脱敏]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [token已脱敏]')
    .replace(/((?:["']?)(?:access_token|refresh_token|api[_-]?key|authorization|password|passwd|secret|token)(?:["']?)\s*[:=]\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;&}]+)/gi, '$1[token已脱敏]')
}
