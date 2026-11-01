import type { ResourceFileKind } from '#shared/resources'

// Local Vivid assets, pinned in public/icons/files/SOURCES.md.
export const RESOURCE_ICON_NAMES = [
  'image',
  'blank', 'folder', '7z', 'zip', 'rar', 'tar', 'tgz', 'gz', 'bz2', 'xz', 
  'iso', 'img', 'torrent', 'exe', 'dll', 'msi', 'bat', 'cmd', 'ps1', 'sh', 
  'apk', 'app', 'dmg', 'jar', 'bin', 'dat', 'pdf', 'txt', 'md', 'rtf', 
  'doc', 'docx', 'xls', 'xlsx', 'csv', 'ppt', 'pptx', 'epub', 'mobi', 'chm', 
  'nfo', 'log', 'ini', 'cfg', 'conf', 'config', 'json', 'xml', 'yaml', 'yml', 
  'mp3', 'flac', 'wav', 'ogg', 'aac', 'm4a', 'aiff', 'mid', 'midi', 'cue', 
  'm3u', 'm3u8', 'mp4', 'mkv', 'avi', 'mov', 'wmv', 'webm', 'flv', 'mpeg', 
  'png', 'jpg', 'jpeg', 'gif', 'bmp', 'svg', 'webp', 'ico', 'tif', 'tiff', 
  'heic', 'psd', 'ai', 'eps', 'indd', 'ttf', 'otf', 'woff', 'woff2', 'js', 
  'ts', 'jsx', 'html', 'css', 'py', 'lua', 'c', 'cpp', 'h', 'cs', 
  'java', 'go', 'sql', 'sqlite', 'db', 'gitignore', 
] as const

type IconName = typeof RESOURCE_ICON_NAMES[number]
const availableIcons = new Set<string>(RESOURCE_ICON_NAMES)
const extensionAliases: Record<string, IconName> = {
  'tar.gz': 'tgz', 'tar.bz2': 'bz2', 'tar.xz': 'xz',
  markdown: 'md', mdx: 'md', text: 'txt', odt: 'doc', ods: 'xls', odp: 'ppt',
  docm: 'doc', xlsm: 'xls', pptm: 'ppt', tsv: 'csv',
  // Game replay data is not a playable MP4; keep its file icon neutral.
  rpy: 'blank', rep: 'blank', replay: 'blank', m4v: 'mp4', mpg: 'mpeg', ogv: 'ogg', opus: 'ogg', aif: 'aiff',
  sf2: 'midi', sfz: 'midi', vgm: 'mid',
  jpeg2000: 'jpg', jpe: 'jpg', avif: 'image', apng: 'png', psb: 'psd', kra: 'image', aseprite: 'image', sketch: 'image',
  env: 'cfg', toml: 'cfg', properties: 'cfg', patch: 'cfg', reg: 'cfg',
  vue: 'html', scss: 'css', sass: 'css', less: 'css', mjs: 'js', cjs: 'js', tsx: 'jsx', pyw: 'py', cc: 'cpp', hpp: 'h',
}
const kindFallbacks: Record<ResourceFileKind, IconName> = {
  folder: 'folder', archive: 'zip', game: 'exe', audio: 'mp3', video: 'mp4',
  image: 'image', document: 'txt', code: 'cfg', other: 'blank',
}

/** Resolve only allowlisted asset names; filenames never become URL paths. */
export function resourceIconUrl(name: string, isDirectory = false, kind: ResourceFileKind = 'other'): string {
  let icon: IconName = kindFallbacks[kind]
  const filename = name.toLowerCase()
  if (isDirectory || kind === 'folder') icon = 'folder'
  else if (/\.(7z|zip|rar)\.\d{3}$/.test(filename)) icon = filename.match(/\.(7z|zip|rar)\.\d{3}$/)?.[1] as IconName
  else if (/^(readme|changelog)$/.test(filename)) icon = 'md'
  else if (/^(licen[cs]e|copying|authors)$/.test(filename)) icon = 'txt'
  else if (filename === '.env' || filename.startsWith('.env.')) icon = 'cfg'
  else {
    const parts = filename.split('.')
    for (let index = 1; index < parts.length; index++) {
      const extension = parts.slice(index).join('.')
      if (Object.hasOwn(extensionAliases, extension)) { icon = extensionAliases[extension]!; break }
      if (availableIcons.has(extension)) { icon = extension as IconName; break }
    }
  }
  return '/icons/files/vivid/' + icon + '.svg'
}
