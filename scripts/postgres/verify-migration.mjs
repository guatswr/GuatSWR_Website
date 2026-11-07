import { resourceInventory } from '../../backend/scripts/postgres/backup.mjs'
import { verifyResourceReferences } from '../../backend/scripts/postgres/assets.mjs'
import { Pool } from 'pg'
import { TOPOLOGICAL_TABLE_ORDER } from './export-sqlite.mjs'
import { pgTypes,postgresDigest,verifySequences } from '../../backend/scripts/postgres/data.mjs'
import { validateTargetUrl } from './import-postgres.mjs'
import { checkPostgresClient } from '../../backend/dist/src/migrations/postgres/engine.js'
export async function verifyMigration(exportedData,targetConnectionString,options={}){
 validateTargetUrl(targetConnectionString)
 const pool=new Pool({connectionString:targetConnectionString,max:1,connectionTimeoutMillis:2000,statement_timeout:30000,types:pgTypes,options:'-c search_path=pg_catalog -c timezone=UTC'});pool.on('error',()=>{})
 let client
 try{
  client=await pool.connect();client.on('error',()=>{});await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
  await checkPostgresClient({get:async(sql,p=[]) =>(await client.query(sql,p)).rows[0],all:async(sql,p=[]) =>(await client.query(sql,p)).rows})
  const result={overallStatus:'PASS',verifiedAt:new Date().toISOString(),tableComparisons:{},foreignKeyIntegrity:{violations:0},assetReferences:{status:'NOT_CHECKED',total:0,reason:'Filesystem paths require an independently verified resource bundle'}}
  for(const spec of TOPOLOGICAL_TABLE_ORDER){
   const source=exportedData.tables[spec.table]
   if(!source?.present)throw Error('SOURCE_TABLE_REQUIRED')
   const target=await postgresDigest(client,{...spec,columns:source.columns,pk:spec.pk.split(',')})
   const match=target.rowCount===source.rowCount&&target.digest===source.digest
   result.tableComparisons[spec.table]={schema:spec.schema,table:spec.table,status:match?'MATCH':'MISMATCH',sourceRowCount:source.rowCount,targetRowCount:target.rowCount,digestMatch:target.digest===source.digest}
   if(!match)result.overallStatus='FAIL'
  }
  const constraints=(await client.query("SELECT conname FROM pg_constraint k JOIN pg_namespace n ON n.oid=k.connamespace WHERE n.nspname IN ('main','audit','bff') AND k.contype='f' AND NOT k.convalidated")).rows
  if(constraints.length){result.foreignKeyIntegrity.violations=constraints.length;result.overallStatus='FAIL'}
  result.sequenceIntegrity=await verifySequences(client)
  if(!result.sequenceIntegrity.passed)result.overallStatus='FAIL'
  if(options.publicDir){
   result.assetReferences=await verifyResourceReferences({exportedData,publicDir:options.publicDir,files:await resourceInventory(options.publicDir)})
   if(result.assetReferences.status!=='PASS')result.overallStatus='FAIL'
  }
  await client.query('COMMIT');return result
 }catch(error){await client?.query('ROLLBACK').catch(()=>{});throw error}
 finally{client?.release();await pool.end()}
}
export function renderVerificationMarkdown(report,runId='unknown'){
 return [`# PostgreSQL migration ${runId}`,'',`Status: ${report.overallStatus}`,'','| Table | Result | Source | Target |','| --- | --- | --- | --- |',...Object.values(report.tableComparisons).map(row=>`| ${row.schema}.${row.table} | ${row.status} | ${row.sourceRowCount} | ${row.targetRowCount} |`),'',`Sequences safe: ${report.sequenceIntegrity.passed}`,''].join('\n')
}
