import { expect,it } from 'vitest'
import { createAdminUpstreamClient } from '../server/utils/bff-admin-upstream'
it('allows UUIDs only on the explicitly declared member-sync job routes',async()=>{
  const calls:{url:string;headers:Headers}[]=[]
  const client=createAdminUpstreamClient({origin:'http://127.0.0.1:3000',fetch:async(input,init)=>{
    calls.push({url:String(input),headers:new Headers(init?.headers)})
    return new Response('{"count":1}',{headers:{'content-type':'application/json'}})
  }})
  const id='12345678-1234-4234-8234-123456789abc'
  await client.request({route:'member-sync.apply',params:{id},body:{reason:'verified'},bearerToken:'server-only-token'})
  expect(calls[0]?.url).toBe(`http://127.0.0.1:3000/api/bot/admin/member-sync/requests/${id}/apply`)
  expect(calls[0]?.headers.get('authorization')).toBe('Bearer server-only-token')
  await expect(client.request({route:'member.update',params:{id},body:{}})).rejects.toThrow()
  for(const invalid of ['../private',`${id}/..`,`${id}?qq=12345`])await expect(client.request({route:'member-sync.job',params:{id:invalid}})).rejects.toThrow()
  expect(calls).toHaveLength(1)
})
