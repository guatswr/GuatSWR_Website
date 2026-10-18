import { readFileSync } from 'node:fs'

/**
 * Deterministic public-data fixture for the frozen v1 API.
 *
 * The exported datasets hold *raw* v1 rows (including private, deleted and
 * visitor columns) so the BFF adapters can be pointed at a deliberately leaky
 * upstream in unit tests, while `handlePublicFixture` reproduces the archived
 * backend's own filtering, projection and error statuses for the isolated E2E
 * upstream. Everything is served from memory: no network, no writes.
 */

/** Verified 8x8 four-quadrant PNG (encoded with pngjs, decoded back to check). */
const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAOUlEQVR4AWO02PvjPwMS2LN1HwMyYGIgAJgYCAAmBgKA5RC/LAMyCMjJZkAGTAwEABMDAcDEQAAAABtgB0LwfEaKAAAAAElFTkSuQmCC'

/** Classic 1x1 transparent GIF89a. */
const GIF_BASE64 = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

/**
 * Genuine 1x1 grayscale JPEG. Structure checked while authoring: SOI (FFD8),
 * JFIF APP0 (FFE0), DQT (FFDB), SOF0 (FFC0), two DHT (FFC4), SOS (FFDA),
 * EOI (FFD9).
 */
const JPEG_BASE64 = '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q=='

const SVG_BODY = [
  '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 8 8" role="img" aria-label="fixture image">',
  '  <rect width="8" height="8" fill="#38bdf8" />',
  '  <circle cx="3" cy="3" r="1.5" fill="#ffffff" />',
  '</svg>',
].join('\n')

/**
 * The workspace has no WebP encoder, so the WebP fixture reuses the real
 * committed brand asset (`web/public/brand/group-avatar.webp`). It is a genuine
 * decodable WebP, which keeps the webp thumbnail path exercised end to end.
 */
const webpBytes = () => readFileSync(new URL('../../public/brand/group-avatar.webp', import.meta.url))

export const publicImageFixtures = {
  '.png': { contentType: 'image/png', body: () => Buffer.from(PNG_BASE64, 'base64') },
  '.gif': { contentType: 'image/gif', body: () => Buffer.from(GIF_BASE64, 'base64') },
  '.svg': { contentType: 'image/svg+xml', body: () => Buffer.from(SVG_BODY, 'utf8') },
  '.webp': { contentType: 'image/webp', body: webpBytes },
  '.jpg': { contentType: 'image/jpeg', body: () => Buffer.from(JPEG_BASE64, 'base64') },
  '.jpeg': { contentType: 'image/jpeg', body: () => Buffer.from(JPEG_BASE64, 'base64') },
}

export const publicImageFixture = (extension) => publicImageFixtures[extension.toLowerCase()] ?? null

/** Public config allowlist. Private decoys must never reach the browser. */
export const publicConfigFixture = (credentials = false) => ({
  home_bg: credentials ? 'credential-leak' : '/uploads/fixture.webp',
  join_bg: '/uploads/img/config/join-bg.png',
  banner_text: '契约测试',
  badge_image: '/uploads/img/config/badge.svg',
  mascot_image: '/uploads/img/config/mascot.png',
  qq_qr_image: '/uploads/img/config/qq-qr.png',
  qq_group_number: '123456789',
  qq_join_url: 'https://qm.qq.com/q/guatswr-fixture',
  join_question: '你是怎么入坑东方的？',
  home_links: JSON.stringify([
    { label: '东方 Project 官网', url: 'https://touhou-project.news/', icon: 'external' },
  ]),
  token_version: 'private-value',
  smtp_password: 'private-value',
})

const activity = (overrides) => ({
  id: 1,
  title: '秋季例会',
  tag: '例会',
  date: '2026-09-20',
  description: '签到、自由对战与新人答疑。',
  content: '## 例会记录\n\n本周共 12 位群友到场。\n\n![](/uploads/img/activity/1/photo.png)',
  cover_image: '/uploads/img/activity/1/cover.png',
  images: JSON.stringify([
    '/uploads/img/activity/1/photo.png',
    '/uploads/img/activity/1/photo-2.png',
  ]),
  created_at: '2026-09-20 12:00:00',
  created_by: 1,
  updated_by: null,
  status: 'published',
  deleted_at: null,
  deleted_by: null,
  ...overrides,
})

