import path from 'node:path'
import {createPostgresBackup,restorePostgresBackup,verifyPostgresBundle} from './backup.mjs'
const parse=args=>{
 const [action,...rest]=args,result={action}
 const allowed=new Set(['--output-dir','--tag','--bundle','--target-dir','--runtime-role','--target-database'])
 for(let i=0;i<rest.length;i+=2){if(!allowed.has(rest[i])||!rest[i+1]||result[rest[i]])throw Error('BACKUP_ARGUMENTS');result[rest[i]]=rest[i+1]}
 return result
}
async function main(){
 const options=parse(process.argv.slice(2))
 if(options.action==='create'){
  const output=options['--output-dir']||process.env.BACKUP_ROOT&&path.join(process.env.BACKUP_ROOT,'postgres')
  const created=await createPostgresBackup({databaseUrl:process.env.POSTGRES_BACKUP_URL||process.env.POSTGRES_URL,
   uploadsDir:process.env.PUBLIC_DIR,dataDir:process.env.DATA_DIR,quarantineDir:path.join(process.env.DATA_DIR,'asset-quarantine'),
   journalDir:path.join(process.env.DATA_DIR,'asset-publications'),outputDir:output,tag:options['--tag'],sourceRevision:process.env.SOURCE_REVISION})
  console.log(JSON.stringify({tag:created.tag,bundlePath:created.bundlePath,sha256:created.receipt.database.sha256}))
 }else if(options.action==='verify'){
  const receipt=await verifyPostgresBundle(options['--bundle'])
  console.log(JSON.stringify({verified:true,tag:receipt.tag,tables:Object.keys(receipt.tables).length}))
 }else if(options.action==='restore'){
  if(!options['--target-database'])throw Error('RESTORE_TARGET_DATABASE_REQUIRED')
  console.log(JSON.stringify(await restorePostgresBackup({targetDatabaseUrl:process.env.POSTGRES_RESTORE_URL,expectedDatabase:options['--target-database'],bundlePath:options['--bundle'],targetDir:options['--target-dir'],runtimeRole:options['--runtime-role']})))
 }else throw Error('BACKUP_ARGUMENTS')
}
if(process.argv[1]?.endsWith('cli.mjs'))void main().catch(error=>{console.error('POSTGRES_BACKUP_FAILED:',/^([A-Z_]+)/.exec(error.message)?.[1]||'UNKNOWN');process.exitCode=1})
