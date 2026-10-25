import type { PublicReadContext } from '../lib/public-read/transport'
import { readUpstreamJson } from '../lib/public-read/transport'
import { upstreamUnavailable } from '../lib/public-read/errors'
import { assertUpstreamOrigin } from './upstream'

async function load(ctx:PublicReadContext):Promise<number|null> {
  try {
    const value=await readUpstreamJson(ctx,'/api/members/revision',{forbiddenIsNotFound:false})
    if(!value || typeof value!=='object' || !('revision' in value) || typeof value.revision!=='number' || !Number.isSafeInteger(value.revision) || value.revision<0)throw upstreamUnavailable()
    return value.revision
  } catch(error) {
    // A frontend can still run against an explicitly older backend. Other
    // failures never turn a known stale member cache into a successful read.
    if(error && typeof error==='object' && 'statusCode' in error && error.statusCode===404)return null
    throw error
  }
}

const entries=new Map<string,{until:number;read:Promise<number>}>()
export function invalidateMemberRevisionCache():void {entries.clear()}
export async function readMemberRevision(ctx:PublicReadContext):Promise<number> {
  let origin:string
  try{origin=assertUpstreamOrigin(ctx.apiBase).origin}catch{throw upstreamUnavailable()}
  const existing=entries.get(origin)
  if(existing && existing.until>Date.now())return existing.read
  if(entries.size>=128)entries.delete(entries.keys().next().value!)
  const pending=load(ctx)
  const read=pending.then(revision=>revision ?? 0)
  const entry={until:Date.now()+5000,read}
  entries.set(origin,entry)
  // Legacy 404s and failed reads are not cached. Concurrent valid probes share
  // a bounded five-second read, rather than charging every viewer to one peer.
  pending.then(revision=>{if(revision===null && entries.get(origin)===entry)entries.delete(origin)},()=>{if(entries.get(origin)===entry)entries.delete(origin)})
  return read
}
