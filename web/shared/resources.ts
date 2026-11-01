/**
 * Shared contracts, path normalizers, and curated partition definitions for
 * `/resources` (桂航绯想天 · 社区资源中心 / 幻想乡书库), backed by OpenList v3 API
 * (`/api/fs/list`, `/api/fs/get`, `/api/fs/search`) with a built-in Touhou club
 * mock archive fallback when no upstream OpenList instance is configured.
 */

import type { SafeMarkdownNode } from './markdown'

export type ResourceFileKind =
  | 'folder'
  | 'archive'
  | 'game'
  | 'audio'
  | 'image'
  | 'video'
  | 'document'
  | 'code'
  | 'other'

export interface ResourceItem {
  readonly name: string
  readonly path: string
  readonly is_dir: boolean
  readonly size: number
  readonly modified: string
  readonly created?: string
  readonly sign?: string
  readonly thumb?: string
  /** OpenList v3 numeric type: 1=folder, 2=video, 3=audio, 4=doc/text, 5=image, 0=other */
  readonly type?: number
  readonly kind: ResourceFileKind
  readonly provider?: string
  readonly raw_url?: string
  readonly summary?: string
  readonly badge?: string
  readonly version?: string
  readonly sha256?: string
}

export interface ResourceDirectoryStats {
  readonly totalFiles: number
  readonly totalFolders: number
  readonly totalSize: number
}

export interface ResourceDirectoryResponse {
  readonly readmeBody?: readonly SafeMarkdownNode[]
  readonly path: string
  readonly readme: string
  readonly header: string
  readonly provider: string
  readonly total: number
  readonly write: boolean
  readonly source: 'openlist' | 'mock'
  readonly openlistPublicUrl?: string
  readonly items: readonly ResourceItem[]
  readonly stats: ResourceDirectoryStats
}

export interface ResourceDetailResponse {
  readonly item: ResourceItem
  readonly raw_url: string
  readonly readme: string
  readonly provider: string
  readonly source: 'openlist' | 'mock'
  readonly textPreview?: string
}

export interface ResourceSearchResponse {
  readonly parent: string
  readonly keywords: string
  readonly total: number
  readonly source: 'openlist' | 'mock'
  readonly items: readonly ResourceItem[]
}

export interface ResourceBreadcrumb {
  readonly name: string
  readonly path: string
}

export interface ResourcePartition {
  readonly key: string
  readonly path: string
  readonly title: string
  readonly subtitle: string
  readonly seal: string
  readonly tag: string
  readonly icon: string
  readonly color: string
  readonly darkColor: string
}

export const RESOURCE_PARTITIONS: readonly ResourcePartition[] = Object.freeze([
  {
    key: 'soku',
    path: '/非想天则联机专区',
    title: '则则联机与对战包',
    subtitle: '12.3 完整整合包、GIuRoll / SokuRoll 回滚补丁、联机大厅工具与帧数表',
    seal: '天则',
    tag: 'SOKU · 12.3',
    icon: 'game',
    color: '#0284c7',
    darkColor: '#38bdf8',
  },
  {
    key: 'stg',
    path: '/东方STG正作与补丁',
    title: 'STG 正作工具与录像',
    subtitle: 'Thprac 练习器、vpatch 低延迟补丁、Thcrap 汉化组件与社团悬赏 Replay 归档',
    seal: '弹幕',
    tag: 'SHMUP · TOOL',
    icon: 'sparkles',
    color: '#dc2626',
    darkColor: '#f87171',
  },
  {
    key: 'music',
    path: '/同人音乐与东方编曲',
    title: '幻想乡音律馆',
    subtitle: '社团同好原创编曲 Demo、线下例会精选歌单与原曲 MIDI / 乐谱工程集',
    seal: '音律',
    tag: 'DOUJIN · OST',
    icon: 'music',
    color: '#7c3aed',
    darkColor: '#a78bfa',
  },
  {
    key: 'library',
    path: '/文献设定与二创素材',
    title: '红魔馆大书库',
    subtitle: '求闻史纪考据、设定文献整理、二创绘画排版参考与社团矢量徽章素材包',
    seal: '藏书',
    tag: 'ARCHIVE · ART',
    icon: 'book',
    color: '#d97706',
    darkColor: '#fbbf24',
  },
  {
    key: 'club',
    path: '/社团档案与例会资料',
    title: '绯想天社团公开卷宗',
    subtitle: '历届例会演示文稿、东方入坑导览手册、新歓题库与线下赛事秩序册',
    seal: '社务',
    tag: 'CLUB · DOCS',
    icon: 'users',
    color: '#059669',
    darkColor: '#34d399',
  },
])

