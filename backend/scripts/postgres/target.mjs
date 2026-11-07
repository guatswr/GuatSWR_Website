export const SAFE_TARGET_PATTERN = /(?:_test$|^guatswr_(?:migration|isolated|synthetic|rehearsal|restore|review)_[a-z0-9_]+$)/i
export function validateTargetUrl(connectionString, expectedDatabase) {
  let url
  try { url=new URL(connectionString) } catch { throw Error('TARGET_URL_INVALID') }
  const dbName=decodeURIComponent(url.pathname.slice(1))
  if (!['postgres:','postgresql:'].includes(url.protocol)||!url.hostname||!url.username||url.hash||url.searchParams.has('options')||!SAFE_TARGET_PATTERN.test(dbName)||!/^[a-z][a-z0-9_]{0,62}$/.test(dbName)) throw Error('TARGET_DATABASE_NOT_APPROVED')
  if (expectedDatabase && dbName!==expectedDatabase) throw Error('TARGET_DATABASE_MISMATCH')
  return {dbName,url}
}
