import { createRequire } from 'node:module'
import { expect, it } from 'vitest'
import { fixture, token } from '../helpers/fixture.mjs'
const require = createRequire(import.meta.url)
const baseline = require('../contracts/zod3-baseline.json')
const routes = [
  ['loginSchema', 'username-1', 'post', '/api/auth/login'],
  ['registerSchema', 'password-2', 'post', '/api/auth/register'],
  ['profileSchema', 'avatar-1', 'put', '/api/auth/profile'],
  ['resetPasswordSchema', 'password-1', 'put', '/api/admin/users/4/password'],
  ['activitySchema', 'title-2', 'post', '/api/activities'],
  ['memberSchema', 'name-4', 'post', '/api/members'],
  ['historySchema', 'sort_order-26', 'post', '/api/history'],
  ['configSchema', 'value-1', 'post', '/api/config'],
  ['activityNotifySchema', 'root-6', 'post', '/api/bot/notify/activity'],
  ['historyNotifySchema', 'action-6', 'post', '/api/bot/notify/history'],
  ['memberNotifySchema', 'name-2', 'post', '/api/bot/notify/member'],
]
it.each(routes)('preserves frozen HTTP error for %s (%s)', async (name, label, method, route) => {
  const frozen = baseline.cases.find(entry => entry.name === name && entry.label === label)
  expect(frozen.expected.success).toBe(false)
  const instance = await fixture()
  const response = await instance.http[method](route).set('Authorization', `Bearer ${token()}`).send(frozen.input)
  expect(response.status).toBe(400)
  expect(response.body).toEqual({ message: frozen.expected.message })
})
