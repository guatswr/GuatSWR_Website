import { createRequire } from 'node:module'
import { expect, it } from 'vitest'
const require = createRequire(import.meta.url)
const baseline = require('./zod3-baseline.json')
const schemas = require('@guatswr/shared/backend-v1')
const encode = value => value === undefined ? { $wireUndefined: true } : Array.isArray(value) ? value.map(encode)
  : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encode(item)])) : value
const decode = value => value && typeof value === 'object' && value.$wireUndefined === true ? undefined : Array.isArray(value) ? value.map(decode)
  : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, decode(item)])) : value

it.each(baseline.cases)('Zod3 frozen wire parity: $name / $label', entry => {
  let actual
  try {
    const parsed = schemas[entry.name].safeParse(decode(entry.input), { error: schemas.backendV1Error })
    actual = parsed.success ? { success: true, data: encode(parsed.data) }
      : { success: false, message: parsed.error.issues[0].message, path: parsed.error.issues[0].path }
  } catch (error) { actual = { throws: error.name, message: error.message } }
  expect(actual).toEqual(entry.expected)
})
