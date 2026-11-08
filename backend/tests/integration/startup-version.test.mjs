import path from 'node:path'
import fs from 'node:fs/promises'
import {createRequire} from 'node:module'
import {expect,it} from 'vitest'
import {fixture} from '../helpers/fixture.mjs'
const require=createRequire(import.meta.url),{createApplication}=require('../../src/app.js')
const options=f=>({env:f.context.env,paths:{data:f.context.DATA_DIR,public:f.context.PUBLIC_DIR,backups:f.context.BACKUP_ROOT},backgroundTasks:false,externalServices:false})
it('startup never creates an absent PostgreSQL schema or local SQLite files',async()=>{
 const f=await fixture(),data=path.join(f.root,'uninitialized')
 await f.fixtureAdmin.query('DROP SCHEMA audit CASCADE')
 await expect(createApplication({...options(f),paths:{data,public:path.join(data,'public'),backups:path.join(data,'backups')}})).rejects.toBeDefined()
 await expect(fs.access(data)).rejects.toHaveProperty('code','ENOENT')
 expect((await f.fixtureAdmin.query("SELECT to_regnamespace('audit') AS name")).rows[0].name).toBeNull()
})
it('a missing ledger rejects startup without recreating it',async()=>{
 const f=await fixture();await f.fixtureAdmin.query('DROP TABLE main.schema_version')
 await expect(createApplication(options(f))).rejects.toHaveProperty('code','PG_MIGRATION_REQUIRED')
 expect((await f.fixtureAdmin.query("SELECT to_regclass('main.schema_version') AS name")).rows[0].name).toBeNull()
})
it('startup rejects index drift rather than repairing it',async()=>{
 const f=await fixture();await f.fixtureAdmin.query('DROP INDEX main.idx_members_name')
 await expect(createApplication(options(f))).rejects.toHaveProperty('code','PG_MIGRATION_SCHEMA_DRIFT')
 expect((await f.fixtureAdmin.query("SELECT to_regclass('main.idx_members_name') AS name")).rows[0].name).toBeNull()
})
