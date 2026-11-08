import {it,expect} from 'vitest'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {randomBytes} from 'node:crypto'
import {createRequire} from 'node:module'
import {Pool} from 'pg'
const command=promisify(execFile),require=createRequire(import.meta.url)
const {initializePostgres}=require('../../dist/src/migrations/postgres/engine.js')
const image=process.env.PG_RELEASE_CLIENT_IMAGE,pgContainer=process.env.PG_ADAPTER_CONTAINER
if(!/^sha256:[a-f0-9]{64}$/.test(image||'')||!/^([a-f0-9]{64})$/.test(pgContainer||''))throw Error('PINNED_ISOLATED_PACKAGED_TEST_REQUIRED')
const base=new URL(process.env.PG_ADAPTER_ADMIN_URL||'')
if(base.hostname!=='127.0.0.1'||base.pathname!=='/guatswr_pg_contract_test')throw Error('ISOLATED_PACKAGED_DATABASE_REQUIRED')
const origin=process.env.PG_PACKAGED_HTTP_ORIGIN
if(new URL(origin).hostname!=='127.0.0.1')throw Error('LOOPBACK_HTTP_REQUIRED')
const label='guatswr-pg-packaged',tag=randomBytes(8).toString('hex')
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==','base64')
const local=url=>{const value=new URL(url);value.hostname='127.0.0.1';value.port='5432';return value.href}
it('clean packaged non-root backend backs up, cold-restores and restarts with data, files and safe sequences',async()=>{
 const admin=new Pool({connectionString:base.href,max:1});admin.on('error',()=>{})
 const containers=[],volumes=[],databases=[]
 const docker=async(args,env={})=>(await command('docker',args,{env:{...process.env,...env},timeout:120000,maxBuffer:1048576})).stdout.trim()
 const createVolume=async(kind)=>{const name='guatswr-pg-packaged-'+tag+'-'+kind;await docker(['volume','create','--label','io.guatswr.test='+label,name]);volumes.push(name);return name}
 const provision=async(kind,init)=>{
  const name='guatswr_restore_'+kind+'_'+tag;await admin.query('CREATE DATABASE "'+name+'"');databases.push(name)
  const owner=new URL(base);owner.pathname='/'+name
  const runtime=new URL(process.env.PG_ADAPTER_TEST_URL);runtime.pathname='/'+name
  if(init)await initializePostgres(owner.href,name,'guatswr_app')
  return {name,owner:owner.href,runtime:runtime.href}
 }
 let backupVolume
 const run=async(dataVolume,env,args,detached=false)=>{
  const forwarded=Object.keys(env).flatMap(key=>['-e',key])
  const result=await docker(['run',...(detached?['--detach']:['--rm']),'--read-only','--cap-drop','ALL','--security-opt','no-new-privileges:true','--tmpfs','/tmp:rw,size=64m,mode=1777','--label','io.guatswr.test='+label,'--network','container:'+pgContainer,
   '--mount','type=volume,source='+dataVolume+',target=/app/data','--mount','type=volume,source='+backupVolume+',target=/app/backups',...forwarded,image,...args],env)
  if(detached){if(!/^[a-f0-9]{64}$/.test(result))throw Error('CONTAINER_ID_REQUIRED');containers.push(result)}
  return result
 }
 const serve=async(data,target)=>{
  const env={NODE_ENV:'production',JWT_SECRET:'isolated-packaged-jwt-secret',BFF_BRIDGE_SECRET:'isolated-packaged-bridge-secret-32-characters',DATABASE_DRIVER:'postgres',POSTGRES_URL:local(target.runtime),BACKUP_SCHEDULER_OWNER:'external',PORT:'3000',BIND_HOST:'0.0.0.0',DATA_DIR:data,PUBLIC_DIR:data+'/public'}
  return env
 }
 const ready=async()=>{
  let error
  for(let i=0;i<100;i++){
   try{const r=await fetch(origin+'/api/health/ready',{signal:AbortSignal.timeout(1000)});if(r.status===200)return}catch(e){error=e}
   await new Promise(resolve=>setTimeout(resolve,200))
  }
  throw Error('PACKAGED_READINESS_FAILED',{cause:error})
 }
 const call=async(url,options={})=>{const r=await fetch(origin+url,{...options,signal:AbortSignal.timeout(10000)});expect(r.status).toBe(200);return r.json()}
 const login=()=>call('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'owner',password:'synthetic-packaged-password'})})
 const write=(token,title)=>call('/api/activities',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token},body:JSON.stringify({title,tag:'STG',date:'2026-11-08',content:'packaged recovery proof',images:[]})})
 try{
  const source=await provision('source',true),target=await provision('recovered',false)
  const seed=new Pool({connectionString:source.owner,max:1})
  try{await seed.query("INSERT INTO main.users(username,password,role) VALUES('owner',$1,'super_admin')",[require('bcryptjs').hashSync('synthetic-packaged-password',10)])}finally{await seed.end()}
  const data=await createVolume('source'),restoredData=await createVolume('recovered');backupVolume=await createVolume('backups')
  await run(data,{},['node','-e',"const fs=require('node:fs');for(const p of ['public','asset-quarantine','asset-publications'])fs.mkdirSync('/app/data/'+p,{recursive:true});fs.writeFileSync('/app/data/public/retained.png',Buffer.from('"+png.toString('base64')+"','base64'));fs.writeFileSync('/app/data/asset-quarantine/retained.bin',Buffer.from([0,255,13]));fs.writeFileSync('/app/data/asset-publications/retained.bin','retained journal bytes');if(process.getuid()===0)throw Error('root');for(const p of ['/app/dist/src/database/sqlite.js','/app/dist/src/migrations/engine.js'])if(fs.existsSync(p))throw Error('stale runtime');"])
  const first=await run(data,await serve('/app/data',source),[],true);await ready()
  const owner=await login(),created=await write(owner.token,'committed-before-recovery')
  const receipt=JSON.parse(await docker(['exec','-e','POSTGRES_BACKUP_URL',first,'node','scripts/postgres/cli.mjs','create','--tag','packaged','--output-dir','/app/backups/postgres'],{POSTGRES_BACKUP_URL:local(source.owner)}))
  expect(receipt.tag).toBe('packaged')
  expect(JSON.parse(await docker(['exec',first,'node','scripts/postgres/cli.mjs','verify','--bundle','/app/backups/postgres/pg_packaged'])).tables).toBe(32)
  await docker(['stop','--time','15',first])
  const recovered=JSON.parse(await run(restoredData,{POSTGRES_RESTORE_URL:local(target.owner)},['node','scripts/postgres/cli.mjs','restore','--bundle','/app/backups/postgres/pg_packaged','--target-database',target.name,'--target-dir','/app/data/recovered','--runtime-role','guatswr_app']))
  expect(recovered.restored).toBe(true);expect(recovered.tablesRestored).toBe(32)
  const second=await run(restoredData,await serve('/app/data/recovered/data',target),[],true);await ready()
  const fresh=await login();expect((await call('/api/activities/'+created.id)).title).toBe('committed-before-recovery')
  const picture=await fetch(origin+'/uploads/retained.png');expect(picture.status).toBe(200);expect(Buffer.from(await picture.arrayBuffer())).toEqual(png)
  const after=await write(fresh.token,'committed-after-recovery');expect(after.id).toBeGreaterThan(created.id)
  await docker(['exec',second,'node','-e',"const fs=require('node:fs');if(fs.readFileSync('/app/data/recovered/data/asset-quarantine/retained.bin').toString('hex')!=='00ff0d')throw Error('private bytes');if(fs.readFileSync('/app/data/recovered/data/asset-publications/retained.bin','utf8')!=='retained journal bytes')throw Error('journal bytes');if(process.getuid()===0)throw Error('root');"])
 }finally{
  for(const id of containers){if(await docker(['inspect','--format','{{index .Config.Labels "io.guatswr.test"}}',id])!==label)throw Error('UNOWNED_CONTAINER');await docker(['rm','--force',id])}
  for(const volume of volumes){if(await docker(['volume','inspect','--format','{{index .Labels "io.guatswr.test"}}',volume])!==label)throw Error('UNOWNED_VOLUME');await docker(['volume','rm',volume])}
  for(const name of databases)if(/^guatswr_restore_(source|recovered)_[a-f0-9]{16}$/.test(name))await admin.query('DROP DATABASE "'+name+'" WITH (FORCE)')
  await admin.end()
 }
},180000)
