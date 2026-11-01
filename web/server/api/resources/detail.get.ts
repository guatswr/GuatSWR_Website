import { defineEventHandler, getQuery, setResponseHeader } from 'h3'
import { useRuntimeConfig } from '#imports'
import type { ResourceDetailResponse } from '../../../shared/resources'
import { buildMockDownloadReceipt, getOpenListResourceDetail } from '../../utils/openlist'

export default defineEventHandler(async (event): Promise<ResourceDetailResponse | string> => {
  const query = getQuery(event)
  const rawPath = Array.isArray(query.path) ? query.path[0] : query.path
  const isDownload = query.download === '1' || query.download === 'true'

  const config = useRuntimeConfig(event)
  const detail = await getOpenListResourceDetail(
    config.openlist ?? {},
    typeof rawPath === 'string' ? rawPath : '/',
  )

  if (isDownload && detail.source === 'mock') {
    const safeAsciiName = detail.item.name.replace(/[^\x20-\x7e]/g, '_')
    const encodedUtf8Name = encodeURIComponent(detail.item.name)
    setResponseHeader(event, 'Content-Type', 'text/plain; charset=utf-8')
    setResponseHeader(
      event,
      'Content-Disposition',
      `attachment; filename="${safeAsciiName}.txt"; filename*=UTF-8''${encodedUtf8Name}.txt`,
    )
    return detail.textPreview ?? buildMockDownloadReceipt(detail.item)
  }

  return detail
})
