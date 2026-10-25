import { expect,it } from 'vitest'
import { activityRevisionSummarySchema,activityRevisionRestoreSchema } from '@guatswr/shared'
import { createAdminUpstreamClient } from '../server/utils/bff-admin-upstream'
it('projects bounded revision summaries without accidentally including full content or actor internals',()=>{
  const result=activityRevisionSummarySchema.parse({id:1,activity_id:2,version:1,action:'baseline',actor_name:'editor',created_at:1,restored_from:null,title:null,source_status:null,changed_fields:'["content"]',content:'private body',actor_id:123})
  expect(result.changed_fields).toEqual(['content']);expect(result).not.toHaveProperty('content');expect(result).not.toHaveProperty('actor_id')
  expect(activityRevisionRestoreSchema.safeParse({base_revision:1,actor_id:123}).success).toBe(false)
})
it('builds revision URLs from two validated positive IDs and never accepts injected revision paths',async()=>{
  const calls:string[]=[]
  const client=createAdminUpstreamClient({origin:'http://127.0.0.1:3000',fetch:async input=>{calls.push(String(input));return new Response('{}',{headers:{'content-type':'application/json'}})}})
  await client.request({route:'activity.revert',params:{id:2,revisionId:9},body:{base_revision:12}})
  expect(calls).toEqual(['http://127.0.0.1:3000/api/activities/2/revisions/9/restore'])
  for(const revisionId of ['../1','0','9?secret=x'])await expect(client.request({route:'activity.revision',params:{id:2,revisionId}})).rejects.toThrow()
  expect(calls).toHaveLength(1)
})
