import { defineEventHandler, setHeader } from 'h3'

export default defineEventHandler(event => {
  setHeader(event, 'Cache-Control', 'no-store')
  return { status: 'ok', service: 'guatswr-web' }
})
