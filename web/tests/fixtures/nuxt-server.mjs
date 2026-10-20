import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { exitWithParent } from './parent-watch.mjs'

// Allow a separately built artifact to be tested without replacing a running
// local preview. Import a file URL instead of interpolating a path into a shell.
exitWithParent()
await import(pathToFileURL(resolve(process.env.E2E_NUXT_OUTPUT ?? '.output', 'server/index.mjs')).href)
