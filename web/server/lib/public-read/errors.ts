import { createError } from 'h3'

/** Public readers never learn whether an unpublished id exists. */
export const upstreamUnavailable = () => createError({
  statusCode: 502,
  statusMessage: 'Public data unavailable',
  message: '公开数据暂时无法加载，请稍后重试。',
})

export const publicNotFound = () => createError({
  statusCode: 404,
  statusMessage: 'Not Found',
  message: '内容不存在或未公开。',
})

export const invalidQuery = (message: string) => createError({
  statusCode: 400,
  statusMessage: 'Invalid query',
  message,
})
