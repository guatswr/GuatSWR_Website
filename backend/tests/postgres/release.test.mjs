import {beforeAll,afterAll,it,expect} from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import {createRequire} from 'node:module'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {randomBytes} from 'node:crypto'
import {Pool} from 'pg'
import {createJiti} from 'jiti'
import {exportSqliteDatabase} from '../../../scripts/postgres/export-sqlite.mjs'
import {importToPostgres} from '../../../scripts/postgres/import-postgres.mjs'
import {verifyMigration} from '../../../scripts/postgres/verify-migration.mjs'
import {createPostgresBackup,restorePostgresBackup} from '../../../scripts/postgres/backup-postgres.mjs'
import {createSyntheticSqliteDatabase,runDualRehearsal} from '../../../scripts/postgres/rehearsal.mjs'
import {fileDigest} from '../../scripts/postgres/data.mjs'
const require=createRequire(import.meta.url),command=promisify(execFile)
const {initializePostgres}=require('../../dist/src/migrations/postgres/engine.js')
const root=path.resolve('..'),jiti=createJiti(path.join(root,'web/package.json'),{alias:{'#shared':path.join(root,'web/shared'),'~':path.join(root,'web/app')}})
const databases=[],stores=[];let scratch,admin,sessions,drafts,auth,durable
const base=new URL(process.env.PG_ADAPTER_ADMIN_URL||'')
if(base.hostname!=='127.0.0.1'||base.pathname!=='/guatswr_pg_contract_test')throw Error('ISOLATED_RELEASE_DATABASE_REQUIRED')
const commandFor=(tool,args,env)=>{
 const image=process.env.PG_RELEASE_CLIENT_IMAGE
 if(image&&!/^sha256:[a-f0-9]{64}$/.test(image))throw Error('PINNED_LOCAL_RELEASE_IMAGE_REQUIRED')
 const forwarded=Object.keys(env).filter(key=>key.startsWith('PG')).flatMap(key=>['-e',key])
 const commandArgs=image?['run','--rm','-i','--read-only','--cap-drop','ALL','--label','io.guatswr.test=postgres-release-client','--network','container:'+process.env.PG_ADAPTER_CONTAINER,...forwarded,image,tool,...args]
  :['exec','-i',...forwarded,process.env.PG_ADAPTER_CONTAINER,tool,...args]
 return {command:'docker',args:commandArgs,env:{...env,PGHOST:'127.0.0.1',PGPORT:'5432'}}
}

