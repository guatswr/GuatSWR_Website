import path from 'node:path'
import { existsSync } from 'node:fs'
import type { Row } from '../../database/sqlite.js'
import type { MemberRow } from './repository.js'

export function normalizeTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return []
  return [...new Set(tags.map((tag: unknown) => String(tag || '').trim()).filter(Boolean))]
}
export function parseTags(raw: unknown): string[] {
  if (!raw) return []
  if (Array.isArray(raw)) return normalizeTags(raw)
  if (typeof raw !== 'string') return []
  try { return normalizeTags(JSON.parse(raw)) } catch { return [] }
}
export interface MemberStorageProjection { resolveUploadsPath(url: string): string | null; toUploadsUrl(filename: string): string }
export function buildThumbUrl(url: unknown, storage: MemberStorageProjection): unknown {
  if (!url || typeof url !== 'string' || url.includes('-thumb.webp')) return url
  let origin = '', pathname = url
  try {
    if (/^https?:\/\//i.test(url)) {
      const parsed = new URL(url)
      origin = parsed.origin
      pathname = parsed.pathname || ''
    }
  } catch { /* Preserve malformed/external URL fallback. */ }
  if (!pathname.startsWith('/uploads/')) return url
  const absolute = storage.resolveUploadsPath(pathname)
  if (!absolute) return url
  const thumb = path.join(path.dirname(absolute), `${path.parse(absolute).name}-thumb.webp`)
  if (!existsSync(thumb)) return url
  const projected = storage.toUploadsUrl(thumb)
  return origin ? `${origin}${projected}` : projected
}
export function projectMember(row: MemberRow, original: boolean, storage: MemberStorageProjection, privileged=false): Row {
  const fields=['id','name','role','avatar','school','tags','sort_order','deleted_at','deleted_by']
  if(privileged)fields.push('qq','profile_status','sync_managed','sync_hidden','sync_protected','follow_group_name','follow_group_avatar')
  const publicRow: Row = Object.fromEntries(fields.filter(field=>field in row).map(field=>[field,row[field]]))
  const thumb = buildThumbUrl(row.avatar, storage)
  return { ...publicRow, tags: parseTags(row.tags), avatar_thumb: thumb, avatar_original: row.avatar, avatar: original ? row.avatar : thumb || row.avatar }
}
