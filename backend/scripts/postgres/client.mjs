import {spawn} from 'node:child_process'
import {createReadStream,createWriteStream} from 'node:fs'
import {pipeline} from 'node:stream/promises'

export function clientEnvironment(url){
 const parsed=new URL(url)
 if(!['postgres:','postgresql:'].includes(parsed.protocol)||parsed.hash||parsed.searchParams.has('options')||!parsed.hostname||!parsed.username||parsed.pathname.length<2)throw Error('BACKUP_URL_INVALID')
 const env={...process.env,PGHOST:parsed.hostname,PGPORT:parsed.port||'5432',PGUSER:decodeURIComponent(parsed.username),PGPASSWORD:decodeURIComponent(parsed.password),PGDATABASE:decodeURIComponent(parsed.pathname.slice(1)),PGCONNECT_TIMEOUT:'5'}
 for(const [query,key] of Object.entries({sslmode:'PGSSLMODE',sslrootcert:'PGSSLROOTCERT',sslcert:'PGSSLCERT',sslkey:'PGSSLKEY'}))if(parsed.searchParams.has(query))env[key]=parsed.searchParams.get(query)
 return env
}
export async function runClient(tool,args,{databaseUrl,inputFile,outputFile,commandFor,timeoutMs=1200000}={}){
 const environment=clientEnvironment(databaseUrl)
 const descriptor=commandFor?commandFor(tool,args,environment):{command:tool,args,env:environment}
 const child=spawn(descriptor.command,descriptor.args,{env:descriptor.env||environment,stdio:['pipe','pipe','pipe'],windowsHide:true})
 let stdout='',stderr=''
 child.stderr.on('data',chunk=>{if(stderr.length<4096)stderr+=chunk.toString()})
 const reading=outputFile?pipeline(child.stdout,createWriteStream(outputFile,{flags:'wx',mode:0o600})):null
 if(!outputFile)child.stdout.on('data',chunk=>{if(stdout.length<1048576)stdout+=chunk.toString()})
 const feeding=inputFile?pipeline(createReadStream(inputFile),child.stdin):null
 if(!inputFile)child.stdin.end()
 const timer=setTimeout(()=>child.kill('SIGKILL'),timeoutMs)
 const result=new Promise((resolve,reject)=>{child.once('error',()=>reject(Error('POSTGRES_CLIENT_UNAVAILABLE')));child.once('exit',code=>code===0?resolve():reject(Error('POSTGRES_CLIENT_FAILED: '+tool)))})
 // Observe all pipes immediately, including pg_restore exiting before consuming stdin.
 const outcomes=await Promise.allSettled([result,reading,feeding])
 clearTimeout(timer)
 const failed=outcomes.find(x=>x.status==='rejected')
 if(failed)throw failed.reason
 return stdout
}
export async function verifyClientVersion(tool,databaseUrl,commandFor,major){
 const text=await runClient(tool,['--version'],{databaseUrl,commandFor})
 const found=/PostgreSQL\) (\d+)\./.exec(text)
 if(!found||Number(found[1])!==major)throw Error('POSTGRES_CLIENT_VERSION_MISMATCH')
}
