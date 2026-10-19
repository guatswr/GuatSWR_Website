# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: events-visual.spec.ts >> event pages match the archived light layout
- Location: tests\e2e\events-visual.spec.ts:15:3

# Error details

```
Error: expect(received).toEqual(expected) // deep equality

- Expected  - 2
+ Received  + 2

  Object {
-   "height": 1486,
-   "width": 914,
+   "height": 1507,
+   "width": 992,
  }
```

# Page snapshot

```yaml
- generic [ref=f2e2]:
  - status [ref=f2e3]: 桂航绯想天 | 桂航绯想天
  - generic [ref=f2e4]:
    - link "跳到主要内容" [ref=f2e5] [cursor=pointer]:
      - /url: "#main-content"
    - navigation "主导航" [ref=f2e6]:
      - generic [ref=f2e8]:
        - link "桂航绯想天同好会首页" [ref=f2e9] [cursor=pointer]:
          - /url: /
          - generic [ref=f2e10]:
            - generic [ref=f2e11]: 桂航绯想天
            - generic [ref=f2e12]: GUAT TOUHOU FANS CLUB
        - generic [ref=f2e13]:
          - button "当前日间模式，切换为夜间模式" [ref=f2e14]
          - button "打开导航菜单" [ref=f2e17]
    - main [ref=f2e20]:
      - generic [ref=f2e21]:
        - navigation "活动种类" [ref=f2e23]:
          - link "悬赏令" [ref=f2e24] [cursor=pointer]:
            - /url: /events/bounty
            - generic [aria-hidden] [ref=f2e25]: 💰
            - text: 悬赏令
          - link "对赌协议" [ref=f2e26] [cursor=pointer]:
            - /url: /events/betting
            - generic [aria-hidden] [ref=f2e27]: ⚖️
            - text: 对赌协议
          - link "STG" [ref=f2e28] [cursor=pointer]:
            - /url: /events/stg
            - generic [aria-hidden] [ref=f2e29]: ✈
            - text: STG
          - link "则则" [ref=f2e30] [cursor=pointer]:
            - /url: /events/zetime
            - generic [aria-hidden] [ref=f2e31]: 🏆
            - text: 则则
          - link "聚会" [ref=f2e32] [cursor=pointer]:
            - /url: /events/party
            - generic [aria-hidden] [ref=f2e33]: 🎉
            - text: 聚会
        - generic [ref=f2e36]:
          - generic [ref=f2e37]:
            - paragraph [ref=f2e38]: LET'S MEET
            - heading "STG" [level=1] [ref=f2e39]
            - paragraph [ref=f2e40]: 欢迎STGer报名参加！
          - article [ref=f2e42] [cursor=pointer]:
            - generic [ref=f2e43]:
              - generic [ref=f2e44]:
                - generic [ref=f2e45]:
                  - generic [ref=f2e46]:
                    - generic [ref=f2e47]: STG
                    - generic [ref=f2e48]: 报名中
                  - generic [ref=f2e50]:
                    - generic [ref=f2e51]: 剩余：
                    - text: 23天 9小时
                - heading "秋季 STG 大会" [level=3] [ref=f2e52]
              - img "cover" [ref=f2e55]
              - generic [ref=f2e56]:
                - generic [ref=f2e57]:
                  - generic [ref=f2e58]: 时间
                  - generic [ref=f2e59]: 11/11/2026, 8:00:00 PM
                - generic [ref=f2e60]: 秋季 STG 大会，欢迎新老群友参加。
                - generic [ref=f2e61]:
                  - generic [ref=f2e62]: 规则
                  - generic [ref=f2e63]: 三局两胜，禁止使用练习模式存档。
                - generic [ref=f2e64]:
                  - generic [ref=f2e65]: 奖品
                  - generic [ref=f2e66]: 冠军：东方周边礼包
                - generic [ref=f2e67]:
                  - generic [ref=f2e68]: Top Rankers
                  - generic [ref=f2e69]:
                    - generic [ref=f2e70]:
                      - generic [ref=f2e71]: "#1"
                      - generic [ref=f2e73]: Cirno
                    - generic [ref=f2e74]:
                      - generic [ref=f2e75]: "#2"
                      - generic [ref=f2e77]: Taropoi
              - generic [ref=f2e79]:
                - generic [ref=f2e80]: 活动参与
                - button "我要参加" [ref=f2e81]
          - dialog [ref=f2e82]:
            - generic [ref=f2e83]:
              - generic [ref=f2e84]:
                - heading "活动报名" [level=2] [ref=f2e85]
                - button "关闭对话框" [active] [ref=f2e86]: ×
              - generic [ref=f2e88]:
                - generic [ref=f2e89]:
                  - generic [ref=f2e90]:
                    - heading "报名信息" [level=4] [ref=f2e91]
                    - paragraph [ref=f2e92]: 保存后会记忆该设备上的填写内容
                  - button "删除报名" [ref=f2e93]
                - generic [ref=f2e94]:
                  - generic [ref=f2e95]:
                    - text: 常用ID
                    - textbox "常用ID" [ref=f2e96]
                  - generic [ref=f2e97]:
                    - text: 机签
                    - textbox "机签" [ref=f2e98]
                  - generic [ref=f2e99]:
                    - text: 机师来源
                    - combobox "机师来源" [ref=f2e100]:
                      - option "请选择" [selected]
                      - option "桂电"
                      - option "桂航"
                      - option "师大"
                      - option "桂工"
                      - option "桂旅"
                      - option "漓院"
                      - option "桂信"
                      - option "桂师"
                      - option "桂医"
                      - option "其他"
                  - generic [ref=f2e101]:
                    - text: QQ
                    - textbox "QQ" [ref=f2e102]
                  - generic [ref=f2e103]:
                    - button "上传头像" [ref=f2e104]
                    - generic [ref=f2e105]: 未上传
                  - button "保存报名" [ref=f2e107]
    - contentinfo [ref=f2e108]:
      - generic [ref=f2e109]:
        - generic [ref=f2e110]:
          - generic [ref=f2e111]:
            - paragraph [ref=f2e112]: 桂航绯想天
            - paragraph [ref=f2e113]: GUAT TOUHOU FANS CLUB
            - paragraph [ref=f2e114]: 桂林航天工业学院东方 Project 同好会。因幻想乡相识，也在校园里成为朋友。
            - link "加入我们" [ref=f2e115] [cursor=pointer]:
              - /url: /join
              - text: 加入我们
              - generic [aria-hidden] [ref=f2e116]: ↗
          - navigation "页脚导航" [ref=f2e117]:
            - paragraph [ref=f2e118]: 浏览
            - list [ref=f2e119]:
              - listitem [ref=f2e120]:
                - link "首页" [ref=f2e121] [cursor=pointer]:
                  - /url: /
              - listitem [ref=f2e122]:
                - link "活动" [ref=f2e123] [cursor=pointer]:
                  - /url: /events
              - listitem [ref=f2e124]:
                - link "活动回顾" [ref=f2e125] [cursor=pointer]:
                  - /url: /activities
              - listitem [ref=f2e126]:
                - link "成员" [ref=f2e127] [cursor=pointer]:
                  - /url: /members
              - listitem [ref=f2e128]:
                - link "群史" [ref=f2e129] [cursor=pointer]:
                  - /url: /history
              - listitem [ref=f2e130]:
                - link "社群链接" [ref=f2e131] [cursor=pointer]:
                  - /url: /social
          - generic [ref=f2e132]:
            - paragraph [ref=f2e133]: 保持联系
            - paragraph [ref=f2e134]: QQ 群
            - paragraph [ref=f2e135]: "123456789"
            - link "扫码入群" [ref=f2e136] [cursor=pointer]:
              - /url: /join
              - text: 扫码入群
              - generic [aria-hidden] [ref=f2e137]: ↗
            - generic [ref=f2e138]:
              - link "站点日志" [ref=f2e139] [cursor=pointer]:
                - /url: /logs
              - link "管理入口" [ref=f2e140] [cursor=pointer]:
                - /url: /login
        - generic [ref=f2e141]:
          - paragraph [ref=f2e142]: © 2026 桂航绯想天同好会
          - generic [ref=f2e143]:
            - link "晋ICP备2026001481号" [ref=f2e144] [cursor=pointer]:
              - /url: https://beian.miit.gov.cn/
            - generic [aria-hidden] [ref=f2e145]: "|"
            - link "萌ICP备20263036号" [ref=f2e146] [cursor=pointer]:
              - /url: https://icp.gov.moe/?keyword=20263036
            - generic [aria-hidden] [ref=f2e147]: ·
            - generic [ref=f2e148]: Designed by Taropoi
```

# Test source

```ts
  62  |     const url = new URL(route.request().url())
  63  |     await route.fulfill({
  64  |       response: await route.fetch({ url: `${UPSTREAM_ORIGIN}${url.pathname}${url.search}` })
  65  |     })
  66  |   })
  67  |   await page.route('**/uploads/**', async (route) => {
  68  |     const url = new URL(route.request().url())
  69  |     await route.fulfill({ response: await route.fetch({ url: `${UPSTREAM_ORIGIN}${url.pathname}` }) })
  70  |   })
  71  | }
  72  | 
  73  | export interface GuestBffCall {
  74  |   method: string
  75  |   path: string
  76  |   body: unknown
  77  | }
  78  | 
  79  | export interface GuestBffState {
  80  |   calls: GuestBffCall[]
  81  |   draftId: number
  82  |   signup: Record<string, string> | null
  83  |   uploads: number
  84  |   failSaveTimes: number
  85  |   saveStatus: number
  86  | }
  87  | 
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
> 162 |   expect({ width: newImage.width, height: newImage.height }).toEqual({
      |                                                              ^ Error: expect(received).toEqual(expected) // deep equality
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
  188 |   expect(pixels, `${name}: pixels different from the archived site`).toBe(0)
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