import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { expect,it,onTestFinished,vi } from 'vitest'
import { createPublicDataCache } from '../server/utils/public-cache'
import { readCachedMembers,readCachedSchoolStats } from '../server/utils/public-data'
import { readMemberRevision,invalidateMemberRevisionCache } from '../server/utils/member-revision'

it('updates warm member and school caches after an out-of-band revision change without forwarding credentials',async()=>{
  let revision=1,memberReads=0,schoolReads=0
  let clock=Date.now()
  const now=vi.spyOn(Date,'now').mockImplementation(()=>clock)
  onTestFinished(()=>now.mockRestore())
  const headers:Record<string,string|string[]|undefined>[]=[]
  const server=createServer((req,res)=>{
    headers.push(req.headers);res.setHeader('Content-Type','application/json')
    const route=new URL(req.url || '/','http://127.0.0.1').pathname
    if(route==='/api/members/revision')return res.end(JSON.stringify({revision}))
    if(route==='/api/members'){memberReads++;return res.end(JSON.stringify([{id:1,name:`member-${revision}`,role:'member',avatar:'',school:`school-${revision}`,tags:'[]',sort_order:0,qq:'11111',profile_status:'pending'}]))}
    if(route==='/api/members/stats/schools'){schoolReads++;return res.end(JSON.stringify([{school:`school-${revision}`,count:1}]))}
    res.statusCode=404;res.end('{}')
  })
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve))
  onTestFinished(()=>new Promise<void>(resolve=>{server.closeAllConnections();server.close(()=>resolve())}))
  const ctx={apiBase:`http://127.0.0.1:${(server.address() as AddressInfo).port}`},cache=createPublicDataCache()
  expect((await readCachedMembers(ctx,undefined,cache))[0]?.name).toBe('member-1')
  expect((await readCachedSchoolStats(ctx,cache))[0]?.school).toBe('school-1')
  await readCachedMembers(ctx,undefined,cache);await readCachedSchoolStats(ctx,cache)
  expect([memberReads,schoolReads]).toEqual([1,1])
  revision++
  clock+=5001
  expect((await readCachedMembers(ctx,undefined,cache))[0]?.name).toBe('member-2')
  expect(JSON.stringify(await readCachedMembers(ctx,undefined,cache))).not.toContain('11111')
  expect((await readCachedSchoolStats(ctx,cache))[0]?.school).toBe('school-2')
  expect([memberReads,schoolReads]).toEqual([2,2])
  for(const item of headers){expect(item.authorization).toBeUndefined();expect(item.cookie).toBeUndefined()}
})
it('supports older backends only on 404 and rejects a corrupt revision',async()=>{
  let status=404
  const server=createServer((_req,res)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({revision:'corrupt'}))})
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve))
  onTestFinished(()=>new Promise<void>(resolve=>{server.closeAllConnections();server.close(()=>resolve())}))
  const ctx={apiBase:`http://127.0.0.1:${(server.address() as AddressInfo).port}`}
  expect(await readMemberRevision(ctx)).toBe(0)
  status=200;await expect(readMemberRevision(ctx)).rejects.toMatchObject({statusCode:502})
  status=500;await expect(readMemberRevision(ctx)).rejects.toMatchObject({statusCode:502})
  status=403;await expect(readMemberRevision(ctx)).rejects.toMatchObject({statusCode:502})
})
it('coalesces a valid zero revision and observes explicit invalidation',async()=>{
  let calls=0
  const server=createServer((_req,res)=>{calls++;res.setHeader('Content-Type','application/json');res.end('{"revision":0}')})
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve))
  onTestFinished(()=>new Promise<void>(resolve=>{invalidateMemberRevisionCache();server.closeAllConnections();server.close(()=>resolve())}))
  const ctx={apiBase:`http://127.0.0.1:${(server.address() as AddressInfo).port}`}
  expect(await Promise.all([readMemberRevision(ctx),readMemberRevision(ctx)])).toEqual([0,0])
  expect(calls).toBe(1)
  invalidateMemberRevisionCache();expect(await readMemberRevision(ctx)).toBe(0);expect(calls).toBe(2)
})
