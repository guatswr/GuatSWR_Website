import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const js = await readFile('node_modules/dompurify/dist/purify.js')
const server=createServer((req,res)=>{if(req.url==='/purify.js'){res.writeHead(200,{'content-type':'application/javascript'});return res.end(js)}if(req.url.startsWith('/missing')){res.writeHead(404);return res.end()}res.writeHead(200,{'content-type':'text/html',...(req.url==='/strict'?{'content-security-policy':"script-src 'self'; script-src-attr 'none'"}:{})});res.end('<script src="/purify.js"></script><body>probe</body>')})
await new Promise(r=>server.listen(0,'127.0.0.1',r))
const browser=await chromium.launch({headless:true})
try{
 for(const mode of ['string','template','detached','inplace']) for(const path of ['/strict','/open']){
  const page=await browser.newPage();const logs=[];page.on('console',m=>logs.push(m.text()));await page.goto(`http://127.0.0.1:${server.address().port}${path}`)
  const result=await page.evaluate(async(mode)=>{let dirty='<img src="/missing" onerror="window.purifyProbe=1">'; if(mode==='template'||mode==='inplace'){const template=document.createElement('template');template.innerHTML=dirty;dirty=mode==='inplace'?template.content.firstChild:template.content;} if(mode==='detached'){const doc=document.implementation.createHTMLDocument('');doc.body.innerHTML=dirty;dirty=doc.body;} const clean=DOMPurify.sanitize(dirty,{USE_PROFILES:{html:true,mathMl:true},...(mode==='inplace'?{IN_PLACE:true}:{})});const html=typeof clean==='string'?clean:clean.outerHTML;await new Promise(r=>setTimeout(r,300));return {html,executed:window.purifyProbe??false}},mode)
  console.log(JSON.stringify({mode,path,...result,logs}));await page.close()
 }
}finally{await browser.close();await new Promise(r=>server.close(r))}
