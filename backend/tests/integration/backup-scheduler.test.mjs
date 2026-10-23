import { EventEmitter } from 'node:events'
import { createRequire } from 'node:module'
import { expect,it,vi } from 'vitest'
import { fixture,get } from '../helpers/fixture.mjs'
const require=createRequire(import.meta.url)
const childProcess=require('node:child_process')
it('manual backups use resolved isolated paths and a Shanghai daily marker on a UTC host',async()=>{
 const f=await fixture(),previousTZ=process.env.TZ
 let forwarded
 const spy=vi.spyOn(childProcess,'execFile').mockImplementation((file,args,options,done)=>{
  forwarded=options.env
  const child=new EventEmitter();child.kill=()=>true
  queueMicrotask(()=>{done(null,'','');child.emit('exit',0,null)})
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
 const spy=vi.spyOn(childProcess,'execFile').mockImplementation((file,args,options,done)=>{
  calls++;const child=new EventEmitter();child.kill=()=>true
  queueMicrotask(()=>{done(null,'','');child.emit('exit',0,null)});return child
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