/** Raw rows as `SELECT * FROM activities` returns them, private ones included. */
export const publicActivitiesFixture = [
  activity({
    id: 3,
    title: '夏日冰祭 · 琪露诺主题日',
    tag: '主题日',
    date: '2026-08-02',
    description: '冰之妖精主题的夏日聚会，附现场照片。',
    content: '## 冰祭\n\n冷饮、猜谜与 9 号挑战赛。',
    cover_image: '/uploads/img/activity/3/cover.png',
    images: JSON.stringify(['/uploads/img/activity/3/photo.png']),
    created_at: '2026-08-02 12:00:00',
    updated_by: 2,
  }),
  activity({
    id: 2,
    title: '春季迎新 · 第一次线下聚会',
    tag: '迎新',
    date: '2026-04-11',
    description: '新群友的第一次线下见面。',
    content: '## 迎新\n\n破冰游戏与社刊分享。',
    cover_image: '/uploads/img/activity/2/cover.png',
    images: '[]',
    created_at: '2026-04-11 12:00:00',
    status: null,
  }),
  activity({
    id: 1,
    title: '秋季例会 · 冰之妖精的茶会',
    tag: '例会',
    date: '2026-09-20',
  }),
  activity({
    id: 4,
    title: '（草稿）冬季企划',
    tag: '',
    date: '2026-12-01',
    description: '',
    content: '',
    cover_image: '',
    images: '[]',
    created_at: '2026-10-01 12:00:00',
    status: 'draft',
  }),
  activity({
    id: 5,
    title: '已删除的旧活动',
    tag: '旧档',
    date: '2025-09-01',
    description: '这条记录已被软删除。',
    content: '',
    cover_image: '',
    images: 'not json',
    created_at: '2025-09-01 12:00:00',
    status: 'published',
    deleted_at: '2026-01-01 00:00:00',
    deleted_by: 1,
  }),
]

const member = (overrides) => ({
  id: 1,
  name: 'Cirno',
  role: '部长',
  bio: '最强的冰之妖精。',
  avatar: '/uploads/img/user/1.png',
  school: '桂航',
  tags: JSON.stringify(['STG', '东方']),
  sort_order: 1,
  deleted_at: null,
  deleted_by: null,
  ...overrides,
})

/** Raw `members` rows; `avatar_thumb`/`avatar_original` are added upstream. */
export const publicMembersFixture = [
  member({ id: 1 }),
  member({
    id: 2,
    name: 'Taropoi',
    role: '站长',
    bio: '负责站点维护。',
    avatar: '/uploads/img/user/2.svg',
    school: '桂电',
    tags: JSON.stringify(['建站']),
    sort_order: 2,
  }),
  member({
    id: 3,
    name: 'Reimu',
    role: '群友',
    bio: '',
    avatar: '/uploads/img/user/3.gif',
    school: '',
    tags: '[]',
    sort_order: 3,
  }),
  member({ id: 4, name: '已退出成员', role: '群友', deleted_at: '2026-02-02 00:00:00', deleted_by: 1 }),
]

export const publicHistoryFixture = [
  {
    id: 2,
    date: '2026-04-11',
    title: '春季迎新聚会',
    description: '<p>第一次线下见面，共 15 人参加。</p>',
    image: '/uploads/img/History/2026/4/11/spring.png',
    sort_order: 2,
    deleted_at: null,
  },
  {
    id: 1,
    date: '2025-09-01',
    title: '社团成立',
    description: '<p>桂航绯想天正式成立。</p>',
    image: '/uploads/img/History/2025/9/1/founding.svg',
    sort_order: 1,
    deleted_at: null,
  },
  {
    id: 3,
    date: '2025-01-01',
    title: '已删除的群史',
    description: '',
    image: '',
    sort_order: 3,
    deleted_at: '2026-03-03 00:00:00',
  },
]

const event = (overrides) => ({
  id: 101,
  type: 'STG',
  title: '秋季 STG 大会',
  status: 'published',
  content: {},
  created_by: 1,
  visitor_ip: '203.0.113.7',
  created_at: '2026-10-01 12:00:00',
  updated_at: '2026-10-02 12:00:00',
  created_by_name: 'Taropoi',
  created_by_avatar: '/uploads/img/user/1-thumb.webp',
  ...overrides,
})

