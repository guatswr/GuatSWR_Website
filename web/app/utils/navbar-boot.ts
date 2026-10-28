// Run before the application module graph loads. Only the document root is
// changed, so the server-rendered navbar remains intact for Vue hydration.
// SiteNavbar takes over after its first DOM update and removes these listeners.
export const NAVBAR_BOOT_SCRIPT = `(()=>{const w=window,d=document,r=d.documentElement;let compact=false;const sync=()=>{const next=w.scrollY>(compact?12:36);if(next!==compact){compact=next;r.toggleAttribute('data-nav-boot-compact',next)}};const stop=()=>{w.removeEventListener('scroll',sync);w.removeEventListener('pageshow',sync);r.removeAttribute('data-nav-boot-compact')};w.addEventListener('scroll',sync,{passive:true});w.addEventListener('pageshow',sync);d.addEventListener('club:navbar-ready',stop,{once:true});sync()})()`
