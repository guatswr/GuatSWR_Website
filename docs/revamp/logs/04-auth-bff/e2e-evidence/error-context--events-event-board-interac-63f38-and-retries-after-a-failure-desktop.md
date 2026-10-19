# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: events.spec.ts >> event board interactions >> shows the participant preview and retries after a failure
- Location: tests\e2e\events.spec.ts:212:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByTestId('event-modal').getByText('参赛名单读取失败，请重试')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByTestId('event-modal').getByText('参赛名单读取失败，请重试') with timeout 5000ms
  - waiting for getByTestId('event-modal').getByText('参赛名单读取失败，请重试')

```

```yaml
- status: 桂航绯想天 | 桂航绯想天
- link "跳到主要内容":
  - /url: "#main-content"
- navigation "主导航":
  - link "桂航绯想天同好会首页":
    - /url: /
    - img "桂航绯想天群头像"
    - text: 桂航绯想天 GUAT TOUHOU FANS CLUB
  - link "首页":
    - /url: /
  - button "活动"
  - link "成员":
    - /url: /members
  - link "群史":
    - /url: /history
  - link "社群链接":
    - /url: /social
  - button "当前自动 · 日间模式，切换为夜间模式"
  - link "加入我们":
    - /url: /join
- main:
  - complementary:
    - heading "活动导航" [level=2]
    - paragraph: Current Events
    - button "收起侧边栏" [expanded]
    - navigation:
      - link "悬赏令 赏金猎人":
        - /url: /events/bounty
      - link "对赌协议 达成契约":
        - /url: /events/betting
      - link "STG":
        - /url: /events/stg
      - link "则则 ymyz":
        - /url: /events/zetime
      - link "聚会 线下面基":
        - /url: /events/party
  - paragraph: LET'S MEET
  - heading "STG" [level=1]
  - paragraph: 欢迎STGer报名参加！
  - article:
    - text: STG 报名中 剩余： 23天 9小时
    - heading "秋季 STG 大会" [level=3]
    - img "cover"
    - text: "时间 11/11/2026, 8:00:00 PM 秋季 STG 大会，欢迎新老群友参加。 规则 三局两胜，禁止使用练习模式存档。 奖品 冠军：东方周边礼包 Top Rankers #1"
    - img
    - text: "Cirno #2"
    - img
    - text: Taropoi 活动参与
    - button "我要参加"
  - dialog "参赛名单":
    - heading "参赛名单" [level=2]
    - button "关闭对话框"
    - text: "Total: 1 无 ⑨ QQ: 123456 桂航 冰"
- contentinfo:
  - paragraph: 桂航绯想天
  - paragraph: GUAT TOUHOU FANS CLUB
  - paragraph: 桂林航天工业学院东方 Project 同好会。因幻想乡相识，也在校园里成为朋友。
  - link "加入我们":
    - /url: /join
  - navigation "页脚导航":
    - paragraph: 浏览
    - list:
      - listitem:
        - link "首页":
          - /url: /
      - listitem:
        - link "活动":
          - /url: /events
      - listitem:
        - link "活动回顾":
          - /url: /activities
      - listitem:
        - link "成员":
          - /url: /members
      - listitem:
        - link "群史":
          - /url: /history
      - listitem:
        - link "社群链接":
          - /url: /social
  - paragraph: 保持联系
  - paragraph: QQ 群
  - paragraph: "123456789"
  - link "扫码入群":
    - /url: /join
  - link "站点日志":
    - /url: /logs
  - link "管理入口":
    - /url: /login
  - paragraph: © 2026 桂航绯想天同好会
  - link "晋ICP备2026001481号":
    - /url: https://beian.miit.gov.cn/
  - link "萌ICP备20263036号":
    - /url: https://icp.gov.moe/?keyword=20263036
  - text: Designed by Taropoi
