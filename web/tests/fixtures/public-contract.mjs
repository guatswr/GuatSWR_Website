// Pure frozen-v1 projections shared by immutable and mutable fixture servers.
/** Author id -> public display columns, mirroring the archived joins. */
const FIXTURE_USERS = {
  1: { username: 'Taropoi', avatar: '/uploads/img/user/1-thumb.webp' },
  2: { username: 'Cirno', avatar: '/uploads/img/user/2-thumb.webp' },
}

export const parseList = (raw) => {
  if (Array.isArray(raw)) return raw
  if (typeof raw !== 'string' || !raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  }
  catch {
    return []
  }
}

/** `buildThumbUrl` from the archived members route, without touching the disk. */
const thumbnailUrl = (url) => {
  if (!url || typeof url !== 'string' || url.includes('-thumb.webp') || url.endsWith('.svg')) return url
  const clean = url.split(/[?#]/)[0]
  const slash = clean.lastIndexOf('/')
  if (slash === -1) return url
  const name = clean.slice(slash + 1)
  const dot = name.lastIndexOf('.')
  return `${clean.slice(0, slash)}/${dot > 0 ? name.slice(0, dot) : name}-thumb.webp`
}

export const isPublicFixtureActivity = row => row.deleted_at === null && (row.status === null || row.status === 'published')

/** One frozen detail projection, shared by immutable and mutable fixtures. */
export const projectFixtureActivityDetail = row => {
  const author = FIXTURE_USERS[row.created_by] ?? null
  const editor = FIXTURE_USERS[row.updated_by] ?? null
  return {
    ...row,
    images: parseList(row.images),
    created_by: author?.username ?? null,
    created_by_avatar: author?.avatar ?? null,
    created_by_name: author?.username ?? null,
    updated_by: editor?.username ?? null,
    updated_by_avatar: editor?.avatar ?? null,
    updated_by_name: editor?.username ?? null,
  }
}

export const projectFixtureMember = (row, original = false) => {
  const rest = { ...row }
  delete rest.bio
  const avatar_thumb = thumbnailUrl(row.avatar)
  return { ...rest, tags: parseList(row.tags), avatar_thumb, avatar_original: row.avatar, avatar: original ? row.avatar : avatar_thumb || row.avatar }
}

export const compareFixtureHistory = (a, b) => String(a.date).localeCompare(String(b.date)) || a.sort_order - b.sort_order
