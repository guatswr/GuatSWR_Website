// Generate the additive contract without rewriting the frozen v1 OpenAPI.
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');
const shared = require('@guatswr/shared/bot');
const models = {
  CredentialInput: 'botCredentialSchema', SubscriptionInput: 'botSubscriptionSchema',
  BindInput: 'botLinkSchema', SignupInput: 'botSignupSchema', ReviewInput: 'botReviewSchema',
  MemberSyncSettings:'memberSyncSettingsSchema',MemberSyncBatch:'memberSyncBatchSchema',MemberSyncComplete:'memberSyncCompleteSchema',
  MemberSyncApply:'memberSyncApplySchema',MemberSyncProfile:'memberSyncProfileSchema',BotReceipt:'botReceiptSchema',
};
const schemas = Object.fromEntries(Object.entries(models).map(([name, key]) => [name, shared[key].toJSONSchema({ io: 'input', target: 'openapi-3.0', unrepresentable: 'any' })]));
schemas.Error = { type: 'object', required: ['message'], properties: { message: { type: 'string' } } };
schemas.MemberSyncRequest={type:'object',required:['group_id'],additionalProperties:false,properties:{group_id:{type:'string',pattern:'^[1-9]\\d{4,11}$'}}};
schemas.OnThisDayItem = { type: 'object', required: ['source','id','title','date','years_ago','description','image','image_url','images','images_truncated','tag','url'], properties: {
  source: { type: 'string', enum: ['articles','history'] }, id: { type: 'integer' }, title: { type: 'string', maxLength: 200 },
  date: { type: 'string', format: 'date' }, years_ago: { type: 'integer', minimum: 1 },
  description: { type: 'string', maxLength: 500 }, image: { type: 'string' }, tag: { type: 'string' },
  image_url: { type: 'string', description: 'First available public image as absolute HTTP(S) URL; empty if unavailable.' },
  images: { type: 'array', maxItems: 50, items: { type: 'string', format: 'uri' }, description: 'Articles: at most one available cover, without gallery/body fallback. History: deduplicated primary/description images. Absolute public URLs.' },
  images_truncated: { type: 'boolean', description: 'History image count, candidate count or description extraction budget was reached; always false for articles.' },
  url: { type: 'string', description: 'Relative website URL; articles use /activity/:id, history uses /history.' }
} };
schemas.OnThisDayResponse = { type: 'object', required: ['date','month_day','timezone','source','page','limit','total','has_more','items','broadcast_text','broadcast_images'], properties: {
  date: { type: 'string', format: 'date' }, month_day: { type: 'string', pattern: '^\\d{2}-\\d{2}$' },
  timezone: { type: 'string', enum: ['Asia/Shanghai'] }, source: { type: 'string', enum: ['all','articles','history'] },
  page: { type: 'integer', minimum: 1, maximum: 1000000 }, limit: { type: 'integer', minimum: 1, maximum: 100 },
  total: { type: 'integer', minimum: 0 }, has_more: { type: 'boolean' }, broadcast_text: { type: 'string', description: 'Plain-text digest of this page only; no automatic message delivery.' },
  broadcast_images: { type: 'array', uniqueItems: true, items: { type: 'string', format: 'uri' }, description: 'Deduplicated image URLs from this page, to accompany broadcast_text without sending a Bot token to image URLs.' },
  items: { type: 'array', items: { $ref: '#/components/schemas/OnThisDayItem' } }
} };
const doc = { openapi: '3.0.3', info: { title: 'GuatSWR Bot Platform', version: '1.0.0', description: 'Additive APIs. Core requires main4; member sync requires main5; recoverable tokens require main6 and an independent encryption key. BOT_PLATFORM_ENABLED=true. See BOT-API.md.' },
  servers: [{ url: '/api/bot' }], paths: {}, components: { securitySchemes: {
    botToken: { type: 'http', scheme: 'bearer', description: 'Scoped gwb_ service token; never a website JWT.' },
    websiteJwt: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    bffBridge: { type: 'apiKey', in: 'header', name: 'X-BFF-Bridge', description: 'Trusted BFF peer/CIDR and a single X-Forwarded-For required. Guest requests also need X-Bot-Owner.' }
  }, schemas } };
