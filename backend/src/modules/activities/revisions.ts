import type { Row, SqlExecutor, SqliteStore } from '../../database/sqlite.js'
import type { Actor } from '../actor.js'
import { AppError } from '../../errors.js'
import { authorizeSecurityActor } from '../../security/authorize.js'
import { enqueueSecurityAudit } from '../../security/audit-outbox.js'
import { guardAssetReferences, type AssetPublication } from '../../storage/publication.js'
import { normalizeActivityImages } from './projection.js'

const fields = ['title','tag','date','description','content','cover_image','images'] as const
const summary = 'id,activity_id,version,action,actor_name,created_at,restored_from,title,source_status,changed_fields'
type Snapshot = Row & { id:number; activity_id:number; version:number; title:string|null; tag:string|null; date:string|null; description:string|null; content:string|null; cover_image:string|null; images:string|null; source_status:string|null }
const images = (row: Row) => ({ ...row, images: normalizeActivityImages(row.images) })
export function createActivityRevisions(options: { store:SqliteStore; ready:boolean; publication?:AssetPublication; committed():void }) {
  const {store} = options
  const ready = () => { if (!options.ready) throw new AppError('请先升级文章修订数据库至 main7','revision_migration_required',503) }
  const actorCheck = async(tx:SqlExecutor,actor:Actor) => {
    const current=await authorizeSecurityActor(tx,actor)
    if (!['admin','super_admin'].includes(String(current.role))) throw new AppError('权限不足','forbidden',403)
    return current
  }
  const article = async(tx:SqlExecutor,id:number,actor:Actor) => {
    const row=await tx.get('SELECT * FROM activities WHERE id=?',[id])
    if (!row || (row.deleted_at && actor.role!=='super_admin')) throw new AppError('文章不存在','not_found',404)
    return row
  }
  const latest = (tx:SqlExecutor,id:number) => tx.get<Snapshot>('SELECT * FROM activity_revisions WHERE activity_id=? ORDER BY version DESC LIMIT 1',[id])
  const record = async(tx:SqlExecutor,id:number,actor:Actor,action:'baseline'|'create'|'update'|'restore',restoredFrom:number|null=null) => {
    const row=await tx.get('SELECT * FROM activities WHERE id=?',[id])
    if (!row) return 0
    const previous=await latest(tx,id)
    // A provisional draft from an interrupted create was never committed as
    // an article version and can still contain temporary upload URLs.
    if (!previous && action==='baseline' && row.status==='draft') return 0
    const changed=fields.filter(field=>(previous?.[field]??null)!==(row[field]??null))
    if (previous && !changed.length && previous.source_status===(row.status??null) && action!=='restore') return previous.id
    const result=await tx.run(`INSERT INTO activity_revisions(activity_id,version,action,actor_id,actor_name,created_at,restored_from,title,tag,date,description,content,cover_image,images,source_status,changed_fields)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,[id,(previous?.version||0)+1,action,actor.id,actor.username,Date.now(),restoredFrom,...fields.map(field=>row[field]===undefined?null:row[field] as string|null),row.status===undefined?null:row.status as string|null,JSON.stringify(changed)])
    return result.lastID
  }
  const transaction = <T>(work:(tx:SqlExecutor)=>Promise<T>,tx?:SqlExecutor) => tx?work(tx):store.transaction(work)
  return {
    ready:options.ready, record, transaction,
    async publishedLog(id:number,page:number,limit:number) {
      return store.transaction(async tx=>{
        const row=await tx.get('SELECT id,status,deleted_at FROM activities WHERE id=?',[id])
        if(!row || row.deleted_at || (row.status!==null && row.status!=='published'))throw new AppError('文章不存在','not_found',404)
        if(!options.ready)return {available:false,page,limit,total:0,items:[]}
        const filter="activity_id=? AND (source_status='published' OR source_status IS NULL)"
        const total=(await tx.get<{n:number}>(`SELECT COUNT(*) AS n FROM activity_revisions WHERE ${filter}`,[id]))?.n||0
        const offset=(page-1)*limit
        const rows=await tx.all(`SELECT action,actor_name,created_at,changed_fields FROM activity_revisions WHERE ${filter} ORDER BY version DESC LIMIT ? OFFSET ?`,[id,limit,offset])
        return {available:true,page,limit,total,items:rows.map((item,index)=>({sequence:total-offset-index,...item}))}
      })
    },
    mutate<T>(id:number,actor:Actor,action:'create'|'update',work:(tx:SqlExecutor)=>Promise<T>,tx?:SqlExecutor) {
      return transaction(async executor=>{
        await actorCheck(executor,actor)
        if (action==='update') await record(executor,id,actor,'baseline')
        const result=await work(executor)
        await record(executor,id,actor,action)
        return result
      },tx)
    },
    async list(id:number,page:number,limit:number,actor:Actor) {
      ready()
      return store.transaction(async tx=>{
        await actorCheck(tx,actor);await article(tx,id,actor)
        const total=(await tx.get<{n:number}>('SELECT COUNT(*) AS n FROM activity_revisions WHERE activity_id=?',[id]))?.n||0
        const current=(await tx.get<{id:number}>('SELECT id FROM activity_revisions WHERE activity_id=? ORDER BY version DESC LIMIT 1',[id]))?.id||0
        return {page,limit,total,current_revision:current,items:await tx.all(`SELECT ${summary} FROM activity_revisions WHERE activity_id=? ORDER BY version DESC LIMIT ? OFFSET ?`,[id,limit,(page-1)*limit])}
      })
    },
    async detail(id:number,revision:number,actor:Actor) {
      ready()
      return store.transaction(async tx=>{
        await actorCheck(tx,actor);await article(tx,id,actor)
        const row=await tx.get<Snapshot>('SELECT * FROM activity_revisions WHERE activity_id=? AND id=?',[id,revision])
        if (!row) throw new AppError('修订记录不存在','not_found',404)
        return images(row)
      })
    },
    async restore(id:number,revision:number,base:number,actor:Actor) {
      ready()
      const saved=await store.transaction(async tx=>{
        await actorCheck(tx,actor);await article(tx,id,actor)
        const snapshot=await tx.get<Snapshot>('SELECT * FROM activity_revisions WHERE activity_id=? AND id=?',[id,revision])
        if (!snapshot) throw new AppError('修订记录不存在','not_found',404)
        return snapshot
      })
      const result=await guardAssetReferences(options.publication,fields.map(field=>saved[field]),tx=>transaction(async executor=>{
        await actorCheck(executor,actor)
        const row=await article(executor,id,actor)
        if (row.deleted_at) throw new AppError('请先从回收站恢复文章','article_deleted',409)
        const current=await latest(executor,id)
        if (!current || current.id!==base) throw new AppError('文章已有新修订，请刷新后重新确认','revision_conflict',409)
        if (fields.every(field=>(saved[field]??null)===(row[field]??null))) return {revision_id:current.id,restored:false}
        await record(executor,id,actor,'baseline')
        await executor.run('UPDATE activities SET title=?,tag=?,date=?,description=?,content=?,cover_image=?,images=?,updated_by=? WHERE id=?',[...fields.map(field=>saved[field]??null),actor.id,id])
        const revisionId=await record(executor,id,actor,'restore',revision)
        await enqueueSecurityAudit(executor,actor.username,'RESTORE_ACTIVITY_REVISION',`article=${id}; revision=${revision}; new_revision=${revisionId}`)
        return {revision_id:revisionId,restored:true}
      },tx))
      try { options.committed() } catch { /* The durable audit intent already committed. */ }
      return result
    },
  }
}
export type ActivityRevisions = ReturnType<typeof createActivityRevisions>