/** Raw `events` rows with nested content exactly as the archived route parses it. */
export const publicEventsFixture = [
  event({
    id: 101,
    content: {
      copy: '秋季 STG 大会，欢迎新老群友参加。',
      cover: '/uploads/img/events/101/cover.png',
      time: '2026-11-11T20:00:00+08:00',
      rules: '三局两胜，禁止使用练习模式存档。',
      prizes: '冠军：东方周边礼包',
      notes: '请提前十分钟进入房间。',
      results: [
        { rank: 1, id: 'Cirno', avatar: '/uploads/img/user/1-thumb.webp' },
        { rank: 2, id: 'Taropoi', avatar: '/uploads/img/user/2-thumb.webp' },
      ],
      results_updated_at: '2026-11-12T00:30:00+08:00',
    },
  }),
  event({
    id: 102,
    type: '对赌协议',
    title: '冰之妖精 vs 巫女',
    content: {
      copy: '一局定胜负。',
      deadline: '2026-11-11T20:00:00+08:00',
      penalty: '负方请在群里唱一首歌。',
      proof_image: '/uploads/img/events/102/proof.png',
      a: { id: 'Cirno', qq: '10001', avatar: '/uploads/img/user/1-thumb.webp', goal: '十局七胜' },
      b: { id: 'Reimu', qq: '10002', avatar: '/uploads/img/user/3-thumb.webp', goal: '全胜' },
    },
  }),
  event({
    id: 103,
    type: '线下聚会',
    title: '冬季饭聚',
    status: 'ongoing',
    content: {
      cover: '/uploads/img/events/103/cover.png',
      time: '2026-12-20T17:30:00+08:00',
      location: '桂林航天工业学院北门',
      gather_type: '饭聚',
      notes: 'AA 制。',
    },
  }),
  event({
    id: 105,
    type: '悬赏令',
    title: '寻找第十位群友',
    content: {
      challenge: '在群聊中找出隐藏的第十位群友。',
      requirements: '提供有效线索。',
      reward: '东方设定集一本',
      limit: '每人一次',
      deadline: '2026-11-30T23:59:00+08:00',
      initiator: { id: 'Taropoi', qq: '10003', avatar: '/uploads/img/user/2-thumb.webp', goal: '' },
    },
  }),
  event({
    id: 104,
    title: '（草稿）春季企划',
    status: 'draft',
    content: { copy: '尚未公开的企划。' },
  }),
]

/** Raw `event_participants` rows; the public route strips visitor identity. */
export const publicEventParticipantsFixture = [
  {
    id: 1,
    event_id: 101,
    user_id: 2,
    visitor_ip: '203.0.113.7',
    common_id: 'Cirno',
    machine_sign: '⑨',
    pilot_source: '群友',
    qq: '10001',
    avatar: '/uploads/img/events/101/1.png',
    created_at: '2026-10-03 09:00:00',
    updated_at: '2026-10-03 09:00:00',
  },
  {
    id: 2,
    event_id: 101,
    user_id: null,
    visitor_ip: '198.51.100.24',
    common_id: 'Reimu',
    machine_sign: '博丽',
    pilot_source: '贴吧',
    qq: '10002',
    avatar: '/uploads/img/events/101/2.png',
    created_at: '2026-10-03 10:00:00',
    updated_at: '2026-10-03 10:00:00',
  },
  {
    id: 3,
    event_id: 101,
    user_id: null,
    visitor_ip: '192.0.2.8',
    common_id: 'Marisa',
    machine_sign: '魔理沙',
    pilot_source: '',
    qq: '',
    avatar: '',
    created_at: '2026-10-03 11:00:00',
    updated_at: '2026-10-03 11:00:00',
  },
]

const log = (overrides) => ({
  id: 1,
  username: 'Taropoi',
  action: 'UPDATE_ACTIVITY',
  details: '更新活动: 秋季例会',
  created_at: '2026-10-01T20:00:00+08:00',
  user_id: 1,
  user_avatar: '/uploads/img/user/1-thumb.webp',
  ...overrides,
})

/**
 * Raw `audit_logs` rows; `user_id` is joined upstream and must be dropped.
 *
 * Ids 5-13 are kept verbatim from archived `addLog` call sites so the public
 * projection can be tested against real frozen text: `LOGIN`/`LOGIN_LOCK`
 * embed the client IP, `BAN_IP` an address and reason, `RESET_PWD`/
 * `REFRESH_TOKEN_VERSION` admin-only values, and id 12 a credential-shaped
 * decoy inside an otherwise ordinary activity title.
 */
