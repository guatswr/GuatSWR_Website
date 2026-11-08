import {it} from 'node:test'
import assert from 'node:assert/strict'
import {validateTargetUrl} from './import-postgres.mjs'
import {computeTableDigest,validateDataRow,exportSqliteDatabase} from './export-sqlite.mjs'
import {parseArgs} from './migrate.mjs'

it('requires an approved isolated database name and exact operator target',()=>{
 for(const value of ['postgres://app@localhost/postgres','postgres://app@localhost/production','http://app@localhost/guatswr_review_test','postgres://app@localhost/guatswr_review_test?options=x'])assert.throws(()=>validateTargetUrl(value))
 assert.equal(validateTargetUrl('postgres://app@localhost/guatswr_review_target','guatswr_review_target').dbName,'guatswr_review_target')
 assert.throws(()=>validateTargetUrl('postgres://app@localhost/guatswr_review_target','guatswr_review_other'))
})
it('keeps credentials out of CLI arguments and rejects unsafe report names',()=>{
 assert.throws(()=>parseArgs(['--target','postgres://app:private@localhost/test']))
 assert.throws(()=>parseArgs(['--run-id','../../escape']))
 assert.throws(()=>parseArgs(['--unknown']))
 assert.equal(parseArgs(['--source','copy','--target-database','guatswr_review_target','--run-id','safe_01','--dry-run']).dryRun,true)
})
it('normalizes integer driver representations but preserves TEXT bytes and BLOB',()=>{
 const digest=(id,value)=>computeTableDigest([{id,value}],['id','value'],'id').digest
 assert.equal(digest(42,'001'),digest(42n,'001'))
 assert.notEqual(digest(42,'001'),digest(42,'1'))
 assert.notEqual(digest(42,'{ "a": 1 }'),digest(42,'{"a":1}'))
 assert.notEqual(digest(42,Buffer.from([1,2])),digest(42,'AQI='))
 assert.equal(digest(42,new Uint8Array([1,2])),digest(42,Buffer.from([1,2])))
})
it('retains historical TEXT and rejects PostgreSQL-incompatible values',()=>{
 assert.deepEqual(validateDataRow('main','activities',{date:'historic unknown',images:'legacy invalid JSON'},['date','images']),[])
 assert.equal(validateDataRow('main','users',{id:9007199254740992n,name:'bad\0value'},['id','name']).length,2)
})


// Historical source validation remains executable after deleting runtime SQLite.
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import {createRequire} from 'node:module'
import {fileDigest} from '../../backend/scripts/postgres/data.mjs'
const require=createRequire(import.meta.url),{initializeDatabases}=require('./legacy-sqlite/initialize.cjs')
async function source(test){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'guatswr-legacy-source-'))
 test.after(async()=>{assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('guatswr-legacy-source-'));await fs.rm(root,{recursive:true,force:true})})
 await initializeDatabases({}, {data:root})
 return {mainDbPath:path.join(root,'guatswr_web_main.db'),auditDbPath:path.join(root,'guatswr_web_logs.db')}
}
it('exports all archived tables read-only without an obsolete compiled engine',async test=>{
 const files=await source(test),before=await fileDigest(files.mainDbPath)
 const exported=await exportSqliteDatabase(files)
 assert.equal(Object.keys(exported.tables).length,30)
 assert.equal(Object.values(exported.tables).every(table=>table.present),true)
 assert.equal(await fileDigest(files.mainDbPath),before)
})
it('refuses unknown historical columns instead of silently dropping data',async test=>{
 const files=await source(test),db=new DatabaseSync(files.mainDbPath)
 try{db.exec('ALTER TABLE users ADD COLUMN unknown_private_extension TEXT')}finally{db.close()}
 await assert.rejects(exportSqliteDatabase(files),/MIGRATION_SCHEMA_DRIFT|SOURCE_COLUMNS_UNSUPPORTED/)
})
it('refuses a live historical WAL rather than certifying an unfrozen source',async test=>{
 const files=await source(test),db=new DatabaseSync(files.mainDbPath)
 try{db.exec("PRAGMA journal_mode=WAL; INSERT INTO site_config VALUES('inflight','1')");await assert.rejects(exportSqliteDatabase(files),/SOURCE_MUST_BE_FROZEN/)}finally{db.close()}
})
it('refuses historical orphan data before any target connection',async test=>{
 const files=await source(test),db=new DatabaseSync(files.mainDbPath)
 try{db.exec("PRAGMA foreign_keys=OFF; INSERT INTO event_participants(event_id,common_id) VALUES(999,'orphan')")}finally{db.close()}
 await assert.rejects(exportSqliteDatabase(files),{code:'MIGRATION_FOREIGN_KEY_VIOLATIONS'})
})
