# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: events.spec.ts >> event board interactions >> shares one draft between upload and submission and retries with the same id
- Location: tests\e2e\events.spec.ts:120:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByTestId('event-modal').getByText('服务暂时不可用，请稍后重试')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByTestId('event-modal').getByText('服务暂时不可用，请稍后重试') with timeout 5000ms
  - waiting for getByTestId('event-modal').getByText('服务暂时不可用，请稍后重试')

```

```yaml
- status: 桂航绯想天 | 桂航绯想天
- link "跳到主要内容":
  - /url: "#main-content"
- navigation "主导航":
  - link "桂航绯想天同好会首页":
    - /url: /
    - text: 桂航绯想天 GUAT TOUHOU FANS CLUB
  - button "当前自动 · 日间模式，切换为夜间模式"
  - button "打开导航菜单"
- main:
  - navigation "活动种类":
    - link "悬赏令":
      - /url: /events/bounty
    - link "对赌协议":
      - /url: /events/betting
    - link "STG":
      - /url: /events/stg
    - link "则则":
      - /url: /events/zetime
    - link "聚会":
      - /url: /events/party
  - paragraph: LET'S MEET
  - heading "悬赏令" [level=1]
  - paragraph: 发布你的挑战与奖励，等待同好们来接单。
  - article:
    - text: 悬赏令 已发布 剩余： 42天 13小时
    - heading "寻找第十位群友" [level=3]
    - text: 时间 11/30/2026, 11:59:00 PM 发起
    - img
    - text: Taropoi 挑战 在群聊中找出隐藏的第十位群友。 要求 提供有效线索。 REWARD 东方设定集一本
  - dialog "发布新活动":
    - heading "发布新活动" [level=2]
    - button "关闭对话框"
    - paragraph: 填写活动信息，提交后由管理员审核。 标有 * 的项目为必填。
    - group "活动信息":
      - text: 活动信息 活动类型 *
      - combobox "活动类型 *":
        - option "悬赏令" [selected]
      - text: 标题 *
      - textbox "标题 *" [invalid]:
        - /placeholder: 给活动起一个名字
        - text: 测试悬赏
      - text: 发起人 ID
      - textbox "发起人 ID"
      - text: 发起人 QQ
      - textbox "发起人 QQ"
      - group "发起人头像 *":
        - text: 发起人头像 *
        - button "上传发起人头像": 选择图片
      - text: 挑战形式
      - textbox "挑战形式": 一命通关
      - text: 挑战要求
      - textbox "挑战要求"
      - text: 奖励 *
      - textbox "奖励 *": 吧唧
      - text: 参与限制
      - textbox "参与限制"
      - text: 截止时间
      - textbox "截止时间 北京时间；已有的文字时间也会保留。"
      - text: 北京时间；已有的文字时间也会保留。
    - alert: 请填写标题
    - button "提交审核"
  - button "发布活动"
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
  48  |       await expect(cards.nth(index).locator('h3')).not.toBeEmpty()
  49  |     }
  50  |     // The archived status labels and signup button are server-rendered.
  51  |     await expect(page.getByRole('button', { name: /我要参加|已结束/ }).first()).toBeVisible()
  52  |     // No interactive form chunk was needed to read the page.
  53  |     await expect(page.locator('[data-testid="event-modal"]')).toHaveCount(0)
  54  |     await context.close()
  55  |   })
  56  | })
  57  | 
  58  | async function openCategoryFromClient(page: Page, isMobile: boolean, label: string) {
  59  |   await page.getByRole('button', { name: isMobile ? '打开导航菜单' : '活动' }).click()
  60  |   if (isMobile) await page.getByRole('button', { name: '活动' }).click()
  61  |   await page.getByRole('link', { name: '进行中的活动' }).click()
  62  |   await expect(page.getByRole('heading', { level: 1 })).toHaveText('悬赏令')
  63  |   await page.getByRole('link', { name: label }).first().click()
  64  | }
  65  | 
  66  | test.describe('event board interactions', () => {
  67  |   test('keeps the archived empty state', async ({ page, isMobile }) => {
  68  |     await page.goto('/')
  69  |     await page.route('**/api/event?*', (route) =>
  70  |       route.fulfill({ json: { total: 0, page: 1, limit: 50, items: [] } })
  71  |     )
  72  |     await openCategoryFromClient(page, isMobile, '则则')
  73  |     await expect(page.getByText('这里冷冷清清的，什么都没有发生呢...')).toBeVisible()
  74  |   })
  75  | 
  76  |   test('opens the signup modal from mouse and keyboard, traps focus and returns it', async ({
  77  |     page
  78  |   }) => {
  79  |     await page.goto('/events/stg')
  80  |     const trigger = page.getByRole('button', { name: '我要参加' }).first()
  81  |     test.skip((await trigger.count()) === 0, 'fixture has no open STG event')
  82  | 
  83  |     await trigger.click()
  84  |     const modal = page.getByTestId('event-modal')
  85  |     await expect(modal).toBeVisible()
  86  |     await expect(modal.getByRole('heading', { name: '活动报名' })).toBeVisible()
  87  |     // Native dialog: the rest of the page is inert and focus is inside the modal.
  88  |     expect(await modal.evaluate((element) => element.matches(':modal'))).toBe(true)
  89  |     expect(
  90  |       await modal.evaluate((element) => element.contains(document.activeElement))
  91  |     ).toBe(true)
  92  |     expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden')
  93  | 
  94  |     await page.keyboard.press('Escape')
  95  |     await expect(modal).toHaveCount(0)
  96  |     await expect(trigger).toBeFocused()
  97  |     expect(await page.evaluate(() => document.body.style.overflow)).toBe('')
  98  | 
  99  |     // Keyboard activation works the same way.
  100 |     await trigger.focus()
  101 |     await page.keyboard.press('Enter')
  102 |     await expect(page.getByTestId('event-modal')).toBeVisible()
  103 |     await page.keyboard.press('Escape')
  104 |     await expect(page.getByTestId('event-modal')).toHaveCount(0)
  105 |   })
  106 | 
  107 |   test('validates the form and focuses the first invalid field', async ({ page }) => {
  108 |     const bff = await stubGuestBff(page)
  109 |     await page.goto('/events/bounty')
  110 |     await page.getByRole('button', { name: '发布活动' }).click()
  111 |     const modal = page.getByTestId('event-modal')
  112 |     await expect(modal).toBeVisible()
  113 |     await modal.getByRole('button', { name: '提交审核' }).click()
  114 |     await expect(modal.getByText('请填写标题')).toBeVisible()
  115 |     await expect(modal.locator('input[name="title"]')).toBeFocused()
  116 |     // Validation never reached the network.
  117 |     expect(bff.calls).toEqual([])
  118 |   })
  119 | 
  120 |   test('shares one draft between upload and submission and retries with the same id', async ({
  121 |     page
  122 |   }) => {
  123 |     const bff = await stubGuestBff(page, { failSaveTimes: 1 })
  124 |     await page.goto('/events/bounty')
  125 |     await page.getByRole('button', { name: '发布活动' }).click()
  126 |     const modal = page.getByTestId('event-modal')
  127 |     await modal.locator('input[name="title"]').fill('测试悬赏')
  128 |     await modal.locator('input[name="challenge"]').fill('一命通关')
  129 |     await modal.locator('input[name="reward"]').fill('吧唧')
  130 |     await modal
  131 |       .locator('input[type="file"]')
  132 |       .setInputFiles({
  133 |         name: 'avatar.png',
  134 |         mimeType: 'image/png',
  135 |         buffer: Buffer.from(
  136 |           'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  137 |           'base64'
  138 |         )
  139 |       })
  140 |     await expect(modal.getByText('已上传头像')).toHaveCount(0)
  141 |     await expect(modal.locator('button[aria-label="上传发起人头像"]')).toHaveAttribute(
  142 |       'aria-invalid',
  143 |       'false'
  144 |     )
  145 | 
  146 |     await modal.getByRole('button', { name: '提交审核' }).click()
  147 |     // First attempt fails and must not be retried automatically.
> 148 |     await expect(modal.getByText('服务暂时不可用，请稍后重试')).toBeVisible()
      |                                                    ^ Error: expect(locator).toBeVisible() failed
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
  242 |     await expect(modal.getByText('参赛名单读取失败，请重试')).toBeVisible()
  243 |     await modal.getByRole('button', { name: '重新读取' }).click()
  244 |     await expect(modal.getByText('Total: 1')).toBeVisible()
  245 |     await expect(modal.getByText('QQ: 123456')).toBeVisible()
  246 |   })
  247 | 
  248 |   test('stops accepting signups after the Beijing deadline', async ({ page, isMobile }) => {
```