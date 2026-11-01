import assert from 'node:assert/strict'
import { constants, createHash, generateKeyPairSync, privateEncrypt } from 'node:crypto'

// Real signatures over deliberately malformed DigestInfo, rather than a string
// search for the patch. Keys are generated locally and never persisted.
export function forgeProbes(forge) {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 1024 })
  const key = forge.pki.publicKeyFromPem(publicKey.export({ type: 'spki', format: 'pem' }))
  const digest = createHash('sha256').update('security regression fixture').digest('latin1')
  const { asn1 } = forge
  const node = (type, constructed, value) => asn1.create(asn1.Class.UNIVERSAL, type, constructed, value)
  const oid = () => node(asn1.Type.OID, false, asn1.oidToDer(forge.oids.sha256).getBytes())
  const nil = (value = '') => node(asn1.Type.NULL, false, value)
  const garbage = () => node(asn1.Type.OCTETSTRING, false, 'interior padding')
  const signature = children => privateEncrypt({ key: privateKey, padding: constants.RSA_PKCS1_PADDING },
    Buffer.from(asn1.toDer(node(asn1.Type.SEQUENCE, true, [
      node(asn1.Type.SEQUENCE, true, children), node(asn1.Type.OCTETSTRING, false, digest),
    ])).getBytes(), 'latin1')).toString('latin1')
  return [
    ['accepts canonical SHA-256 with NULL', () => assert.equal(key.verify(digest, signature([oid(), nil()])), true)],
    ['accepts SHA-256 with omitted optional NULL', () => assert.equal(key.verify(digest, signature([oid()])), true)],
    ['rejects an incorrect digest', () => assert.equal(key.verify('wrong digest', signature([oid(), nil()])), false)],
    ['rejects garbage after nested NULL (CVE-2026-85393)', () => assert.throws(() => key.verify(digest, signature([oid(), nil(), garbage()])), /valid RSASSA-PKCS1-v1_5 DigestInfo/)],
    ['rejects an unexpected second nested element', () => assert.throws(() => key.verify(digest, signature([oid(), garbage()])), /valid RSASSA-PKCS1-v1_5 DigestInfo/)],
    ['rejects a non-empty NULL payload', () => assert.throws(() => key.verify(digest, signature([oid(), nil('padding')])), /valid RSASSA-PKCS1-v1_5 DigestInfo/)],
  ]
}

export function bracesProbes(braces) {
  const nested = depth => '{'.repeat(depth) + 'a,b' + '}'.repeat(depth)
  const boundedError = error => error instanceof SyntaxError && error.code === 'ERR_BRACES_MAX_DEPTH'
  const probes = [
    ['retains normal compile', () => assert.equal(braces.compile('src/{app,server}/**/*.ts'), 'src/(app|server)/**/*.ts')],
    ['retains ranges and expansion', () => assert.deepEqual(braces.expand('file-{1..3}.{js,ts}'), ['file-1.js', 'file-1.ts', 'file-2.js', 'file-2.ts', 'file-3.js', 'file-3.ts'])],
    ['accepts the supported depth boundary', () => { assert.doesNotThrow(() => braces.compile(nested(128))); assert.doesNotThrow(() => braces.expand(nested(128))) }],
    ['does not count quoted braces as nesting', () => assert.doesNotThrow(() => braces.compile('"' + '{'.repeat(400) + '"'))],
    ['does not count escaped braces as nesting', () => assert.doesNotThrow(() => braces.compile('\\{'.repeat(400)))],
    ['bounds parenthesis nesting', () => assert.throws(() => braces.compile('('.repeat(300) + 'a' + ')'.repeat(300)), boundedError)],
    ['cannot disable the bound using options', () => assert.throws(() => braces.compile(nested(300), { maxDepth: Infinity }), boundedError)],
  ]
  for (const method of ['parse', 'compile', 'expand', 'stringify']) {
    probes.push([`bounds deeply nested input in ${method}`, () => assert.throws(() => braces[method](nested(4000)), boundedError)])
  }
  for (const method of ['compile', 'expand', 'stringify']) {
    probes.push([`bounds externally supplied cyclic ASTs in ${method}`, () => {
      const ast = { type: 'root', nodes: [] }
      ast.nodes.push(ast)
      assert.throws(() => braces[method](ast), boundedError)
    }])
  }
  return probes
}

export function deepmergeProbes(merge) {
  const payload = () => JSON.parse('{"__proto__":{"inheritedAdmin":true}}')
  const safe = result => {
    assert.equal(Object.getPrototypeOf(result), Object.prototype)
    assert.equal(result.inheritedAdmin, undefined)
    assert.equal(Object.prototype.inheritedAdmin, undefined)
  }
  return [
    ['merges nested ordinary objects and arrays', () => assert.deepEqual(merge({ a: { x: 1 }, list: [1] }, { a: { y: 2 }, list: [2] }), { a: { x: 1, y: 2 }, list: [1, 2] })],
    ['keeps enumerable symbol keys', () => { const key = Symbol('fixture'); assert.equal(merge({}, { [key]: 1 })[key], 1) }],
    ['retains clone=false and customMerge behavior', () => {
      const child = { x: 1 }
      assert.equal(merge({}, { child }, { clone: false }).child, child)
      assert.deepEqual(merge({ list: [1] }, { list: [2] }, { customMerge: key => key === 'list' ? (_a, b) => b : undefined }), { list: [2] })
    }],
    ['does not poison an output when copying target keys', () => safe(merge(payload(), {}))],
    ['does not poison an output from a null-prototype target', () => safe(merge(Object.create(null), payload()))],
    ['does not poison an output with an own __proto__ on both sides', () => safe(merge(payload(), payload()))],
    ['protects nested object merges', () => safe(merge({ nested: Object.create(null) }, { nested: payload() }).nested)],
    ['preserves a dangerous-looking key as an own data property', () => {
      const result = merge(Object.create(null), payload())
      const descriptor = Object.getOwnPropertyDescriptor(result, '__proto__')
      assert.deepEqual(descriptor, { value: { inheritedAdmin: true }, writable: true, enumerable: true, configurable: true })
      safe(result)
    }],
  ]
}

export function minimatchProbes(api) {
  return [
    ['retains normal globstar/extglob matching', () => {
      assert.equal(api.minimatch('src/a.js', '**/*.{js,ts}', { optimizationLevel: 2 }), true)
      assert.equal(api.minimatch('src/a.txt', '**/*.{js,ts}', { optimizationLevel: 2 }), false)
    }],
    ['retains the makeRe API used by eslint-plugin-import-x', () => assert.equal(api.makeRe('src/**/*.js').test('src/a.js'), true)],
    ['bounds globstar-parent amplification using the upstream brace expansion budget', () => {
      const pattern = Array(9).fill('**/../a/b').join('/')
      const mm = new api.Minimatch(pattern, { optimizationLevel: 2, braceExpandMax: 32 })
      assert.ok(mm.globParts.length <= 32, `preprocessing amplified to ${mm.globParts.length} entries`)
    }],
    ['skips quadratic deduplication above the upstream 1000-entry cutoff', () => {
      const mm = new api.Minimatch('**/*.js')
      mm.partsMatch = () => { throw new Error('quadratic deduplication must not run') }
      const patterns = Array.from({ length: 1001 }, (_, i) => [String(i)])
      assert.equal(mm.secondPhasePreProcess(patterns), patterns)
    }],
  ]
}
