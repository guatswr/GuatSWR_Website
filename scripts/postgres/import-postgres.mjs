import { Pool } from 'pg'
import { TOPOLOGICAL_TABLE_ORDER } from './export-sqlite.mjs'
import { initializePostgres,checkPostgresClient } from '../../backend/dist/src/migrations/postgres/engine.js'
import { pgTypes,quote,calibrateSequences,computeTableDigest } from '../../backend/scripts/postgres/data.mjs'

export { SAFE_TARGET_PATTERN,validateTargetUrl } from '../../backend/scripts/postgres/target.mjs'
import { validateTargetUrl } from '../../backend/scripts/postgres/target.mjs'
const optionsFor = connectionString => ({connectionString,max:1,connectionTimeoutMillis:2000,statement_timeout:30000,lock_timeout:1000,types:pgTypes,options:'-c search_path=pg_catalog -c timezone=UTC'})
export async function importToPostgres(exportedData,targetConnectionString,options={}) {
  const {dbName}=validateTargetUrl(targetConnectionString,options.expectedDatabase)
  for (const spec of TOPOLOGICAL_TABLE_ORDER) {
    const data=exportedData.tables[spec.table]
    if (!data?.present || !data.pk || !data.columns?.length) throw Error('SOURCE_TABLE_REQUIRED: '+spec.table)
    const actual=computeTableDigest(data.rows,data.columns,spec.pk)
    if (actual.rowCount!==data.rowCount||actual.digest!==data.digest) throw Error('SOURCE_DIGEST_INVALID: '+spec.table)
  }
  const probe=new Pool(optionsFor(targetConnectionString));probe.on('error',()=>{})
  let exists
  try { exists=(await probe.query("SELECT to_regclass('main.schema_version') AS ledger")).rows[0].ledger }
  finally {await probe.end()}
  if (!exists) {
    if (options.dryRun) return {dryRun:true,dryRunSuccess:true,initializationRequired:true,tables:{}}
    await initializePostgres(targetConnectionString,dbName,options.runtimeRole??'guatswr_app')
  }
  const pool=new Pool(optionsFor(targetConnectionString));pool.on('error',()=>{})
  let client
  try {
    client=await pool.connect();client.on('error',()=>{})
    await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(57124,1)')
    const tx={get:async(sql,params=[]) => (await client.query(sql,params)).rows[0],all:async(sql,params=[]) => (await client.query(sql,params)).rows}
    await checkPostgresClient(tx)
    for (const spec of [...TOPOLOGICAL_TABLE_ORDER,{schema:'bff',table:'records'}]) {
      const rows=(await client.query(`SELECT * FROM ${quote(spec.schema)}.${quote(spec.table)} LIMIT 3`)).rows
      const seeded=spec.table==='member_sync_meta' ? rows.length===1&&String(rows[0].id)==='1'&&String(rows[0].revision)==='0'
        : spec.table==='member_sync_settings' ? rows.length===1&&String(rows[0].id)==='1'&&String(rows[0].revision)==='1'&&rows[0].value==='{"enabled":false,"credential_id":null,"groups":[],"interval_minutes":360,"admin_user_ids":[]}' : false
      if(rows.length&&!seeded)throw Error('TARGET_NOT_EMPTY: '+spec.schema+'.'+spec.table)
    }
    if(options.dryRun){await client.query('ROLLBACK');return {dryRun:true,dryRunSuccess:true,tables:{}}}
    // Remove only the exact two known initialization seeds. No business data is truncated.
    await client.query('DELETE FROM main.member_sync_meta');await client.query('DELETE FROM main.member_sync_settings')
    const summary={targetDatabase:dbName,tables:{},sequencesCalibrated:[],dryRun:false}
    for(const spec of TOPOLOGICAL_TABLE_ORDER){
      const data=exportedData.tables[spec.table], table=quote(spec.schema)+'.'+quote(spec.table)
      for(let offset=0;offset<data.rows.length;offset+=100){
        const chunk=data.rows.slice(offset,offset+100),params=[]
        const groups=chunk.map(row=>'('+data.columns.map(column=>{params.push(row[column]);return '$'+params.length}).join(',')+')')
        await client.query(`INSERT INTO ${table}(${data.columns.map(quote).join(',')}) VALUES ${groups.join(',')}`,params)
      }
      summary.tables[spec.table]={importedRows:data.rows.length,status:'imported'}
    }
    // Member triggers ran during import; restore the exact source counter afterwards.
    await client.query('UPDATE main.member_sync_meta SET revision=$1 WHERE id=1',[exportedData.tables.member_sync_meta.rows[0].revision])
    summary.sequencesCalibrated=await calibrateSequences(client)
    if(options.beforeCommit)await options.beforeCommit(client)
    await client.query('COMMIT')
    return summary
  }catch(error){await client?.query('ROLLBACK').catch(()=>{});throw error}
  finally{client?.release();await pool.end()}
}
