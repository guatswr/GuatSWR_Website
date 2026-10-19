# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: events-visual.spec.ts >> event pages match the archived dark layout
- Location: tests\e2e\events-visual.spec.ts:15:3

# Error details

```
Error: board-悬赏令-dark-desktop: pixels different from the archived site

expect(received).toBe(expected) // Object.is equality

Expected: 0
Received: 23901
```

# Page snapshot

```yaml
- generic [ref=e2]:
  - status [ref=e3]: 桂航绯想天 | 桂航绯想天
  - generic [ref=e4]:
    - link "跳到主要内容" [ref=e5] [cursor=pointer]:
      - /url: "#main-content"
    - navigation "主导航" [ref=e6]:
      - generic [ref=e8]:
        - link "桂航绯想天同好会首页" [ref=e9] [cursor=pointer]:
          - /url: /
          - img "桂航绯想天群头像" [ref=e10]
          - generic [ref=e11]:
            - generic [ref=e12]: 桂航绯想天
            - generic [ref=e13]: GUAT TOUHOU FANS CLUB
        - generic [ref=e14]:
          - link "首页" [ref=e15] [cursor=pointer]:
            - /url: /
            - generic [aria-hidden] [ref=e16]: "01"
            - text: 首页
          - button "活动" [ref=e18]:
            - generic [aria-hidden] [ref=e19]: "02"
            - text: 活动
          - link "成员" [ref=e22] [cursor=pointer]:
            - /url: /members
            - generic [aria-hidden] [ref=e23]: "03"
            - text: 成员
          - link "群史" [ref=e24] [cursor=pointer]:
            - /url: /history
            - generic [aria-hidden] [ref=e25]: "04"
            - text: 群史
          - link "社群链接" [ref=e26] [cursor=pointer]:
            - /url: /social
            - generic [aria-hidden] [ref=e27]: "05"
            - text: 社群链接
          - button "当前夜间模式，切换为日间模式" [ref=e29]
          - link "加入我们" [ref=e33] [cursor=pointer]:
            - /url: /join
            - generic [aria-hidden] [ref=e34]: 入社
    - main [ref=e38]:
      - generic [ref=e39]:
        - complementary [ref=e40]:
          - generic [ref=e41]:
            - generic [ref=e42]:
              - heading "活动导航" [level=2] [ref=e43]
              - paragraph [ref=e44]: Current Events
            - button "收起侧边栏" [expanded] [ref=e45]
          - navigation [ref=e48]:
            - link "悬赏令" [ref=e49] [cursor=pointer]:
              - /url: /events/bounty
              - generic [aria-hidden] [ref=e50]: 💰
            - link "对赌协议 达成契约" [ref=e54] [cursor=pointer]:
              - /url: /events/betting
              - generic [aria-hidden] [ref=e55]: ⚖️
              - generic [ref=e56]:
                - generic [ref=e57]: 对赌协议
                - generic [ref=e58]: 达成契约
            - link "STG 打飞机" [ref=e59] [cursor=pointer]:
              - /url: /events/stg
              - generic [aria-hidden] [ref=e60]: ✈
              - generic [ref=e61]:
                - generic [ref=e62]: STG
                - generic [ref=e63]: 打飞机
            - link "则则 ymyz" [ref=e64] [cursor=pointer]:
              - /url: /events/zetime
              - generic [aria-hidden] [ref=e65]: 🏆
              - generic [ref=e66]:
                - generic [ref=e67]: 则则
                - generic [ref=e68]: ymyz
            - link "聚会 线下面基" [ref=e69] [cursor=pointer]:
              - /url: /events/party
              - generic [aria-hidden] [ref=e70]: 🎉
              - generic [ref=e71]:
                - generic [ref=e72]: 聚会
                - generic [ref=e73]: 线下面基
        - generic [ref=e76]:
          - generic [ref=e77]:
            - paragraph [ref=e78]: LET'S MEET
            - heading "悬赏令" [level=1] [ref=e79]
            - paragraph [ref=e80]: 发布你的挑战与奖励，等待同好们来接单。
          - article [ref=e82]:
            - generic [ref=e83]:
              - generic [ref=e84]:
                - generic [ref=e85]:
                  - generic [ref=e86]:
                    - generic [ref=e87]: 悬赏令
                    - generic [ref=e88]: 已发布
                  - generic [ref=e90]:
                    - generic [ref=e91]: 剩余：
                    - text: 42天 13小时
                - heading "寻找第十位群友" [level=3] [ref=e92]
              - generic [ref=e93]:
                - generic [ref=e94]:
                  - generic [ref=e95]: 时间
                  - generic [ref=e96]: 11/30/2026, 11:59:00 PM
                - generic [ref=e97]:
                  - generic [ref=e98]: 发起
                  - generic [ref=e99]: Taropoi
                - generic [ref=e102]:
                  - generic [ref=e103]: 挑战
                  - generic [ref=e104]: 在群聊中找出隐藏的第十位群友。
                - generic [ref=e105]:
                  - generic [ref=e106]: 要求
                  - generic [ref=e107]: 提供有效线索。
                - generic [ref=e108]:
                  - generic [ref=e109]: REWARD
                  - generic [ref=e110]: 东方设定集一本
          - button "发布活动" [ref=e112]:
            - generic [aria-hidden] [ref=e113]: ＋
    - contentinfo [ref=e115]:
      - generic [ref=e116]:
        - generic [ref=e117]:
          - generic [ref=e118]:
            - paragraph [ref=e119]: 桂航绯想天
            - paragraph [ref=e120]: GUAT TOUHOU FANS CLUB
            - paragraph [ref=e121]: 桂林航天工业学院东方 Project 同好会。因幻想乡相识，也在校园里成为朋友。
            - link "加入我们" [ref=e122] [cursor=pointer]:
              - /url: /join
              - text: 加入我们
              - generic [aria-hidden] [ref=e123]: ↗
          - navigation "页脚导航" [ref=e124]:
            - paragraph [ref=e125]: 浏览
            - list [ref=e126]:
              - listitem [ref=e127]:
                - link "首页" [ref=e128] [cursor=pointer]:
                  - /url: /
              - listitem [ref=e129]:
                - link "活动" [ref=e130] [cursor=pointer]:
                  - /url: /events
              - listitem [ref=e131]:
                - link "活动回顾" [ref=e132] [cursor=pointer]:
                  - /url: /activities
              - listitem [ref=e133]:
                - link "成员" [ref=e134] [cursor=pointer]:
                  - /url: /members
              - listitem [ref=e135]:
                - link "群史" [ref=e136] [cursor=pointer]:
                  - /url: /history
              - listitem [ref=e137]:
                - link "社群链接" [ref=e138] [cursor=pointer]:
                  - /url: /social
          - generic [ref=e139]:
            - paragraph [ref=e140]: 保持联系
            - paragraph [ref=e141]: QQ 群
            - paragraph [ref=e142]: "123456789"
            - link "扫码入群" [ref=e143] [cursor=pointer]:
              - /url: /join
              - text: 扫码入群
              - generic [aria-hidden] [ref=e144]: ↗
            - generic [ref=e145]:
              - link "站点日志" [ref=e146] [cursor=pointer]:
                - /url: /logs
              - link "管理入口" [ref=e147] [cursor=pointer]:
                - /url: /login
        - generic [ref=e148]:
          - paragraph [ref=e149]: © 2026 桂航绯想天同好会
          - generic [ref=e150]:
            - link "晋ICP备2026001481号" [ref=e151] [cursor=pointer]:
              - /url: https://beian.miit.gov.cn/
            - generic [aria-hidden] [ref=e152]: "|"
            - link "萌ICP备20263036号" [ref=e153] [cursor=pointer]:
              - /url: https://icp.gov.moe/?keyword=20263036
            - generic [aria-hidden] [ref=e154]: ·
            - generic [ref=e155]: Designed by Taropoi
```

