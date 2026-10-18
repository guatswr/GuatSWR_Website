// Drive the critical request start order from the server-rendered head:
// 1. `modulepreload`/`preload` link hints are hoisted ahead of the inlined
//    critical CSS. The parser reaches the hints right after the meta/title
//    tags instead of after tokenizing ~36 KB of inline <style>, so the browser
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
      // The charset `<meta>` stays first; `</title>` is the earliest anchor
      // that is still ahead of every inline style block.
      hoisted.join(''),
      prefetch.length
        ? `<script${nonce ? ` nonce="${nonce}"` : ''}>addEventListener("load",function(){var t=${JSON.stringify(prefetch)};for(var i=0;i<t.length;i++){document.head.insertAdjacentHTML("beforeend",t[i])}},{once:true})</script>`
        : '',
    ].join('')
    const head = html.head.join('')
    const anchor = head.indexOf('</title>')
    html.head = [
      anchor === -1 ? injected + head : head.slice(0, anchor + '</title>'.length) + injected + head.slice(anchor + '</title>'.length),
    ]
  })
})
