import { it, expect } from 'vitest'
import path from 'node:path'
import { fixture, token, png } from '../helpers/fixture.mjs'
it('F04 rejects encoded traversal, backslashes, siblings and deleting the public root',async()=>{
 const f=await fixture()
 for(const url of ['/uploads/../public-sibling/file','/uploads/%2e%2e/public-sibling/file','/uploads/..\\public-sibling\\file','/uploads/','/uploads/%00']) expect(f.context.storage.resolveUploadsPath(url)).toBeNull()
 const sibling=path.join(f.root,'public-sibling')
 await f.fs.mkdir(sibling)
 const sentinel=path.join(sibling,'keep')
 await f.fs.writeFile(sentinel,'keep')
 await f.context.storage.deletePathSafe(sentinel)
 expect(await f.fs.readFile(sentinel,'utf8')).toBe('keep')
 await f.context.storage.deletePathSafe(f.context.PUBLIC_DIR)
 expect((await f.fs.stat(f.context.PUBLIC_DIR)).isDirectory()).toBe(true)
})
it('F04 refuses paths through a symlink outside public',async()=>{
 const f=await fixture()
 const sibling=path.join(f.root,'public-sibling')
 await f.fs.mkdir(sibling)
 await f.fs.writeFile(path.join(sibling,'keep'),'keep')
 await f.fs.symlink(sibling,path.join(f.context.PUBLIC_DIR,'link'),process.platform==='win32'?'junction':'dir')
 expect(f.context.storage.resolveUploadsPath('/uploads/link/keep')).toBeNull()
 await f.context.storage.deletePathSafe(path.join(f.context.PUBLIC_DIR,'link/keep'))
 expect(await f.fs.readFile(path.join(sibling,'keep'),'utf8')).toBe('keep')
 expect((await f.http.get('/uploads/link/keep')).status).toBe(404)
})
it('F04 rejects moves into a sibling directory and preserves the source',async()=>{
 const f=await fixture()
 await f.fs.writeFile(path.join(f.context.UPLOADS_DIR,'keep.png'),'keep')
 await expect(f.context.storage.moveStagedFile('/uploads/upload/keep.png',path.join(f.root,'public-sibling'))).rejects.toThrow(/Unsafe storage/)
 expect(await f.fs.readFile(path.join(f.context.UPLOADS_DIR,'keep.png'),'utf8')).toBe('keep')
})
it('F01 admin upload selectors must be positive canonical integers before file writes',async()=>{
 const f=await fixture()
 for(const id of ['0','-1','1.5','../escape']) {
   const response=await f.http.post('/api/upload').query({activityId:id}).set('Authorization',`Bearer ${token()}`).attach('file',png,{filename:'fixture.png',contentType:'image/png'})
   expect(response.status).toBe(400)
 }
 expect(await f.fs.readdir(f.context.UPLOADS_DIR)).toEqual([])
})
