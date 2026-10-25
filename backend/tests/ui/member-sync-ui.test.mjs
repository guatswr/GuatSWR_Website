import { it,expect } from 'vitest'
import { chromium } from '@playwright/test'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import net from 'node:net'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fixture,token,get } from '../helpers/fixture.mjs'
const require=createRequire(import.meta.url)
const {botScopes}=require('@guatswr/shared/bot')

it('lets an administrator apply the baseline and complete a new member profile through the real browser UI',async()=>{
  const f=await fixture({env:{BOT_PLATFORM_ENABLED:'true'}}),admin={Authorization:`Bearer ${token()}`}
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
    await page.goto(origin+'/login')
    await page.getByLabel('Username').fill('owner');await page.getByLabel('Password',{exact:true}).fill('fixture-password')
    await page.getByRole('button',{name:'登录系统'}).click()
    await page.getByRole('button',{name:'进入管理端'}).click()
    await page.waitForURL(/\/admin$/);await page.goto(origin+'/admin/members')
    await page.getByRole('button',{name:'查看名单与关联QQ'}).click()
    await page.getByLabel('为 QQ 11111 选择旧档案').selectOption('1')
    await page.getByText('已关联：member',{exact:true}).waitFor({state:'visible'})
    await page.getByRole('button',{name:'核验并应用'}).click()
    await page.locator('.el-message-box__input input').fill('UI 核验通过')
    await page.locator('.el-message-box').getByRole('button',{name:/确定|OK/}).click()
    const card=page.getByTestId('admin-member-card').filter({hasText:'新成员测试'})
    await card.waitFor({state:'visible'})
    expect(await card.textContent()).toContain('待完善')
    await card.getByRole('button',{name:'编辑',exact:true}).click()
    await page.locator('#member-name').fill('人工昵称')
    await page.locator('#member-school').selectOption('桂航')
    await page.getByLabel('资料已核验完善').check()
    await page.getByRole('button',{name:'保存修改',exact:true}).click()
    await page.getByTestId('admin-member-card').filter({hasText:'人工昵称'}).waitFor({state:'visible'})
    const saved=await get(f.db,"SELECT name,school,follow_group_name,profile_status FROM members WHERE qq='22222'")
    expect(saved).toEqual({name:'人工昵称',school:'桂航',follow_group_name:0,profile_status:'complete'})
    await page.screenshot({path:path.resolve('../member-sync-ui.png'),fullPage:true})
    await page.goto(origin+'/members')
    await page.getByText('人工昵称',{exact:true}).waitFor({state:'visible'})
    expect(await page.locator('body').innerText()).not.toContain('22222')
  } finally {await browser?.close();if(child.exitCode===null){child.kill();await exited}}
})
