# Environment icon assets (`/icons/env`)

Static, self-hosted copies of the exact marks the archived `/logs` page loaded
from `cdn.simpleicons.org`. They are served from our own origin because the
deployment CSP is `img-src 'self' data:`; nothing is proxied at runtime and no
external origin is allowed into the page.

## Source, version and licence

- Retrieved from `https://cdn.simpleicons.org/<slug>/<hex>` on 2026-10-19.
- The CDN serves [Simple Icons](https://simpleicons.org) releases, which are
  licensed **CC0 1.0 Universal** (public domain dedication). The colour in the
  URL is applied to the icon's `fill`.
- File names keep the archived pairing (`<slug>-<hex>.svg`) so the mapping in
  `app/utils/logs.ts` can be checked against the archived table one to one.

## Archived URLs that no longer resolve (HTTP 404 on 2026-10-19)

The archived page requested these and got a broken image; the slug list was
verified live before deciding on a fallback:

| Archived URL | Status | Local replacement |
| --- | --- | --- |
| `microsoftedge/0ea5e9` | 404 | `generic-browser-64748b.svg` (locally authored) |
| `chromium/4b5563` | 404 | `googlechrome-4285f4.svg` (closest available brand mark) |
| `internetexplorer/64748b` (browser fallback) | 404 | `generic-browser-64748b.svg` |
| `yandexbrowser/ff0000` | 404 | `generic-browser-64748b.svg` |
| `ucbrowser/ff9a00` | 404 | `generic-browser-64748b.svg` |
| `360/00a4ff` | 404 | `generic-browser-64748b.svg` |
| `windows/1e3a8a`, `windows/64748b` | 404 | `generic-desktop-64748b.svg` |
| `googlechromeos/4285f4` | 404 | `googlechrome-4285f4.svg` (closest available brand mark) |
| `devices/64748b` (device fallback) | 404 | `generic-device-64748b.svg` |

Microsoft-owned marks (Windows, Edge, Internet Explorer), Chromium and the
regional browser slugs are no longer published by Simple Icons, so no official
fixed asset exists for them at the archived URLs. The three `generic-*.svg`
files are authored locally for this project (no third-party licence, no brand
mark reproduced) and are only used where the archived URL is dead; every other
row keeps its real brand mark. `gnome`, `kde` and `ubuntu` are available and
were verified as alternatives where relevant.

## Regenerating

```sh
curl -sS -o public/icons/env/<slug>-<hex>.svg https://cdn.simpleicons.org/<slug>/<hex>
```

Do not add an arbitrary-URL image proxy or widen `img-src`; add the pinned file
here instead and document it in this table.
