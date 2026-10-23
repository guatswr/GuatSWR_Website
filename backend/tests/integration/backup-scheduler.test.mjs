import { EventEmitter } from 'node:events'
import { createRequire } from 'node:module'
import { expect,it,vi } from 'vitest'
import { fixture,get } from '../helpers/fixture.mjs'
const require=createRequire(import.meta.url)
const childProcess=require('node:child_process')
it('manual backups use resolved isolated paths and a Shanghai daily marker on a UTC host',async()=>{
 const f=await fixture(),previousTZ=process.env.TZ
 let forwarded
 const spy=vi.spyOn(childProcess,'spawn').mockImplementation((file,args,options)=>{
  forwarded=options.env
  const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.kill=()=>true
  queueMicrotask(()=>{child.emit('exit',0,null);child.emit('close',0,null)})
  return child
 })
 vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2030-01-01T23:00:00Z'));process.env.TZ='UTC'
 try{
  const scheduler=require('../../src/utils/backupScheduler.js')({...f.context,externalServices:true})
  await scheduler.runAutoBackup('manual')
  expect(forwarded).toMatchObject({DATA_DIR:f.context.DATA_DIR,PUBLIC_DIR:f.context.PUBLIC_DIR,BACKUP_ROOT:f.context.BACKUP_ROOT,DB_PATH:f.context.dbPath,LOG_DB_PATH:f.context.logDbPath})
  expect(await get(f.db,"SELECT value FROM site_config WHERE key='backup_last_run'")).toEqual({value:'2030-01-02'})
 }finally{spy.mockRestore();vi.useRealTimers();if(previousTZ===undefined)delete process.env.TZ;else process.env.TZ=previousTZ}
})

it('schedule uses Shanghai clock boundaries and does not run again on the same club day',async()=>{
 const f=await fixture(),previousTZ=process.env.TZ
 await f.context.sql.main.run("INSERT OR REPLACE INTO site_config(key,value) VALUES('backup_enabled','1'),('backup_time','02:30')")
 let calls=0,tick
 const tracked=[]
 const spy=vi.spyOn(childProcess,'spawn').mockImplementation((file,args,options)=>{
  calls++;const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.kill=()=>true
  queueMicrotask(()=>{child.emit('exit',0,null);child.emit('close',0,null)});return child
 })
 vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2029-12-31T18:29:00Z'));process.env.TZ='UTC'
 try{
  const scheduler=require('../../src/utils/backupScheduler.js')({...f.context,externalServices:true,every:fn=>{tick=fn;return 1},track:fn=>{const pending=fn();tracked.push(pending);return pending}})
  scheduler.startBackupScheduler();await Promise.all(tracked)
  expect(calls).toBe(0)
  vi.setSystemTime(new Date('2029-12-31T18:30:00Z'));await tick()
  expect(calls).toBe(1)
  await tick();expect(calls).toBe(1)
  expect(await get(f.db,"SELECT value FROM site_config WHERE key='backup_last_run'")).toEqual({value:'2030-01-01'})
 }finally{spy.mockRestore();vi.useRealTimers();if(previousTZ===undefined)delete process.env.TZ;else process.env.TZ=previousTZ}
})

