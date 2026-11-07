import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { types } from 'pg'

export const quote = name => {
  if (typeof name !== 'string' || name.includes('\0')) throw Error('INVALID_IDENTIFIER')
  return '"' + name.replaceAll('"', '""') + '"'
}
export const pgTypes = { getTypeParser(oid, format = 'text') {
  if (format === 'binary') return types.getTypeParser(oid, format)
  if (oid === 20) return value => BigInt(value)
  if ([1082,1114,1184,1700].includes(oid)) return value => value
  return types.getTypeParser(oid, format)
} }
export const canonicalJson = value => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']'
  return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonicalJson(value[key])).join(',') + '}'
}
export function normalized(value) {
  if (value === null) return ['null']
  if (typeof value === 'bigint') return ['integer', String(value)]
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) throw Error('UNSAFE_INTEGER')
    return ['integer', String(value)]
  }
  if (typeof value === 'string') return ['text', value]
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) return ['bytes', Buffer.from(value).toString('base64')]
  throw Error('UNSUPPORTED_DATABASE_VALUE')
}
export function computeRowDigest(row, columns) {
  const data = columns.map(column => [column, normalized(row[column])])
  return createHash('sha256').update(canonicalJson(data)).digest('hex')
}
export function compareRows(a, b, pks) {
  for (const key of pks) {
    const x = a[key], y = b[key]
    if (x === y) continue
    if (x === null) return -1
    if (y === null) return 1
    if ((typeof x === 'number' || typeof x === 'bigint') && (typeof y === 'number' || typeof y === 'bigint')) return BigInt(x) < BigInt(y) ? -1 : 1
    return Buffer.compare(Buffer.from(String(x)), Buffer.from(String(y)))
  }
  return 0
}
export function computeTableDigest(rows, columns, pkColumn) {
  const sortedRows = [...rows].sort((a,b) => compareRows(a,b,pkColumn.split(',')))
  const hash = createHash('sha256')
  for (const row of sortedRows) hash.update(computeRowDigest(row, columns))
  return { rowCount: sortedRows.length, digest: hash.digest('hex'), sortedRows }
}
export async function fileDigest(filename) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(filename)) hash.update(chunk)
  return hash.digest('hex')
}
export async function databaseTables(client) {
  const res = await client.query(`SELECT n.nspname AS schema,c.relname AS table,
    ARRAY(SELECT a.attname::text FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum) AS columns,
    ARRAY(SELECT a.attname::text FROM pg_index i CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY k(attnum,pos)
      JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=k.attnum WHERE i.indrelid=c.oid AND i.indisprimary ORDER BY k.pos) AS pk
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname IN ('main','audit','bff') AND c.relkind='r' ORDER BY n.nspname,c.relname`)
  if (res.rows.some(row => !row.pk.length)) throw Error('TABLE_WITHOUT_PRIMARY_KEY')
  return res.rows
}
export async function postgresDigest(client, spec) {
  const cursor = 'guatswr_digest_cursor', hash = createHash('sha256')
  const columns = spec.columns
  await client.query(`DECLARE ${cursor} NO SCROLL CURSOR FOR SELECT ${columns.map(quote).join(',')} FROM ${quote(spec.schema)}.${quote(spec.table)} ORDER BY ${spec.pk.map(quote).join(',')}`)
  let rowCount = 0
  try {
    while (true) {
      const page = await client.query(`FETCH FORWARD 16 FROM ${cursor}`)
      if (!page.rows.length) break
      for (const row of page.rows) { hash.update(computeRowDigest(row, columns)); rowCount++ }
    }
  } finally { await client.query(`CLOSE ${cursor}`) }
  return { rowCount, digest: hash.digest('hex') }
}
export async function calibrateSequences(client) {
  const rows = (await client.query(`SELECT n.nspname AS schema,c.relname AS table,a.attname AS column,
    pg_get_serial_sequence(format('%I.%I',n.nspname,c.relname),a.attname) AS sequence
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
    WHERE n.nspname IN ('main','audit','bff') AND a.attidentity<>'' ORDER BY n.nspname,c.relname`)).rows
  const result = []
  for (const spec of rows) {
    const max = (await client.query(`SELECT MAX(${quote(spec.column)}) AS n FROM ${quote(spec.schema)}.${quote(spec.table)}`)).rows[0].n
    const maximum = max === null ? 0n : BigInt(max)
    if (maximum >= 9007199254740991n) throw Error('IDENTITY_CAPACITY_EXHAUSTED')
    await client.query('SELECT setval($1,$2,$3)', [spec.sequence, maximum > 0n ? String(maximum) : '1', maximum > 0n])
    result.push({ ...spec, maxId: String(maximum), nextId: String(maximum > 0n ? maximum+1n : 1n) })
  }
  return result
}
export async function verifySequences(client) {
  const rows = (await client.query(`SELECT n.nspname AS schema,c.relname AS table,a.attname AS column,
    pg_get_serial_sequence(format('%I.%I',n.nspname,c.relname),a.attname) AS sequence
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
    WHERE n.nspname IN ('main','audit','bff') AND a.attidentity<>'' ORDER BY n.nspname,c.relname`)).rows
  const details=[]
  for (const spec of rows) {
    const maximum = (await client.query(`SELECT MAX(${quote(spec.column)}) AS n FROM ${quote(spec.schema)}.${quote(spec.table)}`)).rows[0].n
    const sequence = (await client.query('SELECT seqincrement,seqmax FROM pg_sequence WHERE seqrelid=$1::regclass',[spec.sequence])).rows[0]
    const [schema,name] = spec.sequence.replaceAll('"','').split('.')
    const state=(await client.query(`SELECT last_value,is_called FROM ${quote(schema)}.${quote(name)}`)).rows[0]
    const next=BigInt(state.last_value)+(state.is_called?BigInt(sequence.seqincrement):0n)
    details.push({table:spec.schema+'.'+spec.table,maxId:maximum===null?null:String(maximum),nextId:String(next),safe:(maximum===null||next>BigInt(maximum))&&next<=BigInt(sequence.seqmax)})
  }
  return {passed:details.every(x=>x.safe),details}
}