export const RESOURCE_KIND_LABELS: Readonly<Record<ResourceFileKind, string>> = Object.freeze({
  folder: '目录卷匣',
  archive: '整合压缩包',
  game: '程序与补丁',
  document: '文献与手册',
  audio: '音律与工程',
  image: '画卷与素材',
  video: '影像与录像',
  code: '配置与脚本',
  other: '其他卷宗',
})

const isControlChar = (code: number): boolean => code < 0x20 || code === 0x7f

/**
 * Normalize an incoming OpenList directory/file path into a canonical
 * leading-slash POSIX path (`/` or `/segment/subsegment`).
 * Rejects traversal (`..`), backslashes, and control characters by falling back
 * to `/` or stripping invalid segments.
 */
export function normalizeResourcePath(raw: string | null | undefined): string {
  if (!raw || typeof raw !== 'string') return '/'
  const cleaned = [...raw]
    .filter(ch => !isControlChar(ch.codePointAt(0) ?? 0))
    .join('')
    .replace(/\\/g, '/')
    .trim()
  if (!cleaned || cleaned === '/') return '/'

  const segments: string[] = []
  for (const rawSeg of cleaned.split('/')) {
    const seg = rawSeg.trim()
    if (!seg || seg === '.') continue
    if (seg === '..') return '/'
    if (/%2e%2e/i.test(seg)) return '/'
    segments.push(seg.slice(0, 128))
  }
  if (segments.length === 0) return '/'
  return `/${segments.join('/')}`
}

/** Join a parent directory path and a child item name safely. */
export function joinResourcePath(parent: string, name: string): string {
  const base = normalizeResourcePath(parent)
  const cleanName = name.replace(/^\/+|\/+$/g, '').trim()
  if (!cleanName) return base
  return base === '/' ? `/${cleanName}` : `${base}/${cleanName}`
}

/** Compute the parent directory path (`/` for root or top-level items). */
export function parentResourcePath(path: string): string {
  const normalized = normalizeResourcePath(path)
  if (normalized === '/') return '/'
  const lastSlash = normalized.lastIndexOf('/')
  if (lastSlash <= 0) return '/'
  return normalized.slice(0, lastSlash)
}

/** Build breadcrumb items from `/` down to the given directory path. */
export function resourceBreadcrumbs(path: string): ResourceBreadcrumb[] {
  const normalized = normalizeResourcePath(path)
  const crumbs: ResourceBreadcrumb[] = [{ name: '幻想乡书库', path: '/' }]
  if (normalized === '/') return crumbs

  const parts = normalized.slice(1).split('/')
  let acc = ''
  for (const part of parts) {
    acc = `${acc}/${part}`
    crumbs.push({ name: part, path: acc })
  }
  return crumbs
}

/** Deterministic file-kind classifier from file extension and OpenList numeric type. */
export function inferResourceKind(name: string, isDir: boolean, openlistType?: number): ResourceFileKind {
  if (isDir || openlistType === 1) return 'folder'
  const lower = name.toLowerCase()
  const ext = lower.includes('.') ? (lower.split('.').pop() ?? '') : ''

  if (['7z', 'zip', 'rar', 'tar', 'gz', 'xz', 'bz2', 'iso', 'dmg'].includes(ext)) return 'archive'
  if (['exe', 'dll', 'msi', 'apk', 'rep', 'rpy', 'dat', 'patch', 'thcrap'].includes(ext)) return 'game'
  if (['flac', 'mp3', 'wav', 'ogg', 'opus', 'm4a', 'mid', 'midi', 'aac'].includes(ext) || openlistType === 3) return 'audio'
  if (['png', 'jpg', 'jpeg', 'webp', 'svg', 'gif', 'bmp', 'psd', 'ai', 'ico'].includes(ext) || openlistType === 5) return 'image'
  if (['mp4', 'mkv', 'webm', 'avi', 'mov', 'flv'].includes(ext) || openlistType === 2) return 'video'
  if (['pdf', 'md', 'txt', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'epub', 'csv'].includes(ext) || openlistType === 4) return 'document'
  if (['ini', 'json', 'yaml', 'yml', 'toml', 'cfg', 'conf', 'sh', 'bat', 'ps1', 'lua', 'py', 'js', 'ts'].includes(ext)) return 'code'
  return 'other'
}

/** Deterministic human-readable byte size formatter (identical across SSR and client). */
export function formatResourceSize(bytes: number | null | undefined, isDir = false): string {
  if (isDir) return '目录'
  const value = Number(bytes ?? 0)
  if (!Number.isFinite(value) || value <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB'] as const
  let unitIndex = 0
  let scaled = value
  while (scaled >= 1024 && unitIndex < units.length - 1) {
    scaled /= 1024
    unitIndex += 1
  }
  if (unitIndex === 0) return `${Math.round(scaled)} B`
  return `${scaled >= 100 ? scaled.toFixed(0) : scaled >= 10 ? scaled.toFixed(1) : scaled.toFixed(2)} ${units[unitIndex]}`
}