const {createBackupScheduler}=require('../../dist/src/backup/scheduler.js')
const {createBackupRunner,BackupError}=require('../../dist/src/backup/runner.js')
it('manual and scheduled runs share one in-process lock and restart respects the persisted club day',async()=>{
 const f=await fixture(),gate=Promise.withResolvers();let calls=0
 await f.context.sql.main.run("INSERT OR REPLACE INTO site_config(key,value) VALUES('backup_enabled','1'),('backup_time','00:00')")
 const make=()=>createBackupScheduler({store:f.context.sql.main,run:async()=>{calls++;await gate.promise},enabled:()=>true,audit:()=>{},report:()=>{}})
 const scheduler=make(),first=scheduler.runAutoBackup('manual')
 await expect(scheduler.runAutoBackup('manual')).rejects.toHaveProperty('code','BACKUP_BUSY')
 await scheduler.checkAndRun();expect(calls).toBe(1)
 gate.resolve();await first
 await make().checkAndRun();expect(calls).toBe(1)
 expect((await scheduler.settings()).lastError).toBe('')
})
it('execution failure persists only a fixed error code and a later success clears it',async()=>{
 const f=await fixture();let failed=true
 const scheduler=createBackupScheduler({store:f.context.sql.main,run:async()=>{if(failed)throw new BackupError('BACKUP_TIMEOUT')},enabled:()=>true,audit:()=>{},report:()=>{}})
 await expect(scheduler.runAutoBackup()).rejects.toHaveProperty('code','BACKUP_TIMEOUT')
 expect((await scheduler.settings()).lastError).toBe('BACKUP_TIMEOUT')
 failed=false;await scheduler.runAutoBackup()
 expect((await scheduler.settings()).lastError).toBe('')
})
it('backup settings update is atomic if the second setting fails',async()=>{
 const f=await fixture()
 await f.context.scheduler.updateSettings(false,'02:30')
 await new Promise((resolve,reject)=>f.db.exec("CREATE TRIGGER reject_backup_time BEFORE INSERT ON site_config WHEN NEW.key='backup_time' BEGIN SELECT RAISE(ABORT,'synthetic private failure'); END",error=>error?reject(error):resolve()))
 const {token}=await import('../helpers/fixture.mjs')
 const response=await f.http.post('/api/admin/backups/settings').set('Authorization',`Bearer ${token()}`).send({enabled:true,time:'03:00'})
 expect(response.status).toBe(500)
 expect(response.body).toEqual({message:'服务器错误'})
 expect(await f.context.scheduler.settings()).toMatchObject({enabled:false,time:'02:30'})
})
it('native backup runner bounds a hung process, output bytes and shutdown',async()=>{
 const children=[]
 const run=(code,options={})=>createBackupRunner({script:'unused',env:process.env,shutdown:new AbortController().signal,timeoutMs:'2000',command:{file:process.execPath,args:['-e',code]},trackChild:child=>children.push(child),...options})()
 try{
  await expect(run('setInterval(()=>{},1000)',{timeoutMs:'100'})).rejects.toHaveProperty('code','BACKUP_TIMEOUT')
  await expect(run("process.stdout.write('x'.repeat(1000000));setInterval(()=>{},1000)")).rejects.toHaveProperty('code','BACKUP_OUTPUT_LIMIT')
  const stop=new AbortController(),pending=expect(run('setInterval(()=>{},1000)',{shutdown:stop.signal})).rejects.toHaveProperty('code','BACKUP_CANCELLED')
  stop.abort();await pending
  await run('process.exit(0)')
 }finally{for(const child of children)if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL')}
})
it.skipIf(process.platform==='win32')('timeout kills POSIX descendants in the detached backup process group',async()=>{
 const fs=await import('node:fs/promises'),path=await import('node:path'),f=await fixture()
 const pidFile=path.join(f.root,'descendant.pid')
 const code="const c=require('node:child_process').spawn(process.execPath,['-e',\"process.on('SIGTERM',()=>{});setInterval(()=>{},1000)\"],{stdio:'ignore'});require('node:fs').writeFileSync(process.argv[1],String(c.pid));setInterval(()=>{},1000)"
 const runner=createBackupRunner({script:'unused',env:process.env,shutdown:new AbortController().signal,timeoutMs:'1000',command:{file:process.execPath,args:['-e',code,pidFile]},trackChild:()=>{}})
 await expect(runner()).rejects.toHaveProperty('code','BACKUP_TIMEOUT')
 const pid=Number(await fs.readFile(pidFile,'utf8'))
 await expect.poll(async()=>{
  try{return (await fs.readFile(`/proc/${pid}/stat`,'utf8')).split(') ')[1].split(' ')[0]==='Z'}
  catch(error){if(error.code==='ENOENT')return true;throw error}
 }).toBe(true)
})

it('external scheduler ownership does not start an application backup timer',async()=>{
 const f=await fixture();let timers=0,tasks=0
 const scheduler=require('../../src/utils/backupScheduler.js')({...f.context,env:{...f.context.env,BACKUP_SCHEDULER_OWNER:'external'},every:()=>{timers++;return 1},track:()=>{tasks++;return Promise.resolve()}})
 scheduler.startBackupScheduler();expect(timers).toBe(0);expect(tasks).toBe(0)
})
