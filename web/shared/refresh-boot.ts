import { THEME_BOOT_SCRIPT } from './theme-boot'

export const REFRESH_FAIL_OPEN_MS = 800
export const REFRESH_FADE_MS = 100

// Pure shared code: server rendering and the client must use the same version.
export const REFRESH_BOOT_SCRIPT = `(()=>{try{
if(window.__clubRefreshTransition||performance.getEntriesByType('navigation')[0]?.type!=='reload'||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
${THEME_BOOT_SCRIPT};
const root=document.documentElement;
if(root.dataset.refreshPhase)return;
root.style.setProperty('--refresh-timeout','${REFRESH_FAIL_OPEN_MS}ms');
root.style.setProperty('--refresh-fade','${REFRESH_FADE_MS}ms');
root.dataset.refreshPhase='loading';
root.dataset.refreshInitializing='true';
let timer;
const clear=()=>{clearTimeout(timer);delete root.dataset.refreshPhase};
const dismiss=(immediate=false)=>{
if(immediate){clear();return}
if(root.dataset.refreshPhase!=='loading')return;
clearTimeout(timer);root.dataset.refreshPhase='leaving';timer=setTimeout(clear,${REFRESH_FADE_MS});
};
window.__clubRefreshTransition={dismiss};
timer=setTimeout(dismiss,${REFRESH_FAIL_OPEN_MS});
addEventListener('pageshow',event=>{if(event.persisted)clear()});
}catch{}})()`
