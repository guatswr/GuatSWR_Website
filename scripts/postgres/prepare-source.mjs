import fs from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {resourceInventory} from '../../backend/scripts/postgres/backup.mjs'
import {fileDigest} from '../../backend/scripts/postgres/data.mjs'
const command=promisify(execFile),script=fileURLToPath(new URL('../../backend/scripts/backup_bundle.py',import.meta.url))
export async function prepareVerifiedSource({bundlePath,sha256,targetDir,python=process.env.PYTHON_BIN||'python'}){
 if(!/^[a-f0-9]{64}$/.test(sha256||'')||await fileDigest(bundlePath)!==sha256)throw Error('SOURCE_BACKUP_CHECKSUM_REQUIRED')
 if(await fs.lstat(targetDir).catch(()=>null))throw Error('SOURCE_RESTORE_TARGET_EXISTS')
 const env={...process.env,BACKUP_NODE_BIN:process.execPath}
 await command(python,[script,'verify',bundlePath,'--sha256',sha256,'--work-dir',path.dirname(targetDir)],{env,timeout:300000,maxBuffer:1048576})
 await command(python,[script,'restore',bundlePath,'--sha256',sha256,'--target',targetDir],{env,timeout:300000,maxBuffer:1048576})
 const data=path.join(targetDir,'data')
 const marker={format:'guatswr-verified-migration-source',backupSha256:sha256,verifiedAt:new Date().toISOString(),
  publicFiles:await resourceInventory(path.join(data,'public')),mainSha256:await fileDigest(path.join(data,'guatswr_web_main.db')),auditSha256:await fileDigest(path.join(data,'guatswr_web_logs.db'))}
 await fs.writeFile(path.join(data,'.migration-source.json'),JSON.stringify(marker)+'\n',{mode:0o600,flag:'wx'})
 return {dataDir:data,publicDir:path.join(data,'public'),marker}
}
export async function verifySourceMarker(directory,paths){
 const marker=JSON.parse(await fs.readFile(path.join(directory,'.migration-source.json'),'utf8'))
 if(marker.format!=='guatswr-verified-migration-source'||!/^[a-f0-9]{64}$/.test(marker.backupSha256))throw Error('SOURCE_VERIFIED_BACKUP_REQUIRED')
 if(!Array.isArray(marker.publicFiles)||JSON.stringify(await resourceInventory(path.join(directory,'public')))!==JSON.stringify(marker.publicFiles))throw Error('SOURCE_RESOURCE_ATTESTATION_MISMATCH')
 if(await fileDigest(paths.mainDbPath)!==marker.mainSha256||await fileDigest(paths.auditDbPath)!==marker.auditSha256)throw Error('SOURCE_ATTESTATION_MISMATCH')
 return marker
}

export async function main(args=process.argv.slice(2)){
 const options={}
 for(let i=0;i<args.length;i++){
  const names={'--bundle':'bundlePath','--sha256':'sha256','--target-dir':'targetDir'}
  if(!names[args[i]]||!args[i+1])throw Error('INVALID_SOURCE_PREPARATION_ARGUMENT')
  options[names[args[i]]]=args[++i]
 }
 if(!options.bundlePath||!options.targetDir)throw Error('SOURCE_BUNDLE_AND_TARGET_REQUIRED')
 const result=await prepareVerifiedSource(options)
 console.log(JSON.stringify({dataDir:result.dataDir,backupSha256:result.marker.backupSha256}))
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(()=>{console.error('Verified source preparation failed');process.exitCode=1})
