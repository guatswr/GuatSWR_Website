import fs from 'node:fs/promises'
import path from 'node:path'
import {randomBytes} from 'node:crypto'
import {Pool} from 'pg'
import {pgTypes,quote,databaseTables,postgresDigest,verifySequences,fileDigest} from './data.mjs'
import {validateTargetUrl} from './target.mjs'
import {verifyResourceReferences} from './assets.mjs'
import {runClient,verifyClientVersion} from './client.mjs'
import {createRequire} from 'node:module'
const require=createRequire(import.meta.url)
const {checkPostgresClient}=require('../../dist/src/migrations/postgres/engine.js')
const poolFor=url=>new Pool({connectionString:url,max:1,connectionTimeoutMillis:2000,statement_timeout:30000,lock_timeout:1000,types:pgTypes,options:'-c search_path=pg_catalog -c timezone=UTC'})
const identity=stat=>[stat.dev,stat.ino,stat.size,stat.mtimeNs,stat.ctimeNs].map(String).join(':')
const safePath=value=>typeof value==='string'&&value.length>0&&!value.includes('\\')&&!value.includes('\0')&&!path.isAbsolute(value)&&value.split('/').every(part=>part&&part!=='.'&&part!=='..')
async function syncJson(filename,data){const file=await fs.open(filename,'wx',0o600);try{await file.writeFile(JSON.stringify(data,null,2)+'\n');await file.sync()}finally{await file.close()}}
async function noSymlinkAncestors(filename){
 let current=path.resolve(filename)
 while(true){
  const stat=await fs.lstat(current)
  if(stat.isSymbolicLink())throw Error('RESOURCE_SYMLINK_REFUSED')
  const parent=path.dirname(current);if(parent===current)break;current=parent
 }
}
export async function resourceInventory(root){
 await noSymlinkAncestors(root)
 const files=[]
 const base=await fs.lstat(root)
 if(!base.isDirectory()||base.isSymbolicLink())throw Error('RESOURCE_ROOT_INVALID')
 async function walk(directory,relative=''){
  for(const entry of (await fs.readdir(directory,{withFileTypes:true})).sort((a,b)=>Buffer.compare(Buffer.from(a.name),Buffer.from(b.name)))){
   if(entry.name.startsWith('.asset-prepare-'))continue
   const filename=path.join(directory,entry.name),name=relative?relative+'/'+entry.name:entry.name
   if(!safePath(name))throw Error('RESOURCE_PATH_INVALID')
   const before=await fs.lstat(filename,{bigint:true})
   if(before.isSymbolicLink())throw Error('RESOURCE_SYMLINK_REFUSED')
   if(before.isDirectory())await walk(filename,name)
   else if(before.isFile()){
    const sha256=await fileDigest(filename),after=await fs.lstat(filename,{bigint:true})
    if(identity(before)!==identity(after))throw Error('RESOURCE_CHANGED')
    files.push({path:name,size:Number(before.size),sha256})
   }else throw Error('RESOURCE_TYPE_REFUSED')
  }
 }
 await walk(root);return files
}
async function copyResource(source,dest,files){
 await fs.mkdir(dest,{recursive:true,mode:0o700})
 for(const file of files){
  if(!safePath(file.path))throw Error('RESOURCE_PATH_INVALID')
  const from=path.join(source,...file.path.split('/')),to=path.join(dest,...file.path.split('/'))
  await fs.mkdir(path.dirname(to),{recursive:true,mode:0o700})
  const before=await fs.lstat(from,{bigint:true})
  if(!before.isFile()||before.isSymbolicLink())throw Error('RESOURCE_CHANGED')
  await fs.copyFile(from,to,1);await fs.chmod(to,0o600)
  if(await fileDigest(to)!==file.sha256||identity(before)!==identity(await fs.lstat(from,{bigint:true})))throw Error('RESOURCE_CHANGED')
 }
}
export async function verifyPostgresBundle(directory){
 await noSymlinkAncestors(directory)
 const root=await fs.lstat(directory)
 if(!root.isDirectory()||root.isSymbolicLink())throw Error('BUNDLE_INVALID')
 const manifestPath=path.join(directory,'receipt.json'),stat=await fs.lstat(manifestPath)
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size>64*1024*1024)throw Error('BUNDLE_MANIFEST_INVALID')
 const receipt=JSON.parse(await fs.readFile(manifestPath,'utf8'))
 if(receipt.format!=='guatswr-postgres-backup'||receipt.version!==2||receipt.database.file!=='database.dump'||!Array.isArray(receipt.resources))throw Error('BUNDLE_FORMAT_UNSUPPORTED')
 if(!receipt.resources.some(r=>r.name==='public')||new Set(receipt.resources.map(r=>r.name)).size!==receipt.resources.length)throw Error('BUNDLE_RESOURCE_INVALID')
 const dump=path.join(directory,'database.dump'),dumpStat=await fs.lstat(dump)
 if(!dumpStat.isFile()||dumpStat.isSymbolicLink()||dumpStat.size!==receipt.database.size||await fileDigest(dump)!==receipt.database.sha256)throw Error('RESTORE_CHECKSUM_MISMATCH')
 for(const resource of receipt.resources){
  if(!['public','quarantine','journals'].includes(resource.name)||!Array.isArray(resource.files))throw Error('BUNDLE_RESOURCE_INVALID')
  const actual=await resourceInventory(path.join(directory,'resources',resource.name))
  if(JSON.stringify(actual)!==JSON.stringify(resource.files))throw Error('RESTORE_RESOURCE_CHECKSUM_MISMATCH')
 }
 return receipt
}
export async function createPostgresBackup(options){
 const {databaseUrl,uploadsDir,outputDir,commandFor}=options
 if(!uploadsDir||!path.isAbsolute(outputDir)||!path.isAbsolute(uploadsDir))throw Error('ABSOLUTE_BACKUP_PATHS_REQUIRED')
 if(path.resolve(outputDir).startsWith(path.resolve(uploadsDir)+path.sep)||path.resolve(outputDir)===path.resolve(uploadsDir))throw Error('BACKUP_MUST_BE_PRIVATE')
 const tag=options.tag??new Date().toISOString().replace(/[^0-9]/g,'').slice(0,14)+'_'+randomBytes(8).toString('hex')
 if(!/^[A-Za-z0-9_-]{1,80}$/.test(tag))throw Error('BACKUP_TAG_INVALID')
 await fs.mkdir(outputDir,{recursive:true,mode:0o700});await noSymlinkAncestors(outputDir)
 const destination=path.join(outputDir,'pg_'+tag),work=path.join(outputDir,'.work-'+tag+'-'+randomBytes(8).toString('hex'))
 if(await fs.lstat(destination).catch(()=>null))throw Error('BACKUP_ALREADY_EXISTS')
 await fs.mkdir(work,{mode:0o700})
 const pool=poolFor(databaseUrl);pool.on('error',()=>{})
 let client,fence
 const fencePath=path.join(options.dataDir||path.dirname(uploadsDir),'.asset-cleanup-fence')
 try{
  fence=await fs.open(fencePath,'wx',0o600);await fence.writeFile(tag);await fence.sync()
  client=await pool.connect();client.on('error',()=>{})
  await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(57125,1)');await client.query('COMMIT')
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
  const schema=await checkPostgresClient({get:async(sql,p=[]) =>(await client.query(sql,p)).rows[0],all:async(sql,p=[]) =>(await client.query(sql,p)).rows})
  const major=Math.floor(Number((await client.query('SHOW server_version_num')).rows[0].server_version_num)/10000)
  await verifyClientVersion('pg_dump',databaseUrl,commandFor,major)
  const snapshot=(await client.query('SELECT pg_export_snapshot() AS id')).rows[0].id
  const specs=await databaseTables(client),tables={}
  for(const spec of specs)tables[spec.schema+'.'+spec.table]={...spec,...await postgresDigest(client,spec)}
  const dumpPath=path.join(work,'database.dump')
  await runClient('pg_dump',['--format=custom','--no-owner','--no-acl','--schema=main','--schema=audit','--schema=bff','--snapshot='+snapshot],{databaseUrl,outputFile:dumpPath,commandFor})
  const resources=[]
  for(const [name,source]of [['public',uploadsDir],['quarantine',options.quarantineDir],['journals',options.journalDir]]){
   if(!source)continue
   const exists=await fs.lstat(source).catch(error=>{if(error.code==='ENOENT'&&name!=='public')return null;throw error})
   const files=exists?await resourceInventory(source):[]
   await copyResource(source,path.join(work,'resources',name),files);resources.push({name,files})
  }
  const assetReferences=await verifyResourceReferences({client,publicDir:uploadsDir,files:resources.find(r=>r.name==='public').files})
  if(assetReferences.status!=='PASS')throw Error('BACKUP_RESOURCE_REFERENCE_MISSING')
  const receipt={assetReferences,format:'guatswr-postgres-backup',version:2,tag,createdAt:new Date().toISOString(),databaseDriver:'postgres',schema,
   sourceRevision:options.sourceRevision||process.env.SOURCE_REVISION||'uncommitted-review',database:{file:'database.dump',sha256:await fileDigest(dumpPath),size:(await fs.stat(dumpPath)).size},tables,resources}
  await syncJson(path.join(work,'receipt.json'),receipt)
  await verifyPostgresBundle(work)
  await client.query('COMMIT');await fs.rename(work,destination)
  return {tag,bundlePath:destination,dumpPath:path.join(destination,'database.dump'),receiptPath:path.join(destination,'receipt.json'),receipt}
 }catch(error){await client?.query('ROLLBACK').catch(()=>{});throw error}
 finally{
  client?.release();await pool.end()
  if(fence){await fence.close();if(await fs.readFile(fencePath,'utf8').catch(()=>null)===tag)await fs.unlink(fencePath)}
  const relative=path.relative(outputDir,work);if(relative.startsWith('.work-')&&!relative.includes(path.sep))await fs.rm(work,{recursive:true,force:true})
 }
}
export async function restorePostgresBackup(options){
 const {targetDatabaseUrl,runtimeRole='guatswr_app',commandFor}=options
 validateTargetUrl(targetDatabaseUrl,options.expectedDatabase)
 const directory=options.bundlePath||path.dirname(options.receiptPath||'')
 const receipt=await verifyPostgresBundle(directory)
 if(!/^[a-z][a-z0-9_]{0,62}$/.test(runtimeRole))throw Error('RESTORE_ROLE_INVALID')
 const targetRoot=options.targetDir
 if(!targetRoot||!path.isAbsolute(targetRoot)||await fs.lstat(targetRoot).catch(()=>null))throw Error('RESTORE_EMPTY_RESOURCE_TARGET_REQUIRED')
 const pool=poolFor(targetDatabaseUrl);pool.on('error',()=>{})
 let client,stage
 try{
  client=await pool.connect();client.on('error',()=>{})
  await client.query('SELECT pg_advisory_lock(57124,1)')
  const role=(await client.query("SELECT rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls OR pg_has_role($1,current_user,'MEMBER') AS elevated FROM pg_roles WHERE rolname=$1",[runtimeRole])).rows[0]
  if(!role||role.elevated)throw Error('RESTORE_ROLE_INVALID')
  const objects=(await client.query("SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND c.relkind IN ('r','v','m','S','f','p') LIMIT 1")).rows
  if(objects.length)throw Error('RESTORE_TARGET_NOT_EMPTY')
  const major=Math.floor(Number((await client.query('SHOW server_version_num')).rows[0].server_version_num)/10000)
  await verifyClientVersion('pg_restore',targetDatabaseUrl,commandFor,major)
  await noSymlinkAncestors(path.dirname(targetRoot))
  stage=await fs.mkdtemp(path.join(path.dirname(targetRoot),'.pg-restore-'))
  const resourceTargets={public:'public',quarantine:'asset-quarantine',journals:'asset-publications'}
  for(const resource of receipt.resources)await copyResource(path.join(directory,'resources',resource.name),path.join(stage,'data',resourceTargets[resource.name]),resource.files)
  await runClient('pg_restore',['--single-transaction','--exit-on-error','--no-owner','--no-acl','--dbname='+decodeURIComponent(new URL(targetDatabaseUrl).pathname.slice(1))],{databaseUrl:targetDatabaseUrl,inputFile:path.join(directory,'database.dump'),commandFor})
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ')
  await checkPostgresClient({get:async(sql,p=[]) =>(await client.query(sql,p)).rows[0],all:async(sql,p=[]) =>(await client.query(sql,p)).rows})
  const specs=await databaseTables(client)
  if(JSON.stringify(specs.map(x=>x.schema+'.'+x.table).sort())!==JSON.stringify(Object.keys(receipt.tables).sort()))throw Error('RESTORE_TABLE_SET_MISMATCH')
  for(const spec of specs){
   const actual=await postgresDigest(client,spec),expected=receipt.tables[spec.schema+'.'+spec.table]
   if(actual.rowCount!==expected.rowCount||actual.digest!==expected.digest)throw Error('RESTORE_DATA_MISMATCH')
  }
  const assetReferences=await verifyResourceReferences({client,publicDir:path.join(stage,'data','public'),files:receipt.resources.find(r=>r.name==='public').files})
  if(assetReferences.status!=='PASS')throw Error('RESTORE_RESOURCE_REFERENCE_MISSING')
  const sequences=await verifySequences(client)
  if(!sequences.passed)throw Error('RESTORE_SEQUENCE_INVALID')
  await client.query(`GRANT USAGE ON SCHEMA main,audit,bff TO ${quote(runtimeRole)}`)
  await client.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA main,audit,bff TO ${quote(runtimeRole)}`)
  await client.query(`GRANT USAGE ON ALL SEQUENCES IN SCHEMA main,audit,bff TO ${quote(runtimeRole)}`)
  await client.query(`REVOKE INSERT,UPDATE,DELETE ON main.schema_version FROM ${quote(runtimeRole)}`)
  await client.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC')
  const database=(await client.query('SELECT current_database() AS name')).rows[0].name
  await client.query(`REVOKE TEMP ON DATABASE ${quote(database)} FROM PUBLIC`)
  await client.query(`GRANT CONNECT ON DATABASE ${quote(database)} TO ${quote(runtimeRole)}`)
  await client.query('COMMIT')
  await fs.rename(stage,targetRoot);stage=undefined
  const result={restored:true,tag:receipt.tag,tablesRestored:specs.length,resourcesRestored:receipt.resources.length,sequences}
  await syncJson(path.join(targetRoot,'restored.json'),result)
  return result
 }catch(error){await client?.query('ROLLBACK').catch(()=>{});throw error}
 finally{
  if(client){await client.query('SELECT pg_advisory_unlock(57124,1)').catch(()=>{});client.release()}
  await pool.end()
  if(stage&&path.dirname(stage)===path.dirname(targetRoot)&&path.basename(stage).startsWith('.pg-restore-'))await fs.rm(stage,{recursive:true,force:true})
 }
}
export const computeFileSha256=fileDigest
