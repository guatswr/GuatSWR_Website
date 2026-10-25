import { z } from 'zod'
import { defineEventHandler,getRouterParam,getQuery,createError,setResponseHeader } from 'h3'
import { useRuntimeConfig } from '#imports'
import { publishedRevisionLogSchema } from '@guatswr/shared'
import { createFixedUpstreamClient } from '~~/server/utils/bff-upstream'
const routes={log:{method:'GET',path:'/api/activities/:id/revision-log',query:['page','limit'],maxResponseBytes:128*1024}} as const
const number=z.string().regex(/^[1-9]\d*$/).transform(Number).refine(value=>Number.isSafeInteger(value)&&value<=1000000)
export default defineEventHandler(async event=>{
  setResponseHeader(event,'Cache-Control','private, no-store')
  const raw=getRouterParam(event,'id')||'',page=number.safeParse(getQuery(event).page??'1')
  if(!/^[1-9]\d{0,14}$/.test(raw))throw createError({statusCode:404,statusMessage:'Activity not found'})
  if(!page.success)throw createError({statusCode:400,statusMessage:'Invalid page'})
  const client=createFixedUpstreamClient({origin:useRuntimeConfig(event).apiBase,routes,maxResponseBytes:128*1024,maxRequestBytes:1024,timeoutMs:8000})
  try{
    // Public metadata only. Never forward the browser cookie or a website JWT.
    const response=await client.request({route:'log',params:{id:raw},query:{page:page.data,limit:20}})
    if(response.status===404)throw createError({statusCode:404,statusMessage:'Activity not found'})
    if(response.status!==200)throw new Error('upstream')
    const parsed=publishedRevisionLogSchema.safeParse(response.data)
    if(!parsed.success)throw new Error('invalid response')
    return parsed.data
  }catch(error){
    if(error && typeof error==='object' && 'statusCode' in error && error.statusCode===404)throw error
    throw createError({statusCode:502,statusMessage:'Revision log unavailable'})
  }
})
