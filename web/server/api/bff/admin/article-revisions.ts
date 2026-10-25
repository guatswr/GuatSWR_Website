import { z } from 'zod'
import { getMethod,getQuery } from 'h3'
import { activityRevisionListSchema,activityRevisionDetailSchema,activityRevisionRestoreSchema,activityRevisionRestoreResultSchema } from '@guatswr/shared'
import { bffProtectedHandler,requireBffSession,requireBffWriteBody } from '~~/server/utils/bff-protected'
import { callAdminUpstream,parseAdminInput,projectAdminResponse,invalidateBffPublicData } from '~~/server/utils/bff-admin-resources'
import { BffError } from '~~/server/utils/bff-errors'
const id = z.string().regex(/^[1-9]\d*$/).transform(Number).refine(Number.isSafeInteger)
export default bffProtectedHandler(async event=>{
  const method=getMethod(event),query=getQuery(event)
  if(!['GET','POST'].includes(method))throw new BffError(404,'not_found','接口不存在')
  const session=await requireBffSession(event,{role:'admin'}),activityId=parseAdminInput(id,query.id)
  const revisionId=query.revision===undefined?undefined:parseAdminInput(id,query.revision)
  if(method==='POST'){
    const body=await requireBffWriteBody(event,session.runtime,1024)
    if(!revisionId)throw new BffError(400,'invalid_request','请选择修订版本')
    const result=await callAdminUpstream(session.admin,{route:'activity.revert',params:{id:activityId,revisionId},body:parseAdminInput(activityRevisionRestoreSchema,body)})
    await invalidateBffPublicData(['activities'])
    return projectAdminResponse(activityRevisionRestoreResultSchema,result.data)
  }
  if(revisionId){
    const result=await callAdminUpstream(session.admin,{route:'activity.revision',params:{id:activityId,revisionId}})
    return projectAdminResponse(activityRevisionDetailSchema,result.data)
  }
  const page=parseAdminInput(id,query.page??'1')
  if(page>1000000)throw new BffError(400,'invalid_request','页码无效')
  const result=await callAdminUpstream(session.admin,{route:'activity.revisions',params:{id:activityId},query:{page,limit:20}})
  return projectAdminResponse(activityRevisionListSchema,result.data)
})
