import fs from 'node:fs'
import { createRequire } from 'node:module'
import { expect, it } from 'vitest'
const require = createRequire(import.meta.url)
const document = require('js-yaml').load(fs.readFileSync(new URL('../../docs/openapi.yaml', import.meta.url), 'utf8'))
const baseline = require('../../../docs/backend-modernization/evidence/baseline.json')

it('documents all 71 frozen operations with unique contract IDs and valid local references', () => {
  const operations = []
  for (const [route, item] of Object.entries(document.paths)) {
    for (const [method, operation] of Object.entries(item)) {
      if (!['get', 'post', 'put', 'delete', 'patch'].includes(method)) continue
      operations.push({ operation: method.toUpperCase() + ' ' + route.replace(/\{([^}]+)\}/g, ':$1'), id: operation['x-contract-id'], operationId: operation.operationId })
      expect(operation.responses['200']).toBeDefined()
      for (const name of [...route.matchAll(/\{([^}]+)\}/g)].map(match => match[1])) {
        const params = [...(item.parameters || []), ...(operation.parameters || [])].map(param => param.$ref ? param.$ref.slice(2).split('/').reduce((value, key) => value[key], document) : param)
        expect(params.some(param => param.name === name && param.in === 'path' && param.required)).toBe(true)
      }
    }
  }
  expect(operations.map(row => [row.operation, row.id]).sort()).toEqual(baseline.operations.map(row => [row.operation, row.id]).sort())
  expect(new Set(operations.map(row => row.operationId)).size).toBe(71)
  const walk = value => {
    if (!value || typeof value !== 'object') return
    if (value.$ref) {
      expect(value.$ref.startsWith('#/')).toBe(true)
      expect(value.$ref.slice(2).split('/').reduce((current, key) => current?.[key], document)).toBeDefined()
    }
    Object.values(value).forEach(walk)
  }
  walk(document)
})

it('describes trusted guest credentials and preserves public and privileged projections', () => {
  for (const [route, method] of [['/api/event/draft', 'post'], ['/api/event/{id}', 'put'], ['/api/upload/visitor', 'post']]) {
    expect(document.paths[route][method].security).toEqual([{ bearerAuth: [] }, { bffBridge: [], guestDraftProof: [] }])
  }
  expect(document.paths['/api/event/{id}/signup'].get.security).toEqual([{ bearerAuth: [] }, { bffBridge: [] }])
  expect(document.paths['/api/event/{id}/participants/public'].get.security).toEqual([])
  expect(document.paths['/api/event/admin/list'].get['x-required-role']).toBe('admin/super_admin')
  expect(document.paths['/api/event/{id}/settle'].post.requestBody.content['application/json'].schema.properties.status.enum).toBeUndefined()
})

it('keeps the 11 documented wire input models aligned with shared backend contracts', () => {
  const contracts = require('@guatswr/shared/backend-v1')
  const models = { AuthLoginRequest: 'loginSchema', ProfileUpdateRequest: 'profileSchema', RegisterRequest: 'registerSchema', AdminResetPasswordRequest: 'resetPasswordSchema', ActivityInput: 'activitySchema', MemberInput: 'memberSchema', HistoryInput: 'historySchema', ConfigUpdateRequest: 'configSchema', BotActivityNotify: 'activityNotifySchema', BotHistoryNotify: 'historyNotifySchema', BotMemberNotify: 'memberNotifySchema' }
  const clean = value => {
    if (Array.isArray(value)) return value.map(clean)
    if (!value || typeof value !== 'object') return value
    return Object.fromEntries(Object.entries(value).filter(([key]) => !['description', '$schema', 'x-wire-schema'].includes(key)).map(([key, item]) => [key, clean(item)]))
  }
  for (const [model, name] of Object.entries(models)) {
    expect(document.components.schemas[model]['x-wire-schema']).toBe(name)
    expect(clean(document.components.schemas[model])).toEqual(clean(contracts[name].toJSONSchema({ io: 'input', target: 'openapi-3.0', unrepresentable: 'any' })))
  }
  expect(document.components.schemas.EventPublic.properties).not.toHaveProperty('visitor_ip')
  expect(document.components.schemas.EventAdmin.properties).toHaveProperty('visitor_ip')
})
