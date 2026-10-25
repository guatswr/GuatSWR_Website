import fs from 'node:fs'
import { createRequire } from 'node:module'
import { expect,it } from 'vitest'
const require=createRequire(import.meta.url)
it('documents 39 Bot operations plus the public member revision and keeps shared input schemas in sync',()=>{
 const doc=require('js-yaml').load(fs.readFileSync(new URL('../../docs/bot-openapi.yaml',import.meta.url),'utf8'))
 const shared=require('@guatswr/shared/bot')
 const models={CredentialInput:'botCredentialSchema',SubscriptionInput:'botSubscriptionSchema',BindInput:'botLinkSchema',SignupInput:'botSignupSchema',ReviewInput:'botReviewSchema'}
 for(const [name,key] of Object.entries(models)) expect(doc.components.schemas[name]).toEqual(shared[key].toJSONSchema({io:'input',target:'openapi-3.0',unrepresentable:'any'}))
 const operations=Object.values(doc.paths).flatMap(item=>Object.values(item))
 expect(operations).toHaveLength(40)
 expect(new Set(operations.map(o=>o.operationId)).size).toBe(40)
 const today=doc.paths['/v1/on-this-day'].get
 expect(today.operationId).toBe('bot_24')
 expect(today['x-required-scope']).toBe('query:read')
 expect(today.parameters.find(p=>p.name==='date').schema.format).toBe('date')
 expect(today.parameters.find(p=>p.name==='source').schema.enum).toEqual(['all','articles','history'])
 expect(today.responses['200'].content['application/json'].schema.$ref).toBe('#/components/schemas/OnThisDayResponse')
 expect(doc.components.schemas.OnThisDayItem.required).toEqual(expect.arrayContaining(['image_url','images','images_truncated']))
 expect(doc.components.schemas.OnThisDayItem.properties.images.items.format).toBe('uri')
 expect(doc.components.schemas.OnThisDayResponse.properties.broadcast_images.uniqueItems).toBe(true)
 expect(doc.paths['/v1/events/{id}/review'].post['x-required-scope']).toBe('review:write')
 expect(doc.paths['/link-codes'].post.security).toEqual([{websiteJwt:[]},{bffBridge:[]}])
 for(const [route,item] of Object.entries(doc.paths)) for(const op of Object.values(item)) {
  expect(op.responses['200']).toBeDefined();expect(op.security).toHaveLength(op['x-public-extension'] ? 0 : route==='/link-codes'||route==='/binding' ? 2 : 1)
  for(const match of route.matchAll(/\{([^}]+)\}/g)) expect(op.parameters.some(p=>p.name===match[1]&&p.in==='path'&&p.required)).toBe(true)
 }
})
