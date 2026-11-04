// QQ's normal Android WebView already sits below native status/title bars.
// Mark only the embedded client, not the standalone MQQBrowser app. CSS keeps
// the device inset in fullscreen/standalone mode. Run before the first paint;
// no Vue-owned nodes or server request/cache variants are needed.
export const VIEWPORT_BOOT_SCRIPT = String.raw`(()=>{const ua=navigator.userAgent;if(/\bAndroid\b/i.test(ua)&&/\bQQ\/[\d.]+/.test(ua))document.documentElement.setAttribute('data-qq-webview','')})()`