let id = 0;
function add(route, method, summary, scope, model, queries = []) {
  const operation = { operationId: `bot_${++id}`, summary, security: scope === 'website' ? [{ websiteJwt: [] }] : scope === 'binding' ? [{ websiteJwt: [] }, { bffBridge: [] }] : [{ botToken: [] }],
    ...(scope !== 'website' && scope !== 'binding' ? { 'x-required-scope': scope } : {}), responses: {} };
  if (model) operation.requestBody = { required: true, content: { 'application/json': { schema: { $ref: `#/components/schemas/${model}` } } } };
  operation.parameters = [...route.matchAll(/\{([^}]+)\}/g)].map(match => ({ name: match[1], in: 'path', required: true, schema: { type: 'string' } }));
  for (const [name,required] of queries) operation.parameters.push({ name, in: 'query', required: Boolean(required), schema: name === 'qq' ? { type: 'string', pattern: '^\\d{5,12}$' }
    : name === 'date' ? { type: 'string', format: 'date', description: 'Reference date YYYY-MM-DD; defaults to today in Asia/Shanghai. Only prior years match.' }
      : name === 'search' ? {type:'string',maxLength:50}
      : name === 'source' ? { type: 'string', enum: ['all','articles','history'], default: 'all' }
        : name === 'type' ? { type: 'string', maxLength: 50 } : { type: 'integer', minimum: 1, maximum: name === 'limit' ? 100 : 1000000 } });
  if (scope === 'binding') operation.parameters.push({ name: 'X-Bot-Owner', in: 'header', description: 'Required for guests; BFF-owned browser-session random secret.', schema: { type: 'string', pattern: '^[a-f0-9]{64}$' } });
  for (const code of ['200','400','401','403','404','409','410','413','500','503']) operation.responses[code] = { description: code === '200' ? 'Success; response shapes and examples are in BOT-API.md' : 'Rejected or unavailable', content: { 'application/json': { schema: code === '200' ? { type: 'object', additionalProperties: true } : { $ref: '#/components/schemas/Error' } } } };
  (doc.paths[route] ||= {})[method] = operation;
}
const pages = [['page',false],['limit',false]];
add('/admin/credentials','post','Create service credential (super_admin); plaintext returned once','website','CredentialInput');
add('/admin/credentials','get','List service credentials without secret hashes (super_admin)','website');
add('/admin/credentials/{id}','delete','Revoke service credential and pending deliveries (super_admin)','website');
add('/admin/deliveries','get','List deliveries (super_admin)','website',null,pages);
add('/admin/deliveries/{id}/retry','post','Retry failed/skipped delivery (super_admin)','website');
add('/link-codes','post','Create a five-minute one-time website binding code','binding');
add('/binding','delete','Unbind the website identity','binding');
add('/v1/identity/bind','post','Consume binding code for QQ from trusted message context','identity:write','BindInput');
for (const name of ['events','articles','members','history']) add(`/v1/${name}`,'get','Query public '+name,'query:read',null,name === 'events' ? [...pages,['type',false]] : pages);
add('/v1/events/{id}','get','Read public event including rules/results','query:read');
add('/v1/subscriptions','get','List own group subscriptions','subscriptions:write');
add('/v1/subscriptions','post','Upsert own subscription within allowed groups','subscriptions:write','SubscriptionInput');
add('/v1/subscriptions/{id}','delete','Delete own subscription','subscriptions:write');
add('/v1/deliveries','get','List own delivery status','deliveries:read',null,pages);
add('/v1/deliveries/{id}/retry','post','Retry own failed/skipped delivery','deliveries:retry');
add('/v1/events/{id}/signup','get','Read bound QQ signup','signup:read',null,[['qq',true]]);
add('/v1/events/{id}/signup','post','Create/update bound QQ signup','signup:write','SignupInput');
add('/v1/events/{id}/signup','delete','Cancel bound QQ signup','signup:write',null,[['qq',true]]);
add('/v1/reviews','get','List pending events for a bound current administrator','review:read',null,[...pages,['qq',true]]);
add('/v1/events/{id}/review','post','Atomically review pending event with reason and audit','review:write','ReviewInput');
add('/v1/on-this-day','get','历史上的今天：往年同月同日的公开活动文章与群史','query:read',null,[...pages,['date',false],['source',false]]);
doc.paths['/v1/on-this-day'].get.responses['200'].content['application/json'].schema = { $ref: '#/components/schemas/OnThisDayResponse' };
add('/admin/member-sync/settings','get','Read member sync settings (super_admin)','website');
add('/admin/member-sync/settings','put','Configure assigned Bot, groups, interval and bound admin recipients (super_admin)','website','MemberSyncSettings');
add('/admin/member-sync/requests','get','List latest 50 sync jobs (super_admin)','website');
add('/admin/member-sync/requests','post','Request a complete group snapshot (super_admin)','website','MemberSyncRequest');
add('/admin/member-sync/requests/{id}','get','Inspect sync job and paginated baseline comparison (super_admin)','website',null,[['page',false],['search',false]]);
add('/admin/member-sync/requests/{id}/apply','post','Apply verified baseline or confirm an exceptional snapshot (super_admin)','website','MemberSyncApply');
add('/admin/members/{id}/sync-profile','put','Associate unique QQ, preserve overrides and complete profile task (admin)','website','MemberSyncProfile');
add('/admin/member-sync/profiles','get','List latest 500 pending profile tasks and private delivery status (admin)','website');
add('/v1/member-sync/requests/{id}','get','Read own assigned synchronization job','members:sync');
add('/v1/member-sync/requests/{id}/batches/{batch_no}','put','Stage an immutable batch of up to 500 members','members:sync','MemberSyncBatch');
add('/v1/member-sync/requests/{id}/avatars','post','Upload validated avatar after its QQ batch; at most 2 MiB','members:sync');
const avatar=doc.paths['/v1/member-sync/requests/{id}/avatars'].post;
avatar.parameters.push({name:'X-Member-QQ',in:'header',required:true,schema:{type:'string',pattern:'^[1-9]\\d{4,11}$'}});
avatar.requestBody={required:true,content:Object.fromEntries(['image/png','image/jpeg','image/webp'].map(type=>[type,{schema:{type:'string',format:'binary',maxLength:2097152}}]))};
add('/v1/member-sync/requests/{id}/complete','post','Validate all batches; baseline previews instead of changing live members','members:sync','MemberSyncComplete');
add('/v1/member-sync/requests/{id}/fail','post','Fail own active collection without changing the roster','members:sync');
add('/v1/deliveries/{id}/receipt','post','Acknowledge actual private message delivery, separately from HTTP acceptance','deliveries:ack','BotReceipt');
add('/members/revision','get','Public member-data revision, without QQ or group details','query:read');
Object.assign(doc.paths['/members/revision'].get,{operationId:'members_revision',servers:[{url:'/api'}],security:[],'x-public-extension':true});
delete doc.paths['/members/revision'].get['x-required-scope'];
add('/admin/credentials/{id}/reveal','post','Reveal encrypted service token for current super_admin; no-store and audited; main6 and external encryption key required','website');
fs.writeFileSync(path.join(__dirname, '../docs/bot-openapi.yaml'), yaml.dump(doc, { lineWidth: 110, noRefs: true }));
console.log(`Documented ${id} additive Bot API operations`);
