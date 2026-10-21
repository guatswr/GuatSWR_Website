import { readdir, readFile } from 'node:fs/promises'
import { createRequire, isBuiltin } from 'node:module'
import { dirname, extname, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const webRequire = createRequire(new URL('../../web/package.json', import.meta.url))
const ts = webRequire('typescript')
const { parse } = webRequire('vue/compiler-sfc')
const inside = (path, directory) => path === directory || path.startsWith(`${directory}/`)

/** Import boundaries only; this does not replace runtime secret/SSR checks. */
export function importViolation(file, specifier) {
  const shared = inside(file, 'packages/shared/src')
  const nuxtShared = inside(file, 'web/shared')
  const browser = inside(file, 'web/app')
  if (!shared && !nuxtShared && !browser) return undefined
  if (isBuiltin(specifier)) return 'Node built-ins belong in server code'
  if (/^https?:/.test(specifier)) return 'remote code imports are not allowed'
  let target
  if (specifier.startsWith('.')) target = relative(root, resolve(root, dirname(file), specifier)).replaceAll('\\', '/')
  else if (/^(~~|@@)\//.test(specifier)) target = `web/${specifier.slice(3)}`
  else if (/^(~|@)\//.test(specifier)) target = `web/app/${specifier.slice(2)}`
  else if (specifier.startsWith('#shared/')) target = `web/shared/${specifier.slice(8)}`
  else if (specifier === '@guatswr/shared' || specifier.startsWith('@guatswr/shared/')) {
    if (shared) return 'shared package must use its own relative imports'
    return undefined
  }
  if (target) {
    target = relative(root, resolve(root, target)).replaceAll('\\', '/')
    const allowed = shared ? inside(target, 'packages/shared/src')
      : nuxtShared ? inside(target, 'web/shared')
        : ['web/app', 'web/shared', 'web/public', 'packages/shared/src'].some(directory => inside(target, directory))
    return allowed ? undefined : `crosses the ${shared ? 'shared package' : nuxtShared ? 'Nuxt shared' : 'browser'} boundary`
  }
  if (shared) return specifier === 'zod' ? undefined : 'shared runtime dependency must be explicitly reviewed'
  if (nuxtShared) return 'Nuxt shared may only import local shared code or @guatswr/shared'
  if (specifier.startsWith('#') && !['#imports', '#app', '#components', '#schema-org/app'].includes(specifier)) return 'unreviewed Nuxt alias in browser code'
  return undefined
}

export function inspectSource(file, source) {
  const scripts = extname(file) === '.vue'
    ? (() => {
        const { descriptor, errors } = parse(source, { filename: file })
        if (errors.length) throw Error(`Cannot parse ${file}: ${errors[0]}`)
        return [descriptor.script, descriptor.scriptSetup].filter(Boolean).map(script => script.content)
      })() : [source]
  const violations = []
  for (const script of scripts) {
    const ast = ts.createSourceFile(file, script, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    const check = node => {
      let specifier
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) specifier = node.moduleSpecifier
      else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) specifier = node.argument.literal
      else if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword
        || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
        specifier = node.arguments[0]
        if (!specifier || !ts.isStringLiteralLike(specifier)) violations.push({ file, specifier: '<computed>', reason: 'computed imports cannot be boundary checked' })
      }
      if (specifier && ts.isStringLiteralLike(specifier)) {
        const reason = importViolation(file, specifier.text)
        if (reason) violations.push({ file, specifier: specifier.text, reason })
      }
      ts.forEachChild(node, check)
    }
    check(ast)
  }
  return violations
}

export async function checkBoundaries() {
  const files = [], violations = []
  async function walk(directory) {
    for (const entry of await readdir(resolve(root, directory), { withFileTypes: true })) {
      const path = `${directory}/${entry.name}`
      if (entry.isDirectory()) await walk(path)
      else if (/\.(?:ts|vue)$/.test(path) && !path.endsWith('.test.ts')) files.push(path)
    }
  }
  for (const directory of ['packages/shared/src', 'web/shared', 'web/app']) await walk(directory)
  for (const file of files) violations.push(...inspectSource(file, await readFile(resolve(root, file), 'utf8')))
  return { checkedFiles: files.length, violations }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const result = await checkBoundaries()
  console.log(JSON.stringify(result, null, 2))
  if (result.violations.length) process.exitCode = 1
}