export const publicLogsFixture = [
  log({ id: 3, action: 'CREATE_HISTORY', details: '添加群史: 春季迎新聚会', created_at: '2026-10-03T09:30:00+08:00' }),
  log({ id: 2, username: 'Cirno', action: 'CREATE_MEMBER', details: '添加成员: Reimu', created_at: '2026-10-02T18:05:00+08:00', user_id: 2, user_avatar: '/uploads/img/user/2-thumb.webp' }),
  log({ id: 1 }),
  log({ id: 4, username: '', action: 'LOGIN', details: '', created_at: '2026-09-30T08:00:00+08:00', user_id: null, user_avatar: null }),
  log({ id: 5, username: 'Taropoi', action: 'LOGIN', details: '登录成功 (IP: 203.0.113.9)', created_at: '2026-10-04T09:00:00+08:00' }),
  log({ id: 6, username: 'Unknown', action: 'LOGIN_LOCK', details: 'IP 2001:db8::1 锁定', created_at: '2026-10-04T09:05:00+08:00', user_id: null, user_avatar: null }),
  log({ id: 7, action: 'BAN_IP', details: '封禁IP 198.51.100.7 (恶意刷接口) 至 2026-11-01T00:00:00+08:00', created_at: '2026-10-04T09:10:00+08:00' }),
  log({ id: 8, action: 'RESET_PWD', details: '重置密码: SomeAdmin', created_at: '2026-10-04T09:15:00+08:00' }),
  log({ id: 9, action: 'REFRESH_TOKEN_VERSION', details: '强制刷新登录: version=42', created_at: '2026-10-04T09:20:00+08:00' }),
  log({ id: 10, action: 'UPDATE_CONFIG', details: '修改配置: smtp_password', created_at: '2026-10-04T09:25:00+08:00' }),
  log({ id: 11, action: 'UPDATE_CONFIG', details: '修改配置: qq_group_number', created_at: '2026-10-04T09:30:00+08:00' }),
  log({
    id: 12,
    action: 'UPDATE_ACTIVITY',
    details: '更新活动: 秋季例会 (token=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJkZWNveSJ9.c2lnbmF0dXJl)',
    created_at: '2026-10-04T09:35:00+08:00',
  }),
  log({ id: 13, action: 'CREATE_ACTIVITY', details: '发布活动: 秋季例会 · 冰之妖精的茶会', created_at: '2026-10-04T09:40:00+08:00' }),
]

export const publicLogStatsFixture = [
  { username: 'Taropoi', count: 12, user_id: 1, user_avatar: '/uploads/img/user/1-thumb.webp' },
  { username: 'Cirno', count: 5, user_id: 2, user_avatar: '/uploads/img/user/2-thumb.webp' },
]

/**
 * The frozen route resolves omitted/zero timestamps to a last-seven-days window
 * instead of forwarding 0. These fixed bounds keep the fixture deterministic.
 */
export const UMAMI_DEFAULT_END_AT = 1759852800000
export const UMAMI_DEFAULT_START_AT = UMAMI_DEFAULT_END_AT - 7 * 24 * 60 * 60 * 1000

/** Frozen `/api/logs/umami` envelope, including keys the public DTO must drop. */
export const publicUmamiFixture = {
  meta: { startAt: 1759248000000, endAt: 1759852800000, unit: 'day', limit: 5, envType: 'browser' },
  summary: { pageviews: 1280, visitors: 412, visits: 530, bounces: 96, totaltime: 41200, comparison: { pageviews: 0.12 } },
  series: {
    pageviews: [{ x: '2026-10-01', y: 180 }, { x: '2026-10-02', y: 220, extra: 'dropped' }],
    visitors: [{ x: '2026-10-01', y: 60 }, { x: '2026-10-02', y: 75 }],
  },
  top: {
    pages: [{ x: '/', y: 300 }, { x: '/activities', y: 120 }],
    environments: [{ x: 'Chrome', y: 210 }, { x: 'Edge', y: 90 }],
  },
}

/** Public statuses the frozen event routes expose without authentication. */
const PUBLIC_EVENT_STATUSES = ['published', 'ongoing', 'ended', 'settled']
const SIGNUP_TYPES = ['STG', '则则']

/** Author id -> public display columns, mirroring the archived joins. */
const FIXTURE_USERS = {
  1: { username: 'Taropoi', avatar: '/uploads/img/user/1-thumb.webp' },
  2: { username: 'Cirno', avatar: '/uploads/img/user/2-thumb.webp' },
}

