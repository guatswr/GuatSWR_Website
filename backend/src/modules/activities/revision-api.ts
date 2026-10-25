import express, { type RequestHandler, type Request } from 'express'
import { activityRevisionRestoreSchema } from '@guatswr/shared'
import type { Actor } from '../actor.js'
import { AppError } from '../../errors.js'
import type { ActivityRevisions } from './revisions.js'
import { positiveId } from '../../utils/storage-boundary.js'
export function createActivityRevisionApi(revisions:ActivityRevisions,authenticate:RequestHandler,report:(error:unknown)=>void) {
  const router=express.Router()
  const number=(value:unknown,max=Number.MAX_SAFE_INTEGER)=>{if(!positiveId(value)||Number(value)>max)throw new AppError('参数无效','invalid_parameter',400);return Number(value)}
  const handle=(work:(req:Request&{user?:Actor})=>Promise<unknown>):RequestHandler=>(req,res)=>{
    res.setHeader('Cache-Control','private, no-store')
    Promise.resolve().then(()=>work(req)).then(data=>res.json(data)).catch(error=>{if(error instanceof AppError)res.status(error.status).json({message:error.message});else{report(error);res.status(500).json({message:'修订记录服务不可用'})}})
  }
  router.get('/:id/revision-log',handle(req=>revisions.publishedLog(number(req.params.id),number(req.query.page??'1',1000000),number(req.query.limit??'20',100))))
  router.get('/:id/revisions',authenticate,handle(req=>revisions.list(number(req.params.id),number(req.query.page??'1',1000000),number(req.query.limit??'20',100),req.user!)))
  router.get('/:id/revisions/:revisionId',authenticate,handle(req=>revisions.detail(number(req.params.id),number(req.params.revisionId),req.user!)))
  router.post('/:id/revisions/:revisionId/restore',authenticate,handle(req=>{
    const input=activityRevisionRestoreSchema.safeParse(req.body)
    if(!input.success)throw new AppError('参数无效','invalid_parameter',400)
    return revisions.restore(number(req.params.id),number(req.params.revisionId),input.data.base_revision,req.user!)
  }))
  return router
}
