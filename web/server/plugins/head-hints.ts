// Drive the critical request start order from the server-rendered head:
// 1. Public SSR paints without JavaScript; don't compete for its first screen
//    with a speculative module graph. Private/login pages retain module hints.
//    Every retained hint is hoisted after the import map and before inline CSS.
// 2. Remove speculative SSR `prefetch` hints. They include private middleware,
//    auth validators and error pages, even on an anonymous public route.
//    NuxtLink still prefetches on explicit pointer/focus intent; dynamic imports
//    load normally when their owning route or interaction actually needs them.
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('render:html', (html, { event }) => {
    const path = event.path.split('?')[0] ?? ''
    const needsClientEntry = path === '/login' || path === '/admin' || path.startsWith('/admin/')
    const hoisted: string[] = []
    const transform = (chunk: string) =>
      chunk
        // Public SSR already contains its first screen. Let the module entry
        // request its dependencies normally instead of competing for bandwidth
        // with the document/images through dozens of speculative module hints.
        .replace(/<link[^>]+rel="modulepreload"[^>]*>/g, tag => needsClientEntry ? tag : '')
        .replace(/<link[^>]+rel="(?:modulepreload|preload)"[^>]*>/g, (tag) => {
          hoisted.push(tag)
          return ''
        })
        .replace(/<link[^>]+rel="prefetch"[^>]*>/g, '')
    html.head = html.head.map(transform)
    if (!hoisted.length) return
    const injected = hoisted.join('')
    const head = html.head.join('')
    /**
     * The hints must come *after* the import map, never before it. A
     * `modulepreload` resolves the module's own dependencies while preparing it,
     * and Nuxt's entry graph contains a `#entry` specifier that only the import
     * map can resolve — so a hint parsed first fails with
     * `Failed to resolve module specifier "#entry"`. That is a race against the
     * document parse, which is why it only appears on a warm HTTP cache, where
     * the preloaded chunks arrive before the parser has registered the map.
     * Injecting after the map keeps the ordering benefit (the hints are still
     * ahead of the ~36 KB of inlined critical CSS) without the race.
     */
    const importMapEnd = (() => {
      const map = /<script[^>]*type="importmap"[^>]*>[\s\S]*?<\/script>/.exec(head)
      return map ? map.index + map[0].length : -1
    })()
    const titleEnd = head.indexOf('</title>')
    const anchor = importMapEnd !== -1
      ? importMapEnd
      : titleEnd === -1 ? -1 : titleEnd + '</title>'.length
    html.head = [
      anchor === -1
        ? injected + head
        : head.slice(0, anchor) + injected + head.slice(anchor),
    ]
  })
})
