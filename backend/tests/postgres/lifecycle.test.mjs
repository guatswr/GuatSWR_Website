import { it, expect, onTestFinished } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {createRequire} from 'node:module'
import {spawnSync} from 'node:child_process'
import {createPostgresTestApplication} from '../helpers/postgres-application.mjs'
const require=createRequire(import.meta.url)
const {createApplication}=require('../../src/app.js')
async function fixture(){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'guatswr-pg-lifecycle-')),resources=[]
 const options={env:{NODE_ENV:'test',JWT_SECRET:'isolated-lifecycle-key'},paths:{data:path.join(root,'data'),public:path.join(root,'public'),backups:path.join(root,'backups')},backgroundTasks:false,externalServices:false}
 onTestFinished(async()=>{
  for(const app of resources.reverse())await app.close()
  if(path.dirname(root)!==path.resolve(os.tmpdir())||!path.basename(root).startsWith('guatswr-pg-lifecycle-'))throw Error('UNSAFE_LIFECYCLE_CLEANUP')
  await fs.rm(root,{recursive:true,force:true})
 })
 return {root,options,resources,create:async(extra={})=>{const app=await createPostgresTestApplication({...options,...extra});resources.push(app);return app}}
}
const reopenOptions=app=>({env:app.context.env,paths:{data:app.context.DATA_DIR,public:app.context.PUBLIC_DIR,backups:app.context.BACKUP_ROOT},backgroundTasks:false,externalServices:false})
it('import exposes a factory without creating a default application',()=>{
 expect(typeof createApplication).toBe('function');expect(require('../../src/app.js').app).toBeUndefined()
})
it('two applications isolate PostgreSQL databases, resources and HTTP state',async()=>{
 const f=await fixture(),a=await f.create(),b=await f.create()
 await a.context.sql.main.run("INSERT INTO site_config VALUES('isolation','a')")
 expect(await b.context.sql.main.get("SELECT value FROM site_config WHERE key='isolation'")).toBeUndefined()
 expect(a.context.env.POSTGRES_URL).not.toBe(b.context.env.POSTGRES_URL)
 for(const app of [a,b]){
  expect(app.context.databaseDriver).toBe('postgres')
  expect(await app.context.sql.audit.get('SELECT count(*) AS n FROM audit_logs')).toEqual({n:0})
  expect(app.context.timers.size).toBe(0)
  const server=await app.listen(0,'127.0.0.1')
  expect((await fetch('http://127.0.0.1:'+server.address().port+'/api/version')).status).toBe(200)
 }
 await a.close();await a.close();expect(await b.context.sql.main.get('SELECT 1 AS n')).toEqual({n:1})
})
it('missing secrets, invalid drivers and unavailable PostgreSQL fail before touching paths',async()=>{
 const {options,root}=await fixture()
 for(const env of [{},{...options.env,DATABASE_DRIVER:'sqlite'},{...options.env,POSTGRES_URL:'postgres://app:synthetic@127.0.0.1:1/missing'}])await expect(createApplication({...options,env})).rejects.toBeDefined()
 expect(await fs.readdir(root)).toEqual([])
})
it('all frozen API operations remain mounted',async()=>{
 const f=await fixture(),instance=await f.create()
 const prefixes=['/api/auth','/api/admin','/api/activities','/api/members','/api/history','/api/config','/api/upload/visitor','/api/upload','/api/logs','/api/bot','/api/event']
 const routers=instance.app.router.stack.filter(layer=>layer.name==='router'),operations=['GET /api/version']
 expect(routers).toHaveLength(prefixes.length)
 routers.forEach((layer,index)=>{
  expect(layer.matchers.some(match=>match(prefixes[index]))).toBe(true)
  for(const item of layer.handle.stack)if(item.route)for(const method of Object.keys(item.route.methods))operations.push(method.toUpperCase()+' '+prefixes[index]+(item.route.path==='/'?'':item.route.path))
 })
 const excluded=['GET /api/bot/docs/openapi.yaml','GET /api/members/revision']
 expect(operations.filter(value=>!excluded.includes(value)).sort()).toEqual(require('../../../docs/backend-modernization/evidence/baseline.json').operations.map(row=>row.operation).sort())
})
it('background jobs start after listen and close clears timers and both pools',async()=>{
 const f=await fixture(),app=await f.create({backgroundTasks:true})
 expect(app.context.timers.size).toBe(0);await app.listen(0,'127.0.0.1');expect(app.context.timers.size).toBe(5)
 await app.close();expect(app.context.timers.size).toBe(0)
 await expect(app.context.sql.main.get('SELECT 1')).rejects.toBeDefined()
 await expect(app.context.sql.audit.get('SELECT 1')).rejects.toBeDefined()
 await expect(app.listen(0,'127.0.0.1')).rejects.toThrow('closed')
})
it('listen failure starts no jobs and closing during listen releases the port',async()=>{
 const f=await fixture(),a=await f.create(),server=await a.listen(0,'127.0.0.1'),b=await f.create({backgroundTasks:true})
 await expect(b.listen(server.address().port,'127.0.0.1')).rejects.toHaveProperty('code','EADDRINUSE')
 expect(b.context.timers.size).toBe(0)
 const c=await f.create({backgroundTasks:true}),pending=c.listen(0,'127.0.0.1'),closed=c.close(),listening=await pending
 await closed;expect(listening.listening).toBe(false);expect(c.context.timers.size).toBe(0)
})
it('startup rejects schema drift without repairing it, then accepts an explicit repair',async()=>{
 const f=await fixture(),app=await f.create()
 await app.fixtureCloseApplication()
 const index=(await app.fixtureAdmin.query("SELECT pg_get_indexdef('main.idx_activities_date'::regclass) AS sql")).rows[0].sql
 await app.fixtureAdmin.query('DROP INDEX main.idx_activities_date')
 await expect(createApplication(reopenOptions(app))).rejects.toHaveProperty('code','PG_MIGRATION_SCHEMA_DRIFT')
 expect((await app.fixtureAdmin.query("SELECT to_regclass('main.idx_activities_date') AS name")).rows[0].name).toBeNull()
 await app.fixtureAdmin.query(index)
 const recovered=await createApplication(reopenOptions(app));f.resources.push(recovered)
 expect(await recovered.context.sql.main.get('SELECT count(*) AS n FROM activities')).toEqual({n:0})
})
it('test isolation prevents outgoing hooks and automatic backup',async()=>{
 const f=await fixture(),app=await f.create({env:{...f.options.env,ASTRBOT_WEBHOOK_URL:'http://127.0.0.1:1'}})
 expect(await app.context.bot.notifyMemberAdded({id:1})).toEqual({skipped:true,reason:'External services disabled'})
 await expect(app.context.scheduler.runAutoBackup()).rejects.toThrow('External services disabled')
 await expect(createApplication({env:f.options.env})).rejects.toThrow('explicit')
})
it('server executable rejects missing configuration without creating data',async()=>{
 const {options,root}=await fixture()
 const result=spawnSync(process.execPath,[path.resolve('server.js')],{cwd:root,env:{...process.env,NODE_ENV:'production',JWT_SECRET:'',POSTGRES_URL:''},encoding:'utf8',timeout:5000})
 expect(result.status).toBe(1);expect(result.stdout+result.stderr).toContain('invalid_configuration')
 await expect(fs.access(options.paths.data)).rejects.toHaveProperty('code','ENOENT')
})
