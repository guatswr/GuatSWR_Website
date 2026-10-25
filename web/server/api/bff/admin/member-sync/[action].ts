import { z } from 'zod'
import { getMethod,getRouterParam,getQuery } from 'h3'
import { bffProtectedHandler,requireBffSession,requireBffWriteBody } from '~~/server/utils/bff-protected'
import { callAdminUpstream,projectAdminResponse,parseAdminInput,invalidateBffPublicData,adminStatusError } from '~~/server/utils/bff-admin-resources'
import { BffError } from '~~/server/utils/bff-errors'
import {
  memberSyncSettingsSchema,memberSyncSettingsResponseSchema,memberSyncJobSchema,memberSyncSummarySchema,
  memberSyncApplySchema,memberSyncProfileSchema,memberSyncProfileTaskSchema,memberSyncQqSchema,
} from '@guatswr/shared/bot'

export default bffProtectedHandler(async event=>{
  const action=getRouterParam(event,'action'),method=getMethod(event),query=getQuery(event)
  const key=`${action}:${method}`
  const permitted=['settings:GET','settings:PUT','requests:GET','requests:POST','job:GET','apply:POST','profile:PUT','profiles:GET']
  if(!permitted.includes(key))throw new BffError(404,'not_found','接口不存在')
  const normal=action==='profile'||action==='profiles'
  const session=await requireBffSession(event,{role:normal?'admin':'super_admin'})
  const body=method==='GET'?undefined:await requireBffWriteBody(event,session.runtime,64*1024)
  const params=action==='profile'?{id:parseAdminInput(z.string().regex(/^[1-9]\d*$/).transform(Number).refine(Number.isSafeInteger),query.id)}
    :action==='job'||action==='apply'?{id:parseAdminInput(z.string().uuid(),query.id)}:undefined
  const route=key==='settings:GET'?'member-sync.settings':key==='settings:PUT'?'member-sync.configure'
    :key==='requests:GET'?'member-sync.jobs':key==='requests:POST'?'member-sync.request':key==='job:GET'?'member-sync.job'
      :key==='apply:POST'?'member-sync.apply':key==='profile:PUT'?'member-sync.profile':'member-sync.profiles'
  const input=action==='settings'&&method==='PUT'?parseAdminInput(memberSyncSettingsSchema,body)
    :action==='requests'&&method==='POST'?parseAdminInput(z.object({group_id:memberSyncQqSchema}).strict(),body)
      :action==='apply'?parseAdminInput(memberSyncApplySchema,body):action==='profile'?parseAdminInput(memberSyncProfileSchema,body):undefined
  if(action==='profiles') {
    const result=await session.admin.request({route})
    if([404,503].includes(result.status))return {available:false,items:[]}
    if(result.status!==200)throw adminStatusError(result.status)
    return {available:true,...projectAdminResponse(z.object({items:z.array(memberSyncProfileTaskSchema)}),result.data)}
  }
  const pagination=action==='job'?parseAdminInput(z.object({page:z.string().regex(/^[1-9]\d*$/).transform(Number).refine(value=>value<=1000000).optional(),search:z.string().max(50).optional()}),{page:query.page,search:query.search}):undefined
  const response=await callAdminUpstream(session.admin,{route,...(params?{params}:{}),...(input!==undefined?{body:input}:{}),...(pagination?{query:pagination}:{})})
  if(method!=='GET')await invalidateBffPublicData(['members'])
  if(action==='settings')return projectAdminResponse(memberSyncSettingsResponseSchema,response.data)
  if(action==='requests'&&method==='GET')return projectAdminResponse(z.object({items:z.array(memberSyncJobSchema)}),response.data)
  if(action==='requests'||action==='job')return projectAdminResponse(memberSyncJobSchema,response.data)
  if(action==='apply')return projectAdminResponse(memberSyncSummarySchema,response.data)
  return projectAdminResponse(z.object({updated:z.literal(true)}),response.data)
})
