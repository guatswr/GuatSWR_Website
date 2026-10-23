import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import process from 'node:process'
const require = createRequire(import.meta.url)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
// Node16 resolution follows package type. A private temporary CommonJS source
// package lets the same TypeScript use the require branch of dependency types.
const temporary = await fs.mkdtemp(path.join(root, '.build-cjs-'))
const cleanup = async () => {
  if (path.dirname(temporary) !== root || !path.basename(temporary).startsWith('.build-cjs-')) throw new Error('Unsafe build cleanup')
  await fs.rm(temporary, { recursive: true, force: true })
}
try {
  await fs.writeFile(path.join(temporary, 'package.json'), JSON.stringify({ type: 'commonjs' }))
  await fs.cp(path.join(root, 'src'), path.join(temporary, 'src'), { recursive: true, filter: filename => !filename.endsWith('.test.ts') })
  await fs.writeFile(path.join(temporary, 'tsconfig.json'), JSON.stringify({
    extends: path.join(root, 'tsconfig.json'), compilerOptions: {
      module: 'Node16', moduleResolution: 'Node16', verbatimModuleSyntax: false,
      noEmit: false, declaration: true, rootDir: './src', outDir: path.join(root, 'dist/cjs'),
    }, include: ['src/**/*.ts'], exclude: ['src/**/*.test.ts'],
  }))
  const result = spawnSync(process.execPath, [require.resolve('typescript/bin/tsc'), '-p', path.join(temporary, 'tsconfig.json')], { stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`CommonJS compilation failed (${result.status})`)
  await fs.writeFile(path.join(root, 'dist/cjs/package.json'), JSON.stringify({ type: 'commonjs' }) + '\n')
} finally {
  await cleanup()
}
