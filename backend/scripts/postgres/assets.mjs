import path from 'node:path'
import {createRequire} from 'node:module'
const require=createRequire(import.meta.url)
const {referencesFromValues}=require('../../dist/src/storage/reference-inventory.js')
const fields={users:['avatar'],members:['avatar'],history:['image'],activities:['cover_image','images','content','description'],events:['content'],event_participants:['avatar'],site_config:['value'],activity_revisions:['cover_image','images','content','description']}
export async function verifyResourceReferences({client,exportedData,publicDir,files}){
 const values=[]
 for(const [table,columns]of Object.entries(fields)){
  if(exportedData){for(const row of exportedData.tables[table].rows)for(const column of columns)values.push(row[column])}
  else for(const column of columns)values.push(...(await client.query(`SELECT "${column}" AS value FROM main."${table}"`)).rows.map(row=>row.value))
 }
 const {references,invalidLocalUrls}=referencesFromValues(values,publicDir)
 const normalized=value=>process.platform==='win32'?value.toLowerCase():value
 const present=new Set(files.map(file=>normalized(path.resolve(publicDir,...file.path.split('/')))))
 let missing=0
 for(const reference of references)if(!present.has(normalized(reference)))missing++
 return {status:missing||invalidLocalUrls?'FAIL':'PASS',total:references.size,missing,invalidLocalUrls}
}
