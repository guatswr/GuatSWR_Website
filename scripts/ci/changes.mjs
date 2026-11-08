import { execFileSync } from 'node:child_process'
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const fullScope = (audit = true) => ({quality:true,postgres:true,web:true,audit})
const dependencyPath = file => /^(?:package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|\.npmrc|(?:web|backend|packages\/[^/]+)\/package\.json)$/.test(file) || file.startsWith('patches/') || file.startsWith('scripts/revamp/security-')

/** Unknown source paths retain all core checks; online audit follows dependency changes. */
export function classifyChanges(files, full = false) {
  if(full)return fullScope()
  const scope={quality:false,postgres:false,web:false,audit:files.some(dependencyPath)}
  for(const file of files){
    if((file.startsWith('docs/')&&/\.(md|png|jpe?g|webp|gif|svg|pdf)$/i.test(file))||/^\.github\/(ISSUE_TEMPLATE|PULL_REQUEST_TEMPLATE)\//.test(file)||/^(README(?:\.[^/]+)?|LICENSE(?:\.[^/]+)?|CONTRIBUTING\.md)$/.test(file))continue
    if(file.startsWith('web/')){
      scope.quality=scope.web=true
      if(/^web\/(server\/|shared\/|tests\/fixtures\/|nuxt\.config\.ts$|package\.json$)/.test(file))scope.postgres=true
    }else if(file.startsWith('backend/')){
      scope.quality=scope.postgres=scope.web=true
    }else return fullScope(scope.audit)
  }
  return scope
}

export function main(env = process.env) {
  const event = env.GITHUB_EVENT_PATH ? JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, 'utf8')) : {}
  const base = event.pull_request?.base?.sha ?? event.before
  const full = ['workflow_dispatch', 'schedule'].includes(env.GITHUB_EVENT_NAME) || !base || /^0+$/.test(base)
  let files = [], fallback = full
  if (!full) {
    try {
      files = execFileSync('git', ['diff', '--name-only', '--no-renames', '-z', base, 'HEAD'], { encoding: 'utf8' }).split('\0').filter(Boolean)
    } catch { fallback = true }
  }
  const scope = classifyChanges(files, fallback)
  const report = { base: base ?? null, full: fallback, files, scope }
  mkdirSync('.tools/ci', { recursive: true })
  writeFileSync('.tools/ci/scope.json', JSON.stringify(report, null, 2) + '\n')
  if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, Object.entries(scope).map(([key, value]) => `${key}=${value}\n`).join(''))
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, `## Check scope\n\n${fallback ? 'Full validation (manual/scheduled run, new branch or unavailable base).' : `${files.length} changed files; documentation-only changes skip code jobs.`}\n\n| Job | Required for this change |\n| --- | --- |\n${Object.entries(scope).map(([key, value]) => `| ${key} | ${value ? 'yes' : 'no'} |`).join('\n')}\n`)
  console.log(JSON.stringify(report, null, 2))
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) main()