/** Observable fixture state for in-process tests (E2E reads the config marker). */
export const publicFixtureState = { requests: [], credentialHeaders: [] }

export const resetPublicFixtureState = () => {
  publicFixtureState.requests.length = 0
  publicFixtureState.credentialHeaders.length = 0
}

const json = (response, status, body) => {
  response.statusCode = status
  response.setHeader('content-type', 'application/json; charset=utf-8')
  response.end(JSON.stringify(body))
  return true
}

const notFound = response => json(response, 404, { message: 'Not Found' })

const parseList = (raw) => {
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

const paging = (url, defaultLimit = 20) => {
  const page = Math.max(1, Number.parseInt(url.searchParams.get('page') ?? '', 10) || 1)
  const limit = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get('limit') ?? '', 10) || defaultLimit))
  return { page, limit, offset: (page - 1) * limit }
}

const visibleActivities = () => publicActivitiesFixture
  .filter(row => row.deleted_at === null && (row.status === null || row.status === 'published'))
  .map(row => ({ ...row, images: parseList(row.images) }))

const handleActivities = (url, response) => {
  const detail = /^\/api\/activities\/(\d+)$/.exec(url.pathname)
  if (detail) {
    // Reserved fixture id: a deterministic upstream failure (with a private
    // decoy body) so public-page E2E can assert the BFF's sanitized 502 without
    // a global toggle or a race. It is never part of the published list, and
    // unknown ids keep answering 404.
    if (detail[1] === '998') {
      return json(response, 503, {
        error: 'SQLITE_ERROR: database is locked (fixture-private-detail)',
        token_version: 'private-value',
        stack: 'at /srv/guatswr/private/fixture.js:998',
      })
    }
    const row = publicActivitiesFixture.find(item => item.id === Number(detail[1]))
    if (!row || row.deleted_at !== null || row.status === 'draft') return notFound(response)
    const author = FIXTURE_USERS[row.created_by] ?? null
    const editor = FIXTURE_USERS[row.updated_by] ?? null
    // The archived detail route aliases `created_by`/`updated_by` to display names.
    return json(response, 200, {
      ...row,
      images: parseList(row.images),
      created_by: author?.username ?? null,
      created_by_avatar: author?.avatar ?? null,
      created_by_name: author?.username ?? null,
      updated_by: editor?.username ?? null,
      updated_by_avatar: editor?.avatar ?? null,
      updated_by_name: editor?.username ?? null,
    })
  }
  if (url.pathname !== '/api/activities') return false
  const { page, limit, offset } = paging(url)
  const rows = visibleActivities()
  return json(response, 200, { total: rows.length, page, limit, items: rows.slice(offset, offset + limit) })
}

const handleMembers = (url, response) => {
  if (url.pathname === '/api/members/stats/schools') {
    const counts = new Map()
    for (const row of publicMembersFixture) {
      if (row.deleted_at !== null) continue
      counts.set(row.school, (counts.get(row.school) ?? 0) + 1)
    }
    const stats = [...counts.entries()]
      .map(([school, count]) => ({ school, count }))
      .sort((a, b) => b.count - a.count || String(a.school).localeCompare(String(b.school)))
    return json(response, 200, stats)
  }
  if (url.pathname !== '/api/members') return false
  const school = url.searchParams.get('school')
  const rows = publicMembersFixture
    .filter(row => row.deleted_at === null && (!school || row.school === school))
    .map(row => ({
      ...row,
      tags: parseList(row.tags),
      avatar_thumb: thumbnailUrl(row.avatar),
      avatar_original: row.avatar,
    }))
  const list = url.searchParams.get('original') === '1'
    ? rows
    : rows.map(row => ({ ...row, avatar: row.avatar_thumb || row.avatar }))
  return json(response, 200, list)
}

