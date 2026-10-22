const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const exec=promisify(execFile);
const {createApplication}=require('../src/app');
(async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'guatswr-backup-check-'));
 let instance;
 try{
  const data=path.join(root,'data'),backups=path.join(root,'backups');
  instance=await createApplication({env:{NODE_ENV:'test',JWT_SECRET:'isolated-backup-fixture'},paths:{data,public:path.join(root,'public'),backups},backgroundTasks:false,externalServices:false});
  const run=(sql)=>new Promise((resolve,reject)=>instance.context.db.run(sql,error=>error?reject(error):resolve()));
  await run("INSERT INTO history(date,title) VALUES ('2026-01-01','committed WAL fixture')");
  const script=process.env.BACKUP_TEST_SCRIPT || path.join(__dirname,'db_backup.sh');
  const env={...process.env,DATA_DIR:data,BACKUP_ROOT:backups,BACKUP_DATE_TAG:'20261023_000001'};
  await exec('/bin/bash',[script],{env});
  const archive=path.join(backups,'db/db_20261023_000001.tar.gz');
  assert.equal((await exec('tar',['-tzf',archive])).stdout.trim(),'main.db\nlogs.db');
  const extracted=path.join(root,'extracted');await fs.mkdir(extracted);
  await exec('tar',['-xzf',archive,'-C',extracted]);
  assert.equal((await exec('sqlite3',[path.join(extracted,'main.db'),'SELECT title FROM history;'])).stdout.trim(),'committed WAL fixture');
  assert.equal((await exec('sqlite3',[path.join(extracted,'logs.db'),'PRAGMA integrity_check;'])).stdout.trim(),'ok');
  await assert.rejects(exec('/bin/bash',[script],{env}),/refusing to overwrite/);
  await assert.rejects(exec('/bin/bash',[script],{env:{...env,BACKUP_DATE_TAG:'20261023_000002',LOG_DB_PATH:path.join(root,'missing.db')}}),/both main and audit/);
  await assert.rejects(exec('/bin/bash',[script],{env:{...env,SQLITE3_BIN:'missing-sqlite-test-command'}}),/required tool unavailable/);
  await assert.rejects(exec('/bin/bash',[script],{env:{...env,BACKUP_DATE_TAG:'20261023_000003',LOG_DB_PATH:instance.context.dbPath}}),/databases must be distinct/);
  const corrupt=path.join(root,'corrupt.db');await fs.writeFile(corrupt,'not sqlite');
  await assert.rejects(exec('/bin/bash',[script],{env:{...env,BACKUP_DATE_TAG:'20261023_000004',LOG_DB_PATH:corrupt}}),/not a database/);
  const wrongAudit=path.join(root,'wrong-audit.db');await fs.copyFile(path.join(extracted,'main.db'),wrongAudit);
  await assert.rejects(exec('/bin/bash',[script],{env:{...env,BACKUP_DATE_TAG:'20261023_000005',LOG_DB_PATH:wrongAudit}}),/database identity mismatch/);
  const names=await fs.readdir(path.join(backups,'db'));
  assert.deepEqual(names.sort(),['db_20261023_000001.sha256','db_20261023_000001.tar.gz']);
  console.log('B01 dual-WAL snapshots, missing DB/CLI, collision and cleanup: 9 checks passed');
 }finally{
  await instance?.close();
  const resolved=path.resolve(root);
  assert.equal(path.dirname(resolved),path.resolve(os.tmpdir()));
  assert.ok(path.basename(resolved).startsWith('guatswr-backup-check-'));
  await fs.rm(resolved,{recursive:true,force:true});
 }
})().catch(error=>{console.error(error);process.exitCode=1});
