`upstream.mjs` is a deterministic in-memory v1 API fixture. It never starts or
writes to the real backend. `legacy.mjs` serves the already-built archived Vue
frontend read-only, without loading Vite config or creating files in frontend/.

Visual tests render the archive and Nuxt UI in the same browser/device/theme,
using native fonts on that host, and require zero differing component pixels.