async function provision(kind,initialize=false){
 const name='guatswr_rehearsal_'+kind+'_'+randomBytes(6).toString('hex')
 await admin.query('CREATE DATABASE "'+name+'"');databases.push(name)
 const url=new URL(base);url.pathname='/'+name
 const runtime=new URL(process.env.PG_ADAPTER_TEST_URL);runtime.pathname='/'+name
 if(initialize)await initializePostgres(url.href,name,'guatswr_app')
 return {name,adminUrl:url.href,runtimeUrl:runtime.href,runtimeRole:'guatswr_app'}
}
async function frozenBundle(work){
 const source=await createSyntheticSqliteDatabase(path.join(work,'canonical'))
 const output=path.join(work,'legacy-backup');await fs.mkdir(output,{recursive:true})
 const script=`import importlib.util,sys,tarfile\nfrom pathlib import Path\np=Path(sys.argv[1]);s=importlib.util.spec_from_file_location('b',p);b=importlib.util.module_from_spec(s);s.loader.exec_module(b)\nmain,audit,public,out=map(Path,sys.argv[2:]);tag='20261108_000000_release';db=out/('db_'+tag+'.tar.gz')\nwith tarfile.open(db,'w:gz') as t:\n t.add(main,arcname='main.db');t.add(audit,arcname='logs.db')\ndb.with_name(db.name.removesuffix('.tar.gz')+'.sha256').write_text(b.digest(db)+'  '+db.name+'\\n')\nu=b.pack_public(public,out/'uploads',tag)\nfull=b.pack_full(db,u,u.with_name('uploads_'+tag+'.manifest.json'),out/'full',tag,'quiesced-attested','release-review')\nprint(full)`
 const result=await command(process.env.PYTHON_BIN||'python',['-c',script,path.join(root,'backend/scripts/backup_bundle.py'),source.mainDbPath,source.auditDbPath,source.publicDir,output],{env:{...process.env,BACKUP_NODE_BIN:process.execPath},timeout:30000})
 const bundlePath=result.stdout.trim().split(/\r?\n/).at(-1)
 return {bundlePath,sha256:await fileDigest(bundlePath)}
}
beforeAll(async()=>{
 scratch=await fs.mkdtemp(path.join(os.tmpdir(),'guatswr-release-tests-'))
 admin=new Pool({connectionString:base.href,max:1});admin.on('error',()=>{})
 sessions=await jiti.import(path.join(root,'web/server/utils/bff-session.ts'))
 drafts=await jiti.import(path.join(root,'web/server/utils/guest-drafts.ts'))
 durable=await jiti.import(path.join(root,'web/server/utils/durable-records.ts'))
 auth=await jiti.import(path.join(root,'web/server/utils/bff-auth-service.ts'))
})
afterAll(async()=>{
 await Promise.allSettled(stores.map(store=>Promise.resolve(store.close())))
 for(const name of databases)if(/^guatswr_rehearsal_[a-z]+_[a-f0-9]{12}$/.test(name))await admin.query('DROP DATABASE "'+name+'" WITH (FORCE)')
 await admin.end()
 if(path.dirname(scratch)!==path.resolve(os.tmpdir())||!path.basename(scratch).startsWith('guatswr-release-tests-'))throw Error('UNSAFE_RELEASE_CLEANUP')
 await fs.rm(scratch,{recursive:true,force:true})
})
const secret='release-review-session-secret-at-least-32-characters'
it('CAS prevents an in-flight identity refresh from resurrecting a logged-out session',async()=>{
 const target=await provision('cas',true)
 const a=sessions.createPostgresSessionStore({secret,connectionString:target.runtimeUrl}),b=sessions.createPostgresSessionStore({secret,connectionString:target.runtimeUrl});stores.push(a,b)
 const sid=sessions.createOpaqueSessionId(),now=Date.now()
 const record=sessions.createSessionRecord({sessionId:sid,identity:{id:1,username:'review',role:'admin',avatar:null},token:'synthetic-token',upstreamExpiresAt:now+3600000,now,tokenKey:sessions.derivePurposeKey(secret,sessions.UPSTREAM_TOKEN_PURPOSE)})
 await a.set(record)
 const ready=Promise.withResolvers(),release=Promise.withResolvers()
 const guarded={...a,replaceIfCurrent:async(previous,next)=>{ready.resolve();await release.promise;return a.replaceIfCurrent(previous,next)}}
 const service=auth.createBffAuthService({secret,store:guarded,upstream:{request:async()=>({status:200,data:{id:1,username:'review',role:'admin',avatar:'/new.png',twofa_enabled:false}})}})
 const checking=service.verify(sid),checked=expect(checking).rejects.toHaveProperty('statusCode',401)
 await ready.promise;await b.delete(record.key);release.resolve();await checked
 expect(await b.get(record.key,Date.now())).toBeUndefined()
})
it('distributed issuance, absent-key updates and expiring submission leases survive restart',async()=>{
 const target=await provision('drafts',true),key=Buffer.from('d'.repeat(32));let now=100000
 const options={namespace:'release-guests',connectionString:target.runtimeUrl,now:()=>now,submissionLeaseMs:1000}
 const a=drafts.createPostgresGuestDraftStore(key,options),b=drafts.createPostgresGuestDraftStore(key,options);stores.push(a,b)
 let created=0
 const intent={clientIp:'127.0.0.1',intentKey:'release-intent-12345678'}
 const issued=await Promise.all([a.issue(intent,async()=>++created),b.issue(intent,async()=>++created)])
 expect(created).toBe(1);expect(issued[0].id).toBe(issued[1].id);expect(issued[0].cookieId).toBe(issued[1].cookieId)
 const owner={clientIp:intent.clientIp,cookieId:issued[0].cookieId},id=issued[0].id
 expect(await a.beginSubmission(owner,id,'same')).toEqual({kind:'new'})
 expect(await b.beginSubmission(owner,id,'same')).toEqual({kind:'busy'})
 await a.close();stores.splice(stores.indexOf(a),1);now+=1001
 expect(await b.beginSubmission(owner,id,'same')).toEqual({kind:'new'})
 await b.confirmSubmission(owner,id,'same')
 expect(await b.beginSubmission(owner,id,'same')).toEqual({kind:'replay',id})
 expect(await b.owns(owner,id)).toBe(false)
})
it('distributed records serialize missing keys, enforce capacity and sweep beyond the first page',async()=>{
 const target=await provision('bounded',true)
 const make=(namespace,maxEntries)=>durable.createPostgresDurableStore({namespace,maxEntries,secret:Buffer.alloc(32,7),connectionString:target.runtimeUrl})
 const a=make('bounded',2),b=make('bounded',2),sweep=make('sweep',150);stores.push(a,b,sweep)
 await Promise.all(Array.from({length:16},(_,i)=>(i%2?a:b).atomicUpdate('counter',r=>({n:(r?.n||0)+1}))))
 expect(await a.get('counter')).toEqual({n:16})
 await b.set('second',{n:2})
 await expect(a.set('third',{n:3})).rejects.toHaveProperty('statusCode',503)
 expect(await b.size()).toBe(2)
 await Promise.all(Array.from({length:101},(_,i)=>sweep.set(String(i).padStart(3,'0'),{expired:i===100})))
 expect(await sweep.sweepBatch(100,r=>r.expired)).toBe(0)
 expect(await sweep.sweepBatch(100,r=>r.expired)).toBe(1)
 const bad=new Pool({connectionString:target.adminUrl,max:1})
 try{
  await bad.query("UPDATE bff.records SET value=$1 WHERE key='bounded:counter'",[Buffer.from('corrupt')])
  await expect(a.get('counter')).rejects.toHaveProperty('statusCode',503)
  expect(Number((await bad.query("SELECT count(*) FROM bff.records WHERE key='bounded:counter'")).rows[0].count)).toBe(1)
 }finally{await bad.end()}
})
it('host scheduler probe executes the PostgreSQL branch with a real least-privilege connection',async()=>{
 const target=await provision('scheduler',true),db=new Pool({connectionString:target.adminUrl,max:1})
 const code="import importlib.util,os,subprocess; s=importlib.util.spec_from_file_location('ops',os.environ['RELEASE_OPS']); m=importlib.util.module_from_spec(s); s.loader.exec_module(m); print(m.check_app_scheduler_conflict('isolated',runner=lambda c:subprocess.check_output([os.environ['RELEASE_NODE'],'-e',c[-1]],cwd=os.environ['RELEASE_BACKEND'],stderr=subprocess.DEVNULL)))"
 const probe=()=>command(process.env.PYTHON_BIN||'python',['-c',code],{env:{...process.env,RELEASE_OPS:path.join(root,'scripts/ops_backup.py'),RELEASE_NODE:process.execPath,RELEASE_BACKEND:path.join(root,'backend'),DATABASE_DRIVER:'postgres',POSTGRES_URL:target.runtimeUrl},timeout:10000})
 try{
  expect((await probe()).stdout.trim()).toBe('False')
  await db.query("INSERT INTO main.site_config(key,value) VALUES('backup_enabled','1')")
  expect((await probe()).stdout.trim()).toBe('True')
 }finally{await db.end()}
})
it('full canonical SQLite data imports without seed collisions and restores BYTEA, files and sequences',async()=>{
 const work=path.join(scratch,'roundtrip');await fs.mkdir(work)
 const source=await createSyntheticSqliteDatabase(work),exported=await exportSqliteDatabase(source),target=await provision('import')
 expect(Object.keys(exported.tables)).toHaveLength(30)
 await importToPostgres(exported,target.adminUrl,{runtimeRole:target.runtimeRole})
 expect((await verifyMigration(exported,target.adminUrl,{publicDir:source.publicDir})).overallStatus).toBe('PASS')
 const state=sessions.createPostgresSessionStore({secret,connectionString:target.runtimeUrl});stores.push(state)
 const sid=sessions.createOpaqueSessionId(),now=Date.now(),record=sessions.createSessionRecord({sessionId:sid,identity:{id:1,username:'owner',role:'super_admin',avatar:null},token:'retained-secret-jwt',upstreamExpiresAt:now+3600000,now,tokenKey:sessions.derivePurposeKey(secret,sessions.UPSTREAM_TOKEN_PURPOSE)})
 await state.set(record)
 const quarantine=path.join(source.dataDir,'asset-quarantine'),journals=path.join(source.dataDir,'asset-publications')
 await fs.mkdir(quarantine);await fs.mkdir(journals)
 await fs.writeFile(path.join(quarantine,'retained.bin'),Buffer.from([0,255,13]))
 await fs.writeFile(path.join(journals,'retained.json'),'{}')
 const backup=await createPostgresBackup({databaseUrl:target.adminUrl,uploadsDir:source.publicDir,dataDir:source.dataDir,quarantineDir:quarantine,journalDir:journals,outputDir:path.join(work,'native-backups'),tag:'complete',commandFor})
 expect(Object.keys(backup.receipt.tables)).toHaveLength(32)
 const recoveredTarget=await provision('restore'),resources=path.join(work,'recovered')
 const result=await restorePostgresBackup({bundlePath:backup.bundlePath,targetDatabaseUrl:recoveredTarget.adminUrl,targetDir:resources,runtimeRole:recoveredTarget.runtimeRole,commandFor})
 expect(result.tablesRestored).toBe(32)
 expect(await fs.readFile(path.join(resources,'data','asset-quarantine','retained.bin'))).toEqual(Buffer.from([0,255,13]))
 expect(await fs.readFile(path.join(resources,'data','asset-publications','retained.json'),'utf8')).toBe('{}')
 expect((await verifyMigration(exported,recoveredTarget.adminUrl,{publicDir:path.join(resources,'data','public')})).overallStatus).toBe('PASS')
 const restored=sessions.createPostgresSessionStore({secret,connectionString:recoveredTarget.runtimeUrl});stores.push(restored)
 expect(await restored.get(record.key,now)).toEqual(record)
 expect(await fs.readFile(path.join(resources,'data','public','synthetic.png'))).toEqual(await fs.readFile(path.join(source.publicDir,'synthetic.png')))
 const check=new Pool({connectionString:recoveredTarget.adminUrl,max:1})
 try{expect(Number((await check.query("INSERT INTO main.users(username) VALUES('next-user') RETURNING id")).rows[0].id)).toBeGreaterThan(1)}finally{await check.end()}
 await fs.appendFile(path.join(backup.bundlePath,'resources/public/synthetic.png'),'tampered')
 const refused=await provision('tamper')
 await expect(restorePostgresBackup({bundlePath:backup.bundlePath,targetDatabaseUrl:refused.adminUrl,targetDir:path.join(work,'tampered-restore'),commandFor})).rejects.toThrow('RESTORE_RESOURCE_CHECKSUM_MISMATCH')
})
it('normal cutover, pre-write rollback and post-write cold recovery execute real applications',async()=>{
 const report=await runDualRehearsal({provision:kind=>provision(kind),prepareSource:frozenBundle,commandFor,reportPath:path.join(root,'.tools/release-rehearsal-report.json')})
 expect(report.conclusion).toBe('ALL_REHEARSALS_VERIFIED')
 expect(report.scenarios.normal.verified).toBe('PASS')
 expect(report.scenarios.rollback.sourceHashesUnchanged).toBe(true)
 expect(report.scenarios.forwardRecovery.committedWritePreserved).toBe(true)
},120000)