# Test source

```ts
  88  | /**
  89  |  * In-memory double for the proposed guest BFF paths. It is a test double only:
  90  |  * the real routes are declared as a central dependency, so no production code
  91  |  * ever treats these responses as existing.
  92  |  */
  93  | export async function stubGuestBff(
  94  |   page: Page,
  95  |   overrides: Partial<Pick<GuestBffState, 'draftId' | 'signup' | 'failSaveTimes' | 'saveStatus'>> = {}
  96  | ): Promise<GuestBffState> {
  97  |   const state: GuestBffState = {
  98  |     calls: [],
  99  |     draftId: 27,
  100 |     signup: null,
  101 |     uploads: 0,
  102 |     failSaveTimes: 0,
  103 |     saveStatus: 200,
  104 |     ...overrides
  105 |   }
  106 |   const jsonBody = (request: { postData: () => string | null }): unknown => {
  107 |     try {
  108 |       return JSON.parse(request.postData() ?? 'null')
  109 |     } catch {
  110 |       return null
  111 |     }
  112 |   }
  113 |   await page.route('**/api/bff/**', async (route) => {
  114 |     const request = route.request()
  115 |     const method = request.method()
  116 |     const path = new URL(request.url()).pathname
  117 |     state.calls.push({ method, path, body: method === 'GET' ? undefined : jsonBody(request) })
  118 |     if (path === '/api/bff/guest/events/draft' && method === 'POST')
  119 |       return route.fulfill({ json: { id: state.draftId } })
  120 |     if (path.endsWith('/signup')) {
  121 |       if (method === 'GET') return route.fulfill({ json: { data: state.signup } })
  122 |       if (method === 'POST') {
  123 |         const body = jsonBody(request)
  124 |         state.signup = body && typeof body === 'object' ? (body as Record<string, string>) : null
  125 |         return route.fulfill({ json: { message: '保存成功' } })
  126 |       }
  127 |       if (method === 'DELETE') {
  128 |         state.signup = null
  129 |         return route.fulfill({ status: 204, body: '' })
  130 |       }
  131 |     }
  132 |     if (path.startsWith('/api/bff/guest/upload/')) {
  133 |       state.uploads += 1
  134 |       return route.fulfill({ json: { url: `/uploads/img/avatar-${state.uploads}.png` } })
  135 |     }
  136 |     if (method === 'PUT' && path.startsWith('/api/bff/guest/events/')) {
  137 |       if (state.failSaveTimes > 0) {
  138 |         state.failSaveTimes -= 1
  139 |         return route.fulfill({ status: 500, json: { message: 'unavailable' } })
  140 |       }
  141 |       return route.fulfill({ status: state.saveStatus, json: { message: '保存成功' } })
  142 |     }
  143 |     return route.fulfill({ status: 404, json: { message: 'Not Found' } })
  144 |   })
  145 |   return state
  146 | }
  147 | 
  148 | /** Captures the same region from archive and new page; requires zero pixel diff. */
  149 | export async function compareRegion(
  150 |   archive: Locator,
  151 |   current: Locator,
  152 |   name: string,
  153 |   info: TestInfo
  154 | ): Promise<void> {
  155 |   const capture = { animations: 'disabled' as const, caret: 'hide' as const }
  156 |   const oldBytes = await archive.screenshot(capture)
  157 |   const newBytes = await current.screenshot(capture)
  158 |   writeFileSync(info.outputPath(`${name}-archive.png`), oldBytes)
  159 |   writeFileSync(info.outputPath(`${name}-nuxt.png`), newBytes)
  160 |   const oldImage = PNG.sync.read(oldBytes)
  161 |   const newImage = PNG.sync.read(newBytes)
  162 |   expect({ width: newImage.width, height: newImage.height }).toEqual({
  163 |     width: oldImage.width,
  164 |     height: oldImage.height
  165 |   })
  166 |   const diff = new PNG({ width: oldImage.width, height: oldImage.height })
  167 |   const pixels = pixelmatch(oldImage.data, newImage.data, diff.data, oldImage.width, oldImage.height, {
  168 |     threshold: 0.1
  169 |   })
  170 |   writeFileSync(info.outputPath(`${name}-diff.png`), PNG.sync.write(diff))
  171 |   writeFileSync(
  172 |     info.outputPath(`${name}-comparison.json`),
  173 |     JSON.stringify(
  174 |       {
  175 |         region: name,
  176 |         project: info.project.name,
  177 |         state: info.title,
  178 |         width: oldImage.width,
  179 |         height: oldImage.height,
  180 |         differingPixels: pixels,
  181 |         pixelmatchThreshold: 0.1,
  182 |         includeAntialias: false
  183 |       },
  184 |       null,
  185 |       2
  186 |     )
  187 |   )
> 188 |   expect(pixels, `${name}: pixels different from the archived site`).toBe(0)
      |                                                                      ^ Error: board-悬赏令-dark-desktop: pixels different from the archived site
  189 | }
  190 | 
  191 | /** The archived preloader is removed on mount; wait before capturing. */
  192 | export async function waitForArchiveReady(page: Page): Promise<void> {
  193 |   await page.waitForLoadState('networkidle')
  194 |   await page
  195 |     .locator('#pre-loading-screen')
  196 |     .waitFor({ state: 'detached', timeout: 15_000 })
  197 |     .catch(() => undefined)
  198 | }
  199 | 
```