const handleEvents = (url, response) => {
  const participants = /^\/api\/event\/(\d+)\/participants\/public$/.exec(url.pathname)
  if (participants) {
    const id = Number(participants[1])
    const row = publicEventsFixture.find(item => item.id === id)
    if (!row) return notFound(response)
    if (!SIGNUP_TYPES.includes(row.type)) return json(response, 400, { message: '此活动不支持报名' })
    if (!PUBLIC_EVENT_STATUSES.includes(row.status)) return json(response, 403, { message: '当前状态不允许查看名单' })
    const items = publicEventParticipantsFixture
      .filter(item => item.event_id === id)
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
      // Mirrors `toParticipantPublic`: visitor identity is never exposed.
      .map(item => ({
        id: item.id,
        common_id: item.common_id,
        qq: item.qq,
        avatar: item.avatar,
        pilot_source: item.pilot_source,
        machine_sign: item.machine_sign,
        created_at: item.created_at,
      }))
    return json(response, 200, { items })
  }
  const detail = /^\/api\/event\/(\d+)$/.exec(url.pathname)
  if (detail) {
    const row = publicEventsFixture.find(item => item.id === Number(detail[1]))
    if (!row) return notFound(response)
    if (!PUBLIC_EVENT_STATUSES.includes(row.status)) return json(response, 403, { message: '事件审核中或未公开' })
    return json(response, 200, row)
  }
  if (url.pathname !== '/api/event') return false
  const { page, limit, offset } = paging(url)
  const type = url.searchParams.get('type')
  const rows = publicEventsFixture
    .filter(row => PUBLIC_EVENT_STATUSES.includes(row.status) && (!type || row.type === type))
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
  return json(response, 200, { total: rows.length, page, limit, items: rows.slice(offset, offset + limit) })
}

const handleLogs = (url, response) => {
  if (url.pathname === '/api/logs/stats') {
    const limit = Math.min(50, Math.max(1, Number.parseInt(url.searchParams.get('limit') ?? '', 10) || 10))
    return json(response, 200, { stats: publicLogStatsFixture.slice(0, limit) })
  }
  if (url.pathname === '/api/logs/umami') {
    const positive = (value) => (value !== null && Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : null)
    const endAt = positive(url.searchParams.get('endAt')) ?? UMAMI_DEFAULT_END_AT
    const startAt = positive(url.searchParams.get('startAt')) ?? (endAt - 7 * 24 * 60 * 60 * 1000)
    return json(response, 200, {
      ...publicUmamiFixture,
      meta: {
        startAt,
        endAt,
        unit: url.searchParams.get('unit') ?? 'day',
        limit: Number(url.searchParams.get('limit') ?? 10),
        envType: url.searchParams.get('envType') ?? 'browser',
      },
    })
  }
  if (url.pathname !== '/api/logs') return false
  const { limit, offset } = paging(url)
  const username = url.searchParams.get('username')
  const action = url.searchParams.get('action')
  const rows = publicLogsFixture
    .filter(row => (!username || String(row.username).includes(username)) && (!action || String(row.action).includes(action)))
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
  return json(response, 200, { total: rows.length, logs: rows.slice(offset, offset + limit) })
}

const handleUpload = (url, response) => {
  if (!url.pathname.startsWith('/uploads/')) return false
  // Deliberate failure probe for image fallback/retry coverage.
  if (url.pathname.startsWith('/uploads/missing')) return notFound(response)
  const dot = url.pathname.lastIndexOf('.')
  const fixture = publicImageFixture(dot === -1 ? '' : url.pathname.slice(dot))
  if (!fixture) return notFound(response)
  const body = fixture.body()
  response.statusCode = 200
  response.setHeader('content-type', fixture.contentType)
  response.setHeader('content-length', String(body.length))
  response.end(body)
  return true
}

/**
 * Serve one frozen v1 public read. Returns `true` when the request was handled,
 * so the caller can answer with its own 404 for anything else.
 */
export const handlePublicFixture = (request, response) => {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1')
  publicFixtureState.requests.push({ method: request.method, path: url.pathname, search: url.search })
  for (const header of ['authorization', 'cookie', 'origin', 'x-forwarded-for']) {
    if (request.headers[header]) publicFixtureState.credentialHeaders.push({ path: url.pathname, header })
  }
  if (request.method !== 'GET') return false
  if (url.pathname === '/health') return json(response, 200, { status: 'ok' })
  if (url.pathname === '/api/config') {
    const credentials = Boolean(request.headers.authorization || request.headers.cookie)
    return json(response, 200, publicConfigFixture(credentials))
  }
  if (url.pathname === '/api/history') {
    const rows = publicHistoryFixture
      .filter(row => row.deleted_at === null)
      .sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.sort_order - b.sort_order)
    return json(response, 200, rows)
  }
  return (url.pathname.startsWith('/api/activities') && handleActivities(url, response))
    || (url.pathname.startsWith('/api/members') && handleMembers(url, response))
    || (url.pathname.startsWith('/api/event') && handleEvents(url, response))
    || (url.pathname.startsWith('/api/logs') && handleLogs(url, response))
    || handleUpload(url, response)
}
