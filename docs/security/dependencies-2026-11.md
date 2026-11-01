# Dependency security remediation — November 2026

The October 31 audit reported 21 unresolved advisories. Dependency updates and
verified compatibility backports address the affected installed behavior.

| Dependency | Reviewed resolution |
| --- | --- |
| Nuxt / its Vite and Nitro adapters | 4.6.2 → 4.6.3, including the dev-server disclosure and route-path security fixes |
| node-forge | 1.4.0 → official 1.4.2; remove the superseded local RSA patch, retain the six real-signature regression probes |
| seroval | Pin 1.7.5 to fix typed-array/RegExp serialization injection; this release passes the existing 24-hour age policy |
| glob | Replace 10/13 copies with official 14.0.3, which contains the cancellation fix from 14.0.2 |
| minimatch 11 consumers | Official 11.0.3, used by glob 14 |
| Legacy minimatch consumers | Consolidate onto 10.2.6 with the two preprocessing guards backported from upstream 11.0.1; retain `makeRe`, required by eslint-plugin-import-x |
| deepmerge | Patch 4.3.1; no official patched release exists for GHSA-gcqx-w48m-w2h4 at the time of this change |
| braces | Retain the previously reviewed 3.0.3 depth-bound patch |

Sources: [Nuxt 4.6.3](https://github.com/nuxt/nuxt/releases/tag/v4.6.3),
[minimatch advisory](https://github.com/advisories/GHSA-g3hv-75wg-m249),
[upstream minimatch preprocessing](https://github.com/isaacs/minimatch/blob/v11.0.1/src/index.ts),
[glob cancellation advisory](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4),
[deepmerge advisory](https://github.com/advisories/GHSA-gcqx-w48m-w2h4).

## Backports and compatibility

The minimatch backport keeps the established version 10 APIs. First-phase
globstar-parent splitting observes `braceExpandMax` (upstream default 100,000).
Second-phase optional pairwise deduplication is skipped above 1,000 patterns,
preserving matches while avoiding quadratic preprocessing. Both CommonJS and
ESM distributions are patched and behaviorally verified. Upstream 11.0.3 is an
explicitly reviewed fixed version; it cannot waive findings for an unpatched
10.2.6 copy. A global version 11 override was rejected during validation because
it removes `makeRe` and breaks the installed ESLint plugin.

The deepmerge patch defines destination keys as own writable, enumerable,
configurable data properties. This avoids invoking the inherited `__proto__`
setter while copying target keys, merging null-prototype inputs, or merging
nested objects. It preserves ordinary output prototypes, array merging,
symbols, `clone: false` and `customMerge`. Source, CommonJS and UMD code are
patched; both distributed entrypoints run eight behavioral probes. Five attack
checks failed against the original package before the patch.

`security-patches.json` locks advisory IDs, vulnerable ranges, package versions,
patch SHA-256 and installed file hashes. `check:security` accepts a version-based
finding only when the installed patch and its behavioral probes pass. The raw
audit stays in the report and still exits nonzero for those upstream versions.
No global advisory ignore, release-age exception or lowered severity threshold
is introduced.

Compatibility tests exercise actual archiver-utils and readdir-glob consumers,
CommonJS/ESM matching, the legacy regex API, aborted globbing and the reachable
installed dependency inventory. Windows-native path separators are normalized
only when comparing file selections in the test.

## Validation and reproduction

Use a fresh frozen install under Node 24.16.0 / pnpm 11.25.0. Installation and
verification use an isolated source copy without local environment files,
databases, uploads or backups. The old workspace installation is not evidence
for the new lockfile and must be refreshed before running the updated sources.

```sh
pnpm install --frozen-lockfile
pnpm check:security
pnpm test:ci
pnpm test:tooling
pnpm typecheck
pnpm lint
pnpm -r test
docker build --file web/Dockerfile --tag guatswr-security:web .
```

The online audit may retain raw minimatch/deepmerge findings because the package
versions are unchanged. The meaningful gate is **zero unresolved advisories**,
with each retained finding backed by the exact reviewed patch and probes.
Fresh production builds and runtime smoke checks verify the upgraded Nuxt
artifact, including SSR, per-response CSP nonces, feeds and image proxying.
