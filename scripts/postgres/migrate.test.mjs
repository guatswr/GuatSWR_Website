import {it} from 'node:test'
import assert from 'node:assert/strict'
import {validateTargetUrl} from './import-postgres.mjs'
import {computeTableDigest,validateDataRow} from './export-sqlite.mjs'
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
