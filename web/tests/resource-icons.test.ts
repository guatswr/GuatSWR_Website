import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { RESOURCE_ICON_NAMES, resourceIconUrl } from '../app/utils/resource-icons'

const asset = (name: string) => '/icons/files/vivid/' + name + '.svg'

describe('resource file icons', () => {
  it('distinguishes common extensions, including uppercase and non-Latin filenames', () => {
    for (const [filename, icon] of [
      ['联机整合包.7z', '7z'], ['plugins.ZIP', 'zip'], ['thprac.exe', 'exe'],
      ['指南.PDF', 'pdf'], ['例会.pptx', 'pptx'], ['歌单.flac', 'flac'],
      ['编曲.midi', 'midi'], ['活动.mp4', 'mp4'], ['海报.psd', 'psd'],
      ['封面.png', 'png'], ['settings.json', 'json'], ['config.ini', 'ini'],
    ]) expect(resourceIconUrl(filename!)).toBe(asset(icon!))
  })

  it('recognizes compound and split archive extensions', () => {
    expect(resourceIconUrl('backup.tar.gz')).toBe(asset('tgz'))
    expect(resourceIconUrl('backup.tar.xz')).toBe(asset('xz'))
    expect(resourceIconUrl('game.7z.001')).toBe(asset('7z'))
    expect(resourceIconUrl('game.zip.002')).toBe(asset('zip'))
  })

  it('handles aliases and filenames without extensions without overriding explicit formats', () => {
    expect(resourceIconUrl('replay.rpy', false, 'game')).toBe(asset('blank'))
    expect(resourceIconUrl('replay.rep')).toBe(asset('blank'))
    expect(resourceIconUrl('settings.toml')).toBe(asset('cfg'))
    expect(resourceIconUrl('.env.production')).toBe(asset('cfg'))
    expect(resourceIconUrl('README')).toBe(asset('md'))
    expect(resourceIconUrl('README.pdf')).toBe(asset('pdf'))
    expect(resourceIconUrl('LICENSE')).toBe(asset('txt'))
  })

  it('prioritizes folders and falls back by kind for unknown formats', () => {
    expect(resourceIconUrl('documents.pdf', true)).toBe(asset('folder'))
    expect(resourceIconUrl('unknown.ext')).toBe(asset('blank'))
    expect(resourceIconUrl('recording.custom', false, 'audio')).toBe(asset('mp3'))
    expect(resourceIconUrl('data', false, 'code')).toBe(asset('cfg'))
    for (const filename of ['a.constructor', 'a.__proto__', '../../unknown', 'a.toString']) {
      expect(resourceIconUrl(filename)).toBe(asset('blank'))
    }
  })

  it('ships every declared local SVG with no executable or remote content', () => {
    for (const name of RESOURCE_ICON_NAMES) {
      const svg = readFileSync(new URL('../public/icons/files/vivid/' + name + '.svg', import.meta.url), 'utf8')
      expect(svg).toMatch(/<svg[\s>]/)
      expect(svg).not.toMatch(/<(script|foreignObject|iframe|image)\b|\bon[a-z]+\s*=|(?:href|src)\s*=\s*["'](?:https?:|\/\/)/i)
    }
  })
})
