import { it,expect } from 'vitest'
import { chromium } from '@playwright/test'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import net from 'node:net'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fixture,token,get,run } from '../helpers/fixture.mjs'
const require=createRequire(import.meta.url)
const {botScopes}=require('@guatswr/shared/bot')

it('lets the owner manage member sync and manually issue and revoke scoped Bot API credentials',async()=>{
  const f=await fixture({env:{BOT_PLATFORM_ENABLED:'true',BOT_CREDENTIAL_ENCRYPTION_KEY:'ab'.repeat(32)}}),admin={Authorization:`Bearer ${token()}`}
  expect(await get(f.db,'SELECT COUNT(*) AS count FROM bot_credentials')).toEqual({count:0})
  const credential=(await f.http.post('/api/bot/admin/credentials').set(admin).send({name:'ui-sync',scopes:[...botScopes],groups:['123456']})).body
  const code=(await f.http.post('/api/bot/link-codes').set(admin).send({})).body.code
  await f.http.post('/api/bot/v1/identity/bind').set({Authorization:`Bearer ${credential.token}`}).send({qq:'99999',code})
  await f.http.put('/api/bot/admin/member-sync/settings').set(admin).send({enabled:false,credential_id:credential.id,groups:['123456'],interval_minutes:360,admin_user_ids:[1]})
  const job=(await f.http.post('/api/bot/admin/member-sync/requests').set(admin).send({group_id:'123456'})).body
  const bot={Authorization:`Bearer ${credential.token}`}
  await f.http.put(`/api/bot/v1/member-sync/requests/${job.id}/batches/1`).set(bot).send({members:[{qq:'11111'},{qq:'22222',group_card:'新成员测试'}]})
  await f.http.post(`/api/bot/v1/member-sync/requests/${job.id}/complete`).set(bot).send({complete:true,batch_count:1,member_count:2})
  const reserve=net.createServer();reserve.listen(0,'127.0.0.1');await once(reserve,'listening')
  const port=reserve.address().port;await new Promise(resolve=>reserve.close(resolve));const origin=`http://127.0.0.1:${port}`
  const entry=path.join(path.resolve(process.env.BACKEND_BFF_OUTPUT || '../web/.output'),'server/index.mjs')
  const child=spawn(process.execPath,[entry],{cwd:path.dirname(entry),env:{...process.env,NODE_ENV:'test',HOST:'127.0.0.1',NITRO_HOST:'127.0.0.1',PORT:String(port),NITRO_PORT:String(port),
    NUXT_API_BASE:f.origin,NUXT_BFF_BRIDGE_SECRET:f.context.env.BFF_BRIDGE_SECRET,NUXT_SESSION_PASSWORD:'isolated-member-ui-session-secret-at-least-32-characters',NUXT_BFF_AUTH_ALLOWED_ORIGINS:JSON.stringify([origin]),NUXT_BFF_AUTH_TRUSTED_PROXY_CIDRS:'[]',NUXT_BFF_AUTH_ALLOW_INSECURE_LOOPBACK_COOKIES:'true'},stdio:['ignore','pipe','pipe']})
  let logs='';child.stdout.on('data',data=>logs+=data);child.stderr.on('data',data=>logs+=data)
  const exited=once(child,'exit');let browser
  try {
    const deadline=Date.now()+15000
    for(;;){try{const response=await fetch(origin+'/api/bff/auth/session',{signal:AbortSignal.timeout(1000)});await response.arrayBuffer();break}catch{if(child.exitCode!==null||Date.now()>deadline)throw new Error(`UI startup failed: ${logs}`);await new Promise(resolve=>setTimeout(resolve,100))}}
    browser=await chromium.launch({headless:true})
    const page=await browser.newPage({viewport:{width:1440,height:1000}})
    await page.goto(origin+'/')
    // A successful HTTP response does not prove that the global stylesheet
    // survived the production build. Check the actual browser layout too.
    expect(await page.evaluate(()=>({
      margin:getComputedStyle(document.body).margin,
      navbarPosition:getComputedStyle(document.querySelector('.club-navbar')).position,
    }))).toEqual({margin:'0px',navbarPosition:'fixed'})
    await page.goto(origin+'/login')
    await page.getByLabel('Username').fill('owner');await page.getByLabel('Password',{exact:true}).fill('fixture-password')
    await page.getByRole('button',{name:'登录系统'}).click()
    await page.getByRole('button',{name:'进入管理端'}).click()
    await page.waitForURL(/\/admin$/);await page.goto(origin+'/admin/members')
    await page.getByRole('link',{name:'群成员同步',exact:true}).click()
    await page.waitForURL(origin+'/admin/bot?section=sync')
    await page.getByRole('button',{name:'查看名单与关联QQ'}).click()
    await page.getByLabel('为 QQ 11111 选择旧档案').selectOption('1')
    await page.getByText('已关联：member',{exact:true}).waitFor({state:'visible'})
    await page.getByRole('button',{name:'核验并应用'}).click()
    await page.locator('.el-message-box__input input').fill('UI 核验通过')
    await page.locator('.el-message-box').getByRole('button',{name:/确定|OK/}).click()
    await page.getByText('同步已应用',{exact:true}).waitFor({state:'visible'})
    await page.goto(origin+'/admin/members')
    const card=page.getByTestId('admin-member-card').filter({hasText:'新成员测试'})
    await card.waitFor({state:'visible'})
    expect(await card.textContent()).toContain('待完善')
    await card.getByRole('link',{name:'Bot 同步设置',exact:true}).click()
    await page.getByRole('link',{name:'编辑网站资料',exact:true}).click()
    await page.waitForURL(/\/admin\/members\?edit=/)
    await page.locator('#member-name').fill('人工昵称')
    await page.locator('#member-school').selectOption('桂航')
    await page.getByRole('button',{name:'保存修改',exact:true}).click()
    await page.getByTestId('admin-member-card').filter({hasText:'人工昵称'}).waitFor({state:'visible'})
    await page.getByTestId('admin-member-card').filter({hasText:'人工昵称'}).getByRole('link',{name:'Bot 同步设置',exact:true}).click()
    await page.getByLabel('资料已核验完善').check()
    await page.getByRole('button',{name:'保存 Bot 成员设置',exact:true}).click()
    await expect.poll(async()=> (await get(f.db,"SELECT profile_status FROM members WHERE qq='22222'")).profile_status).toBe('complete')
    const saved=await get(f.db,"SELECT name,school,follow_group_name,profile_status FROM members WHERE qq='22222'")
    expect(saved).toEqual({name:'人工昵称',school:'桂航',follow_group_name:0,profile_status:'complete'})
    await page.screenshot({path:path.resolve('../member-sync-ui.png'),fullPage:true})
    await page.goto(origin+'/members')
    await page.getByText('人工昵称',{exact:true}).waitFor({state:'visible'})
    expect(await page.locator('body').innerText()).not.toContain('22222')
    await page.goto(origin+'/admin/history')
    await page.getByLabel('按年份查看').selectOption('2026')
    await page.getByLabel('按月份查看').selectOption('01')
    await page.getByTestId('admin-history-card').filter({hasText:'history'}).getByRole('button',{name:'编辑',exact:true}).click()
    await page.getByLabel('日期精度').selectOption('month')
    await page.getByLabel('事件标题').fill('群史年月测试')
    await page.getByRole('button',{name:'保存修改',exact:true}).click()
    await page.getByTestId('admin-history-card').filter({hasText:'群史年月测试'}).waitFor({state:'visible'})
    expect(await get(f.db,'SELECT date,title FROM history WHERE id=1')).toEqual({date:'2026-01',title:'群史年月测试'})
    expect(await page.getByLabel('按年份查看').inputValue()).toBe('2026')
    await page.getByLabel('事件标题').fill('未保存草稿')
    await page.getByRole('link',{name:'Bot 管理',exact:true}).click()
    await page.getByRole('button',{name:'继续编辑',exact:true}).click()
    expect(await page.getByLabel('事件标题').inputValue()).toBe('未保存草稿')
    await page.getByRole('button',{name:'取消编辑',exact:true}).click()
    await page.getByRole('button',{name:'丢弃修改',exact:true}).click()
    // Only the site owner's explicit create action issues a secret.
    await page.goto(origin+'/admin/bot')
    await page.getByLabel('全选所有权限').check()
    expect(await page.locator('.bot-scope-list input:checked').count()).toBe(botScopes.length)
    await page.getByRole('button',{name:'仅公开查询',exact:true}).click()
    await page.getByLabel('凭据名称',{exact:true}).fill('手动查询凭据')
    await page.getByRole('button',{name:'创建凭据',exact:true}).click()
    await page.getByRole('textbox',{name:'Bot API 密钥',exact:true}).waitFor({state:'visible'})
    const createdToken=await page.getByRole('textbox',{name:'Bot API 密钥',exact:true}).inputValue()
    expect(createdToken).toMatch(/^gwb_[a-f0-9]{64}$/)
    const created=await get(f.db,"SELECT id,secret_hash,scopes FROM bot_credentials WHERE name='手动查询凭据'")
    expect(created.secret_hash).not.toBe(createdToken)
    expect(JSON.parse(created.scopes)).toEqual(['query:read'])
    expect(await page.evaluate(()=>JSON.stringify([Object.entries(localStorage),Object.entries(sessionStorage)]))).not.toContain(createdToken)
    expect((await f.http.get('/api/bot/v1/on-this-day').set({Authorization:`Bearer ${createdToken}`})).status).toBe(200)
    expect((await f.http.get('/api/bot/v1/subscriptions').set({Authorization:`Bearer ${createdToken}`})).status).toBe(403)
    expect(await page.evaluate(async()=> (await fetch('/api/bff/admin/bot-credentials',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'forbidden',scopes:['query:read']})})).status)).toBe(403)
    await page.getByRole('button',{name:'已保存，关闭密钥',exact:true}).click()
    await page.reload()
    const credentialCard=page.getByTestId('bot-credential-card').filter({hasText:'手动查询凭据'})
    await credentialCard.waitFor({state:'visible'})
    expect(await page.getByRole('textbox',{name:'Bot API 密钥',exact:true}).count()).toBe(0)
    const listed=await page.evaluate(async()=> (await fetch('/api/bff/admin/bot-credentials')).json())
    expect(JSON.stringify(listed)).not.toContain(createdToken)
    expect(JSON.stringify(listed)).not.toContain('secret_hash')
    await credentialCard.getByRole('button',{name:'查看 Token',exact:true}).click()
    await page.getByRole('dialog',{name:'Bot API 密钥',exact:true}).waitFor({state:'visible'})
    const tokenInViewport=await page.getByRole('textbox',{name:'Bot API 密钥',exact:true}).evaluate(element=>{const bounds=element.getBoundingClientRect();return bounds.top>=0 && bounds.bottom<=innerHeight})
    expect(tokenInViewport).toBe(true)
    const dialogBackground=await page.getByRole('dialog',{name:'Bot API 密钥',exact:true}).evaluate(element=>getComputedStyle(element).backgroundColor)
    expect(dialogBackground).not.toBe('rgba(0, 0, 0, 0)')
    expect(await page.getByRole('textbox',{name:'Bot API 密钥',exact:true}).inputValue()).toBe(createdToken)
    await page.evaluate(()=>window.dispatchEvent(new Event('blur')))
    await expect.poll(()=>page.getByRole('textbox',{name:'Bot API 密钥',exact:true}).count()).toBe(0)
    expect(await page.evaluate(async()=> (await fetch('/api/bff/admin/bot-credentials')).headers.get('cache-control'))).toContain('no-store')
    await page.screenshot({path:path.resolve('../bot-admin-ui.png'),fullPage:true})
    await credentialCard.getByRole('button',{name:'撤销',exact:true}).click()
    await page.locator('.el-message-box').getByRole('button',{name:'撤销凭据',exact:true}).click()
    await credentialCard.getByText('手动查询凭据 · 已撤销',{exact:true}).waitFor({state:'visible'})
    expect((await f.http.get('/api/bot/v1/on-this-day').set({Authorization:`Bearer ${createdToken}`})).status).toBe(401)
    const retryJob=await get(f.db,'SELECT id FROM bot_deliveries LIMIT 1')
    await run(f.db,"UPDATE bot_deliveries SET status='failed' WHERE id=?",[retryJob.id])
    await page.goto(origin+'/admin/bot?section=deliveries')
    const retryRow=page.getByRole('row').filter({hasText:retryJob.id})
    await retryRow.getByRole('button',{name:'重试投递',exact:true}).click()
    await page.getByText('已重新排队，等待投递',{exact:true}).waitFor({state:'visible'})
    expect((await get(f.db,'SELECT status FROM bot_deliveries WHERE id=?',[retryJob.id])).status).toBe('pending')
    await page.goto(origin+'/admin/bot?section=sync')
    await page.getByText('配置同步与手动采集',{exact:true}).click()
    await expect.poll(()=>page.getByLabel('Bot服务凭据',{exact:true}).inputValue()).toBe(credential.id)
    expect((await page.getByLabel('Bot服务凭据',{exact:true}).locator('option').allTextContents()).join(' ')).not.toContain('手动查询凭据')
    await page.getByRole('button',{name:'退出',exact:true}).click()
    await page.locator('.el-message-box').getByRole('button',{name:'退出登录',exact:true}).click()
    await page.waitForURL(/\/login(?:\?|$)/)
    // Begin the next role's login without the owner's previous return path.
    await page.goto(origin+'/login')
    // Logout changes layouts; let the incoming login page finish mounting
    // and checking its session before entering credentials into its fields.
    await page.waitForLoadState('networkidle')
    await page.getByLabel('Username').fill('admin');await page.getByLabel('Password',{exact:true}).fill('fixture-password')
    await page.getByRole('button',{name:'登录系统'}).click()
    await page.getByRole('button',{name:'进入管理端'}).click()
    await page.waitForURL(/\/admin$/)
    expect(await page.getByRole('link',{name:'Bot 管理',exact:true}).count()).toBe(1)
    await page.goto(origin+'/admin/members?pending=1')
    await page.waitForURL(origin+'/admin/bot?section=profiles')
    expect(await page.getByRole('link',{name:'凭据与权限',exact:true}).count()).toBe(0)
    expect(await page.getByRole('link',{name:'群成员同步',exact:true}).count()).toBe(0)
    expect(await page.evaluate(async()=> (await fetch('/api/bff/admin/bot-deliveries')).status)).toBe(403)
    expect(await page.evaluate(async()=> (await fetch('/api/bff/admin/bot-credentials')).status)).toBe(403)
    expect(await page.evaluate(async(id)=> (await fetch('/api/bff/admin/bot-credentials?id='+id,{method:'DELETE',headers:{'content-type':'application/json'},body:'{}'})).status,created.id)).toBe(403)
    expect(await page.evaluate(async()=> (await fetch('/api/bff/admin/bot-credentials',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'denied',scopes:['query:read']})})).status)).toBe(403)
    expect(await get(f.db,'SELECT COUNT(*) AS count FROM bot_credentials')).toEqual({count:2})
  } catch(error) {
    const failedPage=browser?.contexts()[0]?.pages()[0]
    if(failedPage){await failedPage.screenshot({path:path.resolve('../member-sync-ui-failure.png'),fullPage:true});console.error('UI failure state',JSON.stringify({url:failedPage.url(),alerts:await failedPage.getByRole('alert').allTextContents()}))}
    throw error
  } finally {await browser?.close();if(child.exitCode===null){child.kill();await exited}}
})
