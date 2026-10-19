# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: events-visual.spec.ts >> event pages match the archived dark layout
- Location: tests\e2e\events-visual.spec.ts:15:3

# Error details

```
Error: board-悬赏令-dark-mobile: pixels different from the archived site

expect(received).toBe(expected) // Object.is equality

Expected: 0
Received: 3719
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
          - generic [ref=e10]:
            - generic [ref=e11]: 桂航绯想天
            - generic [ref=e12]: GUAT TOUHOU FANS CLUB
        - generic [ref=e13]:
          - button "当前夜间模式，切换为日间模式" [ref=e14]
          - button "打开导航菜单" [ref=e18]
    - main [ref=e21]:
      - generic [ref=e22]:
        - navigation "活动种类" [ref=e24]:
          - link "悬赏令" [ref=e25] [cursor=pointer]:
            - /url: /events/bounty
            - generic [aria-hidden] [ref=e26]: 💰
            - text: 悬赏令
          - link "对赌协议" [ref=e27] [cursor=pointer]:
            - /url: /events/betting
            - generic [aria-hidden] [ref=e28]: ⚖️
            - text: 对赌协议
          - link "STG" [ref=e29] [cursor=pointer]:
            - /url: /events/stg
            - generic [aria-hidden] [ref=e30]: ✈
            - text: STG
          - link "则则" [ref=e31] [cursor=pointer]:
            - /url: /events/zetime
            - generic [aria-hidden] [ref=e32]: 🏆
            - text: 则则
          - link "聚会" [ref=e33] [cursor=pointer]:
            - /url: /events/party
            - generic [aria-hidden] [ref=e34]: 🎉
            - text: 聚会
        - generic [ref=e37]:
          - generic [ref=e38]:
            - paragraph [ref=e39]: LET'S MEET
            - heading "悬赏令" [level=1] [ref=e40]
            - paragraph [ref=e41]: 发布你的挑战与奖励，等待同好们来接单。
          - article [ref=e43]:
            - generic [ref=e44]:
              - generic [ref=e45]:
                - generic [ref=e46]:
                  - generic [ref=e47]:
                    - generic [ref=e48]: 悬赏令
                    - generic [ref=e49]: 已发布
                  - generic [ref=e51]:
                    - generic [ref=e52]: 剩余：
                    - text: 42天 13小时
                - heading "寻找第十位群友" [level=3] [ref=e53]
              - generic [ref=e54]:
                - generic [ref=e55]:
                  - generic [ref=e56]: 时间
                  - generic [ref=e57]: 11/30/2026, 11:59:00 PM
                - generic [ref=e58]:
                  - generic [ref=e59]: 发起
                  - generic [ref=e60]: Taropoi
                - generic [ref=e63]:
                  - generic [ref=e64]: 挑战
                  - generic [ref=e65]: 在群聊中找出隐藏的第十位群友。
                - generic [ref=e66]:
                  - generic [ref=e67]: 要求
                  - generic [ref=e68]: 提供有效线索。
                - generic [ref=e69]:
                  - generic [ref=e70]: REWARD
                  - generic [ref=e71]: 东方设定集一本
          - button "发布活动" [ref=e73]:
            - generic [aria-hidden] [ref=e74]: ＋
    - contentinfo [ref=e76]:
      - generic [ref=e77]:
        - generic [ref=e78]:
          - generic [ref=e79]:
            - paragraph [ref=e80]: 桂航绯想天
            - paragraph [ref=e81]: GUAT TOUHOU FANS CLUB
            - paragraph [ref=e82]: 桂林航天工业学院东方 Project 同好会。因幻想乡相识，也在校园里成为朋友。
            - link "加入我们" [ref=e83] [cursor=pointer]:
              - /url: /join
              - text: 加入我们
              - generic [aria-hidden] [ref=e84]: ↗
          - navigation "页脚导航" [ref=e85]:
            - paragraph [ref=e86]: 浏览
            - list [ref=e87]:
              - listitem [ref=e88]:
                - link "首页" [ref=e89] [cursor=pointer]:
                  - /url: /
              - listitem [ref=e90]:
                - link "活动" [ref=e91] [cursor=pointer]:
                  - /url: /events
              - listitem [ref=e92]:
                - link "活动回顾" [ref=e93] [cursor=pointer]:
                  - /url: /activities
              - listitem [ref=e94]:
                - link "成员" [ref=e95] [cursor=pointer]:
                  - /url: /members
              - listitem [ref=e96]:
                - link "群史" [ref=e97] [cursor=pointer]:
                  - /url: /history
              - listitem [ref=e98]:
                - link "社群链接" [ref=e99] [cursor=pointer]:
                  - /url: /social
          - generic [ref=e100]:
            - paragraph [ref=e101]: 保持联系
            - paragraph [ref=e102]: QQ 群
            - paragraph [ref=e103]: "123456789"
            - link "扫码入群" [ref=e104] [cursor=pointer]:
              - /url: /join
              - text: 扫码入群
              - generic [aria-hidden] [ref=e105]: ↗
            - generic [ref=e106]:
              - link "站点日志" [ref=e107] [cursor=pointer]:
                - /url: /logs
              - link "管理入口" [ref=e108] [cursor=pointer]:
                - /url: /login
        - generic [ref=e109]:
          - paragraph [ref=e110]: © 2026 桂航绯想天同好会
          - generic [ref=e111]:
            - link "晋ICP备2026001481号" [ref=e112] [cursor=pointer]:
              - /url: https://beian.miit.gov.cn/
            - generic [aria-hidden] [ref=e113]: "|"
            - link "萌ICP备20263036号" [ref=e114] [cursor=pointer]:
              - /url: https://icp.gov.moe/?keyword=20263036
            - generic [aria-hidden] [ref=e115]: ·
            - generic [ref=e116]: Designed by Taropoi
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
      |                                                                      ^ Error: board-悬赏令-dark-mobile: pixels different from the archived site
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