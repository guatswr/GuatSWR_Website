import path from 'node:path'
import { validateGuestContent } from '@guatswr/shared'
import { AppError } from '../errors.js'

export function assertVisitorContent(content: unknown): void {
  const error = validateGuestContent(content)
  if (error === 'too_large') throw new AppError('提交的内容过大', 'guest_content_too_large', 413)
  if (error === 'invalid') throw new AppError('提交的内容未通过校验', 'invalid_guest_content', 400)
}

interface ContentStorage {
  imageRoot: string
  moveStagedFile(url: string, directory: string, movedFiles?: Map<string, string>): Promise<string>
}
export const createEventContentPersister = ({ imageRoot, moveStagedFile }: ContentStorage) => async (content: unknown, eventId: unknown): Promise<unknown> => {
  const id = Number(eventId)
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Invalid event id')
  const targetDir = path.join(imageRoot, 'events', String(id))
  const movedUrls = new Map<string, string>()
  const movedFiles = new Map<string, string>()
  const visit = async (value: unknown): Promise<unknown> => {
    if (typeof value === 'string') {
      if (!value.startsWith('/uploads/upload/')) return value
      const filename = value.slice('/uploads/upload/'.length)
      if (!filename || filename === '.' || filename === '..' || /[\\/?#]/.test(filename)) return value
      if (!movedUrls.has(value)) movedUrls.set(value, await moveStagedFile(value, targetDir, movedFiles))
      return movedUrls.get(value)
    }
    if (Array.isArray(value)) {
      const result: unknown[] = []
      for (const item of value) result.push(await visit(item))
      return result
    }
    if (value && typeof value === 'object') {
      const entries: [string, unknown][] = []
      for (const [key, item] of Object.entries(value)) entries.push([key, await visit(item)])
      return Object.fromEntries(entries)
    }
    return value
  }
  return visit(content)
}
