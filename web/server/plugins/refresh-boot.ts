import { REFRESH_BOOT_SCRIPT } from '../../shared/refresh-boot'

// Keep the boot code in Nitro's watched runtime graph. Capturing this string
// in nuxt.config leaves HTML on an old version when only the client module HMRs.
// This hook also runs for client-rendered admin pages. nuxt-security adds the
// per-response CSP nonce after project render hooks, as for the rest of head.
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('render:html', (html) => {
    html.head.unshift(`<script data-refresh-boot>${REFRESH_BOOT_SCRIPT}</script>`)
  })
})
