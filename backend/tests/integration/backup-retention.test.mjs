import path from 'node:path'
import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import { expect,it } from 'vitest'
import { fixture,token } from '../helpers/fixture.mjs'
const require=createRequire(import.meta.url)
const {createBackupFiles,backupFileIdentity}=require('../../dist/src/backup/files.js')
async function mark(filename){
 const stat=await fs.stat(filename,{bigint:true})
 await fs.writeFile(filename+'.verified.json',JSON.stringify({format:'guatswr-verified-backup',version:1,artifact:path.basename(filename),source_sha256:'a'.repeat(64),source_identity:backupFileIdentity(stat),source_size:Number(stat.size)}))
}
it('protects the last verified restore point and cannot bypass by deleting its marker or hash',async()=>{
 const f=await fixture(),root=path.join(f.root,'backups','full'),filename=path.join(root,'verified.tar.gz')
 await fs.writeFile(filename,'synthetic archive');await fs.writeFile(path.join(root,'verified.sha256'),'synthetic hash');await mark(filename)
 for(const file of ['verified.tar.gz','verified.tar.gz.verified.json','verified.sha256']){
  const response=await f.http.delete('/api/admin/backups').query({file}).set('Authorization',`Bearer ${token()}`)
  expect(response.status).toBe(409)
 }
 expect(await fs.readFile(filename,'utf8')).toBe('synthetic archive')
 const other=path.join(root,'second.tar.gz');await fs.writeFile(other,'second archive');await mark(other)
 expect((await f.http.delete('/api/admin/backups').query({file:'verified.tar.gz'}).set('Authorization',`Bearer ${token()}`)).body).toEqual({message:'已删除'})
 await expect(fs.stat(filename)).rejects.toHaveProperty('code','ENOENT')
 await expect(fs.stat(filename+'.verified.json')).rejects.toHaveProperty('code','ENOENT')
 expect(await fs.readFile(other,'utf8')).toBe('second archive')
})
it('rejects stale verification identities and serializes with an existing retention lock',async()=>{
 const f=await fixture(),root=path.join(f.root,'backups','full'),filename=path.join(root,'stale.tar.gz')
 await fs.writeFile(filename,'original');await mark(filename);await fs.writeFile(filename,'replacement archive')
 await expect(f.context.backup.remove('full','stale.tar.gz')).rejects.toHaveProperty('code','BACKUP_VERIFICATION_INVALID')
 const lock=path.join(root,'.backup-retention.lock');await fs.mkdir(lock)
 await expect(f.context.backup.remove('full','fixture.tar.gz')).rejects.toHaveProperty('code','BACKUP_BUSY')
 expect((await fs.stat(lock)).isDirectory()).toBe(true)
 await fs.rmdir(lock)
})
it('keeps asynchronous list metadata and rejects exposing backups under the public root',async()=>{
 const f=await fixture(),files=await f.context.backup.listBackups('full')
 const entry=files.find(file=>file.name==='fixture.tar.gz'),stat=await fs.stat(path.join(f.root,'backups','full','fixture.tar.gz'))
 expect(entry).toMatchObject({type:'full',size:stat.size,mtime:stat.mtimeMs})
 expect(()=>createBackupFiles(path.join(f.context.PUBLIC_DIR,'backups'),f.context.PUBLIC_DIR,()=>{})).toThrow('BACKUP_CONFIGURATION')
})

it('accepts a real Python verification marker as a protected recovery point',async()=>{
 const {promisify}=await import('node:util'),{execFile}=await import('node:child_process')
 const f=await fixture(),python=process.platform==='win32'?'python':'python3'
 await promisify(execFile)(python,[path.resolve('tests/helpers/verify-backup.py'),f.root,path.resolve('scripts/backup_bundle.py'),path.join(f.root,'backups','full')],{env:{...process.env,BACKUP_NODE_BIN:process.execPath}})
 await expect(f.context.backup.remove('full','full_20300101_000000_verify.tar.gz')).rejects.toHaveProperty('code','BACKUP_LAST_VERIFIED')
 const restored=path.join(f.root,'verification-interop','restored'),jobId='01234567-1234-1234-1234-0123456789ab'
 const receipt=JSON.parse(await fs.readFile(path.join(restored,'RESTORE_READY.json'),'utf8'))
 expect(receipt.rebound_cleanup_jobs).toBe(1)
 const {createSqliteStore}=require('../../dist/src/database/sqlite.js')
 const store=createSqliteStore(path.join(restored,'data','guatswr_web_main.db'))
 try {expect((await store.get('SELECT identity FROM asset_cleanup_jobs WHERE id=?',[jobId])).identity).toBe(backupFileIdentity(await fs.stat(path.join(restored,'data','asset-quarantine',jobId),{bigint:true})))} finally {await store.close()}
})
