import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {createRequire} from 'node:module'
import {randomBytes} from 'node:crypto'
import {DatabaseSync} from 'node:sqlite'
import {Pool} from 'pg'
import {prepareVerifiedSource} from './prepare-source.mjs'
import {exportSqliteDatabase} from './export-sqlite.mjs'
import {importToPostgres} from './import-postgres.mjs'
import {verifyMigration} from './verify-migration.mjs'
import {createPostgresBackup,restorePostgresBackup} from './backup-postgres.mjs'
import {fileDigest} from '../../backend/scripts/postgres/data.mjs'
const require=createRequire(import.meta.url),root=fileURLToPath(new URL('../../',import.meta.url))
const {initializeDatabases}=require('../../backend/scripts/initialize-databases.cjs'),{createApplication}=require('../../backend/src/app.js')
const bcrypt=require('bcryptjs')
export const REHEARSAL_SECRET='synthetic-rehearsal-jwt-secret-not-production'
export async function createSyntheticSqliteDatabase(baseDir){
 const data=path.join(baseDir,'data'),publicDir=path.join(data,'public'),backups=path.join(baseDir,'backups')
 await initializeDatabases({}, {data,public:publicDir,backups});await fs.mkdir(publicDir,{recursive:true})
 const mainDbPath=path.join(data,'guatswr_web_main.db'),auditDbPath=path.join(data,'guatswr_web_logs.db')
 const main=new DatabaseSync(mainDbPath),audit=new DatabaseSync(auditDbPath),now=Date.now()
 try{
  main.exec('PRAGMA foreign_keys=ON; BEGIN')
  main.prepare("INSERT INTO users(id,username,password,role,avatar) VALUES(1,'owner',?,'super_admin','/uploads/synthetic.png')").run(bcrypt.hashSync('rehearsal-password',10))
  main.exec(`INSERT INTO site_config VALUES('banner_text','rehearsal'); INSERT INTO banned_ips(ip,reason,created_at) VALUES('192.0.2.1','synthetic',1);
   INSERT INTO login_attempts(ip) VALUES('192.0.2.2');
   INSERT INTO history(id,date,title,image) VALUES(1,'2020-02-29','synthetic history','/uploads/synthetic.png');
   INSERT INTO members(id,name,role,avatar,qq) VALUES(1,'synthetic member','member','/uploads/synthetic.png','12345');
   INSERT INTO activities(id,title,date,content,images,created_by) VALUES(1,'synthetic article','2025-01-01','raw TEXT preserved','[]',1);
   INSERT INTO events(id,type,title,status,created_by) VALUES(1,'STG','synthetic event','published',1),(2,'STG','pending event','pending',1);
   INSERT INTO bot_credentials(id,name,secret_hash,scopes,groups_json,created_by,created_at) VALUES('cred','synthetic','synthetic-hash','["members:sync"]','["1000"]',1,1);
   INSERT INTO bot_credential_secrets VALUES('cred','synthetic encrypted value');
   INSERT INTO bot_notifications VALUES('notification','synthetic-dedupe','event.updated','{}',1);
   INSERT INTO member_sync_groups(group_id,generation) VALUES('1000',1);
   INSERT INTO security_audit_outbox(id,username,action,details) VALUES('audit-intent','owner','SYNTHETIC','retained source intent');
   INSERT INTO asset_cleanup_jobs(id,url,identity,state) VALUES('11111111-1111-1111-1111-111111111111','/uploads/synthetic.png','0:0:0:0:0','retained');
   INSERT INTO asset_references(source_type,source_id,source_field,asset_path,family_key) VALUES('users','1','avatar','/synthetic/source/path','/synthetic/source/family');
   INSERT INTO activity_revisions(activity_id,version,action,actor_name,created_at) VALUES(1,1,'baseline','owner',1);
   INSERT INTO bot_identities(id,user_id,credential_id,qq,created_at) VALUES('identity',1,'cred','12345',1);
   INSERT INTO bot_subscriptions(id,credential_id,group_id,event_name) VALUES('subscription','cred','1000','event.updated');
   INSERT INTO event_participants(event_id,user_id,common_id,qq,avatar,bot_identity_id) VALUES(1,1,'synthetic pilot','12345','/uploads/synthetic.png','identity');
   INSERT INTO event_submissions VALUES(2,'synthetic-capability','synthetic-digest','{}',1);
   INSERT INTO member_group_memberships(qq,group_id,group_card,nickname,group_role,last_seen_generation) VALUES('12345','1000','synthetic','synthetic','member',1);
   INSERT INTO member_profile_tasks(member_id,created_at,notification_id) VALUES(1,1,'notification');
   INSERT INTO member_sync_requests(id,group_id,credential_id,config_revision,generation,status,created_at,expires_at,batch_count,member_count) VALUES('request','1000','cred',1,1,'succeeded',1,2,1,1);
   INSERT INTO bot_deliveries(id,notification_id,credential_id,subscription_id,group_id,status,next_attempt_at) VALUES('delivery','notification','cred','subscription','1000','sent',1);
   INSERT INTO bot_link_codes VALUES('code-hash','identity',2);
   INSERT INTO member_sync_avatars(id,request_id,qq,url,checksum) VALUES('avatar','request','12345','/uploads/synthetic.png','synthetic-checksum');
   INSERT INTO member_sync_batches VALUES('request',1,'synthetic-checksum','[]',0);
   COMMIT; PRAGMA wal_checkpoint(TRUNCATE)`)
  audit.exec("INSERT INTO audit_logs(username,action,details) VALUES('owner','SYNTHETIC','preserved audit'); PRAGMA wal_checkpoint(TRUNCATE)")
 }finally{main.close();audit.close()}
 await fs.writeFile(path.join(publicDir,'synthetic.png'),Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==','base64'))
 return {mainDbPath,auditDbPath,dataDir:data,publicDir,backups,now}
}
async function call(origin,url,options={}){
 const response=await fetch(origin+url,{...options,signal:AbortSignal.timeout(10000)})
 const data=await response.json()
 if(response.status!==200)throw Error('REHEARSAL_HTTP_FAILED: '+url+' '+response.status)
 return data
}
async function startCandidate(databaseUrl,paths,driver='postgres'){
 const app=await createApplication({env:{NODE_ENV:'test',DATABASE_DRIVER:driver,POSTGRES_URL:databaseUrl,JWT_SECRET:REHEARSAL_SECRET,BFF_BRIDGE_SECRET:'synthetic-bridge-secret-32-characters'},paths,backgroundTasks:false,externalServices:false})
 const server=await app.listen(0,'127.0.0.1'),origin='http://127.0.0.1:'+server.address().port
 return {app,origin}
}
export async function runDualRehearsal(options={}){
 if(!options.provision||!options.prepareSource)throw Error('REAL_REHEARSAL_PROVISIONER_REQUIRED')
 const work=await fs.mkdtemp(path.join(os.tmpdir(),'guatswr-rehearsal-')),active=[]
 const report={format:'guatswr-real-rehearsal',startedAt:new Date().toISOString(),conclusion:'FAIL',scenarios:{}}
 try{
  const source=await options.prepareSource(work),snapshot=await prepareVerifiedSource({bundlePath:source.bundlePath,sha256:source.sha256,targetDir:path.join(work,'verified-source')})
  const exported=await exportSqliteDatabase({mainDbPath:path.join(snapshot.dataDir,'guatswr_web_main.db'),auditDbPath:path.join(snapshot.dataDir,'guatswr_web_logs.db')})
  if(Object.values(exported.tables).some(t=>!t.present||!t.rowCount))throw Error('REHEARSAL_FULL_DATASET_REQUIRED')
  const target=await options.provision('normal'),start=Date.now()
  const imported=await importToPostgres(exported,target.adminUrl,{runtimeRole:target.runtimeRole})
  const verified=await verifyMigration(exported,target.adminUrl,{publicDir:snapshot.publicDir})
  if(verified.overallStatus!=='PASS')throw Error('REHEARSAL_IMPORT_NOT_VERIFIED')
  const candidateRoot=path.join(work,'candidate');await fs.mkdir(candidateRoot)
  const paths={data:path.join(candidateRoot,'data'),public:path.join(candidateRoot,'public'),backups:path.join(candidateRoot,'backups')}
  await fs.cp(snapshot.publicDir,paths.public,{recursive:true})
  const candidate=await startCandidate(target.runtimeUrl,paths);active.push(candidate.app)
  const ready=await call(candidate.origin,'/api/health/ready'),config=await call(candidate.origin,'/api/config')
  if(ready.status!=='ready'||config.banner_text!=='rehearsal')throw Error('REHEARSAL_READ_PROBE_FAILED')
  const logged=await call(candidate.origin,'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'owner',password:'rehearsal-password'})})
  const created=await call(candidate.origin,'/api/activities',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+logged.token},body:JSON.stringify({title:'post-cutover-write',tag:'STG',date:'2026-11-08',content:'actual committed PG write',images:[]})})
  if(!Number.isSafeInteger(created.id)||created.id<=1)throw Error('REHEARSAL_IDENTITY_FAILED')
  report.scenarios.normal={target:target.name,tables:Object.keys(imported.tables).length,verified:verified.overallStatus,health:ready.status,committedActivityId:created.id,durationMs:Date.now()-start}
  const rollbackTarget=await options.provision('rollback');let aborted=false
  try{await importToPostgres(exported,rollbackTarget.adminUrl,{runtimeRole:rollbackTarget.runtimeRole,beforeCommit:()=>{throw Error('INJECTED_IMPORT_ABORT')}})}catch(error){if(error.message!=='INJECTED_IMPORT_ABORT')throw error;aborted=true}
  const rollbackPool=new Pool({connectionString:rollbackTarget.adminUrl,max:1})
  try{if((await rollbackPool.query('SELECT count(*)::integer AS n FROM main.users')).rows[0].n!==0)throw Error('REHEARSAL_ROLLBACK_DIRTY')}finally{await rollbackPool.end()}
  const rollbackCopy=await prepareVerifiedSource({bundlePath:source.bundlePath,sha256:source.sha256,targetDir:path.join(work,'rollback-source')})
  const old=await startCandidate(undefined,{data:rollbackCopy.dataDir,public:rollbackCopy.publicDir,backups:path.join(work,'rollback-backups')},'sqlite');active.push(old.app)
  if((await call(old.origin,'/api/health/ready')).status!=='ready')throw Error('SQLITE_ROLLBACK_PROBE_FAILED')
  const again=await exportSqliteDatabase({mainDbPath:path.join(snapshot.dataDir,'guatswr_web_main.db'),auditDbPath:path.join(snapshot.dataDir,'guatswr_web_logs.db')})
  if(JSON.stringify(again.sourceHashes)!==JSON.stringify(exported.sourceHashes))throw Error('REHEARSAL_SOURCE_MODIFIED')
  report.scenarios.rollback={target:rollbackTarget.name,transactionAborted:aborted,sqliteReady:true,sourceHashesUnchanged:true}
  const backup=await createPostgresBackup({databaseUrl:target.adminUrl,uploadsDir:paths.public,dataDir:paths.data,quarantineDir:path.join(paths.data,'asset-quarantine'),journalDir:path.join(paths.data,'asset-publications'),outputDir:path.join(work,'pg-backups'),commandFor:options.commandFor,tag:'rehearsal'})
  const restoredTarget=await options.provision('restore')
  const recovered=path.join(work,'recovered')
  const restored=await restorePostgresBackup({bundlePath:backup.bundlePath,targetDatabaseUrl:restoredTarget.adminUrl,targetDir:recovered,runtimeRole:restoredTarget.runtimeRole,commandFor:options.commandFor})
  const fresh=await startCandidate(restoredTarget.runtimeUrl,{data:path.join(recovered,'data'),public:path.join(recovered,'data','public'),backups:path.join(work,'recovered-backups')});active.push(fresh.app)
  await call(fresh.origin,'/api/health/ready')
  const login=await call(fresh.origin,'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'owner',password:'rehearsal-password'})})
  const article=await call(fresh.origin,'/api/activities/'+created.id)
  if(article.title!=='post-cutover-write')throw Error('FORWARD_RECOVERY_LOST_WRITE')
  const image=await fetch(fresh.origin+'/uploads/synthetic.png');if(image.status!==200)throw Error('RECOVERED_FILE_MISSING')
  if(Buffer.from(await image.arrayBuffer()).toString('base64')!==(await fs.readFile(path.join(snapshot.publicDir,'synthetic.png'))).toString('base64'))throw Error('RECOVERED_FILE_CORRUPT')
  const next=await call(fresh.origin,'/api/activities',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+login.token},body:JSON.stringify({title:'post-recovery-write',tag:'STG',date:'2026-11-08',content:'safe identity after recovery',images:[]})})
  if(next.id<=created.id)throw Error('RESTORED_IDENTITY_COLLISION')
  report.scenarios.forwardRecovery={target:restoredTarget.name,restored:restored.restored,committedWritePreserved:true,recoveredActivityId:created.id,nextActivityId:next.id,tables:restored.tablesRestored,filesVerified:true}
  report.completedAt=new Date().toISOString();report.conclusion='ALL_REHEARSALS_VERIFIED'
  return report
 }finally{
  await Promise.allSettled(active.reverse().map(app=>app.close()))
  if(options.reportPath)await fs.writeFile(options.reportPath,JSON.stringify(report,null,2)+'\n',{mode:0o600})
  if(path.dirname(work)!==path.resolve(os.tmpdir())||!path.basename(work).startsWith('guatswr-rehearsal-'))throw Error('UNSAFE_REHEARSAL_CLEANUP')
  await fs.rm(work,{recursive:true,force:true})
 }
}
