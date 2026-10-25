import { it,expect } from 'vitest'
import { publishedRevisionLogSchema } from '@guatswr/shared'
it('projects the visitor revision log without historical text, private IDs or restoration fields',()=>{
 const result=publishedRevisionLogSchema.parse({available:true,page:1,limit:20,total:1,current_revision:123,items:[{sequence:1,action:'baseline',actor_name:'editor',created_at:1,changed_fields:'[]',id:123,version:4,title:'private old title',content:'private old text',restored_from:456}]})
 expect(result).not.toHaveProperty('current_revision')
 expect(result.items[0]).not.toHaveProperty('content');expect(result.items[0]).not.toHaveProperty('id');expect(result.items[0]).not.toHaveProperty('version')
 expect(JSON.stringify(result)).not.toContain('private old')
})
