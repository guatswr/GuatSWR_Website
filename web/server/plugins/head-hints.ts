// Drive the critical request start order from the server-rendered head:
// 1. `modulepreload`/`preload` link hints are hoisted ahead of the inlined
//    critical CSS, but always after the import map. The parser reaches the hints
//    before tokenizing the inline <style>, so the browser
//    dispatches the script fetches while it is still parsing CSS.
// 2. `rel="prefetch"` hints for chunks this page does not need yet (the other
//    layouts, error pages and their styles) are deferred to the `load` event.
//    They keep working for following navigations without competing with the
//    first paint for bandwidth and for the six connections per origin.
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('render:html', (html) => {
    const hoisted: string[] = []
    const prefetch: string[] = []
    const transform = (chunk: string) =>
      chunk
        .replace(/<link[^>]+rel="(?:modulepreload|preload)"[^>]*>/g, (tag) => {
          hoisted.push(tag)
          return ''
        })
        .replace(/<link[^>]+rel="prefetch"[^>]*>/g, (tag) => {
          prefetch.push(tag)
          return ''
        })
    html.head = html.head.map(transform)
    if (!hoisted.length && !prefetch.length) return

    const nonce = html.head.join('').match(/nonce="([^"]+)"/)?.[1]
    const injected = [
      hoisted.join(''),
      prefetch.length
        ? `<script${nonce ? ` nonce="${nonce}"` : ''}>addEventListener("load",function(){var t=${JSON.stringify(prefetch).replace(/</g, '\\u003c')};for(var i=0;i<t.length;i++){document.head.insertAdjacentHTML("beforeend",t[i])}},{once:true})</script>`
        : '',
    ].join('')
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
