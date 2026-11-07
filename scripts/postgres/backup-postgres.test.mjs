import {it} from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {resourceInventory,verifyPostgresBundle} from '../../backend/scripts/postgres/backup.mjs'

it('inventories actual resource bytes recursively and detects changed content',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'guatswr-resource-test-'))
 try{
  await fs.mkdir(path.join(root,'nested'));await fs.writeFile(path.join(root,'nested','file.bin'),Buffer.from([0,255,1]))
  const first=await resourceInventory(root)
  assert.equal(first[0].path,'nested/file.bin');assert.equal(first[0].size,3)
  await fs.writeFile(path.join(root,'nested','file.bin'),Buffer.from([0,254,1]))
  assert.notEqual((await resourceInventory(root))[0].sha256,first[0].sha256)
 }finally{assert.ok(path.basename(root).startsWith('guatswr-resource-test-'));await fs.rm(root,{recursive:true,force:true})}
})
it('refuses legacy partial JSON backups before connecting to a restore database',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'guatswr-backup-test-'))
 try{await fs.writeFile(path.join(root,'receipt.json'),JSON.stringify({format:'guatswr-postgres-backup',version:1}));await assert.rejects(verifyPostgresBundle(root),/BUNDLE_FORMAT_UNSUPPORTED/)}
 finally{assert.ok(path.basename(root).startsWith('guatswr-backup-test-'));await fs.rm(root,{recursive:true,force:true})}
})