```

# Test source

```ts
  142 |       'aria-invalid',
  143 |       'false'
  144 |     )
  145 | 
  146 |     await modal.getByRole('button', { name: '提交审核' }).click()
  147 |     // First attempt fails and must not be retried automatically.
  148 |     await expect(modal.getByText('服务暂时不可用，请稍后重试')).toBeVisible()
  149 |     const draftCalls = bff.calls.filter((call) => call.path.endsWith('/events/draft'))
  150 |     expect(draftCalls).toHaveLength(1)
  151 |     expect(bff.calls.filter((call) => call.method === 'PUT')).toHaveLength(1)
  152 | 
  153 |     await modal.getByRole('button', { name: '提交审核' }).click()
  154 |     await expect(modal.getByText('提交成功，等待管理员审核')).toBeVisible()
  155 |     const puts = bff.calls.filter((call) => call.method === 'PUT')
  156 |     expect(puts).toHaveLength(2)
  157 |     expect(puts.every((call) => call.path === '/api/bff/guest/events/27')).toBe(true)
  158 |     expect(puts.at(-1)?.body).toMatchObject({ type: '悬赏令', title: '测试悬赏', submit: true })
  159 |     expect(bff.uploads).toBe(1)
  160 |   })
  161 | 
  162 |   test('reads, saves and cancels the visitor signup', async ({ page }) => {
  163 |     const bff = await stubGuestBff(page, {
  164 |       signup: {
  165 |         id: 3,
  166 |         common_id: '⑨',
  167 |         qq: '123456',
  168 |         avatar: '/uploads/img/avatar-0.png',
  169 |         machine_sign: '冰',
  170 |         pilot_source: '桂航'
  171 |       }
  172 |     })
  173 |     await page.goto('/events/stg')
  174 |     const trigger = page.getByRole('button', { name: '我要参加' }).first()
  175 |     test.skip((await trigger.count()) === 0, 'fixture has no open STG event')
  176 |     await trigger.click()
  177 |     const modal = page.getByTestId('event-modal')
  178 |     await expect(modal.locator('input[name="common_id"]')).toHaveValue('⑨')
  179 |     await expect(modal.locator('input[name="qq"]')).toHaveValue('123456')
  180 | 
  181 |     await modal.locator('input[name="common_id"]').fill('⑨改')
  182 |     await modal.getByRole('button', { name: '保存报名' }).click()
  183 |     await expect(modal.getByText('报名信息已保存')).toBeVisible()
  184 |     const post = bff.calls.find((call) => call.method === 'POST' && call.path.endsWith('/signup'))
  185 |     expect(post?.body).toMatchObject({ common_id: '⑨改', qq: '123456', pilot_source: '桂航' })
  186 | 
  187 |     await modal.getByRole('button', { name: '删除报名' }).click()
  188 |     await expect(modal.getByText('报名已删除')).toBeVisible()
  189 |     expect(bff.calls.some((call) => call.method === 'DELETE' && call.path.endsWith('/signup'))).toBe(
  190 |       true
  191 |     )
  192 |     await expect(modal.locator('input[name="common_id"]')).toHaveValue('')
  193 |   })
  194 | 
  195 |   test('distinguishes permission errors from an expired session', async ({ page }) => {
  196 |     const bff = await stubGuestBff(page, { saveStatus: 403 })
  197 |     await page.goto('/events/stg')
  198 |     const trigger = page.getByRole('button', { name: '我要参加' }).first()
  199 |     test.skip((await trigger.count()) === 0, 'fixture has no open STG event')
  200 |     await trigger.click()
  201 |     const modal = page.getByTestId('event-modal')
  202 |     await modal.locator('input[name="common_id"]').fill('⑨')
  203 |     await modal.locator('input[name="qq"]').fill('123456')
  204 |     await modal.getByRole('button', { name: '保存报名' }).click()
  205 |     await expect(modal.getByText('没有权限执行该操作')).toBeVisible()
  206 |     // The theme preference survives a permission error.
  207 |     const theme = await page.locator('html').getAttribute('data-theme')
  208 |     expect(['light', 'dark']).toContain(theme)
  209 |     expect(bff.calls.length).toBeGreaterThan(0)
  210 |   })
  211 | 
  212 |   test('shows the participant preview and retries after a failure', async ({ page, isMobile }) => {
  213 |     let attempts = 0
  214 |     await page.goto('/')
  215 |     await page.route('**/api/event?*', async (route) => {
  216 |       const response = await route.fetch()
  217 |       const body = (await response.json()) as { items: { id: number }[]; total: number }
  218 |       await route.fulfill({ json: { ...body, total: body.items.length } })
  219 |     })
  220 |     await page.route('**/participants/public', (route) => {
  221 |       attempts += 1
  222 |       if (attempts === 1) return route.fulfill({ status: 502, json: { message: 'no' } })
  223 |       return route.fulfill({
  224 |         json: [
  225 |           {
  226 |             id: 1,
  227 |             common_id: '⑨',
  228 |             qq: '123456',
  229 |             avatar: '',
  230 |             pilot_source: '桂航',
  231 |             machine_sign: '冰',
  232 |             created_at: ''
  233 |           }
  234 |         ]
  235 |       })
  236 |     })
  237 |     await openCategoryFromClient(page, isMobile, 'STG')
  238 |     const card = page.locator('article').first()
  239 |     test.skip((await card.count()) === 0, 'fixture has no STG event')
  240 |     await card.click()
  241 |     const modal = page.getByTestId('event-modal')
> 242 |     await expect(modal.getByText('参赛名单读取失败，请重试')).toBeVisible()
      |                                                   ^ Error: expect(locator).toBeVisible() failed
  243 |     await modal.getByRole('button', { name: '重新读取' }).click()
  244 |     await expect(modal.getByText('Total: 1')).toBeVisible()
  245 |     await expect(modal.getByText('QQ: 123456')).toBeVisible()
  246 |   })
  247 | 
  248 |   test('stops accepting signups after the Beijing deadline', async ({ page, isMobile }) => {
  249 |     await page.goto('/')
  250 |     await page.route('**/api/event?*', (route) =>
  251 |       route.fulfill({
  252 |         json: {
  253 |           total: 1,
  254 |           page: 1,
  255 |           limit: 50,
  256 |           items: [
  257 |             {
  258 |               id: 99,
  259 |               type: 'STG',
  260 |               title: '已截止比赛',
  261 |               status: 'published',
  262 |               content: { deadline: '2020-01-01T00:00' },
  263 |               created_by: 'admin',
  264 |               created_by_avatar: '',
  265 |               created_at: '',
  266 |               updated_at: ''
  267 |             }
  268 |           ]
  269 |         }
  270 |       })
  271 |     )
  272 |     await openCategoryFromClient(page, isMobile, 'STG')
  273 |     await page.getByRole('button', { name: '我要参加' }).first().click()
  274 |     const modal = page.getByTestId('event-modal')
  275 |     await expect(modal.getByText('报名已截止')).toBeVisible()
  276 |     await expect(modal.getByRole('button', { name: '保存报名' })).toBeDisabled()
  277 |   })
  278 | })
  279 | 
```