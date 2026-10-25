import { defineEventHandler,setResponseHeader } from 'h3'
import { useRuntimeConfig } from '#imports'
import { readMemberRevision } from '../../utils/member-revision'
export default defineEventHandler(async event=>{
  setResponseHeader(event,'Cache-Control','no-store')
  return {revision:await readMemberRevision({apiBase:useRuntimeConfig(event).apiBase})}
})
