# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: login.spec.ts >> login and client session boundary >> focuses the first invalid field when client validation fails
- Location: tests\e2e\login.spec.ts:181:3

# Error details

```
Test timeout of 30000ms exceeded.
```

# Page snapshot

```yaml
- generic [ref=e2]:
  - status [ref=e3]: 登录 | 桂航绯想天
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
          - button "当前自动 · 日间模式，切换为夜间模式" [ref=e29]
          - link "加入我们" [ref=e32] [cursor=pointer]:
            - /url: /join
            - generic [aria-hidden] [ref=e33]: 入社
    - main [ref=e37]:
      - generic [ref=e41]:
        - generic [ref=e42]:
          - heading "博丽神社办事处" [level=1] [ref=e43]
          - paragraph [ref=e44]: GuatSWR Administration
        - generic [ref=e45]:
          - generic [ref=e46]:
            - generic [ref=e47]: Username
            - textbox "Username" [invalid] [ref=e48]:
              - /placeholder: 请输入管理员账号
              - text: bad user
            - alert [ref=e49]: 用户名仅允许字母、数字、下划线和连字符
          - generic [ref=e50]:
            - generic [ref=e51]: Password
            - textbox "Password" [active] [ref=e52]:
              - /placeholder: 请输入密码
              - text: x
          - generic [ref=e53]:
            - generic [ref=e54]: 二步密码 (可选)
            - textbox "二步密码 (可选)" [ref=e55]:
              - /placeholder: 已启用二步密码时必填
          - button "登录系统" [disabled] [ref=e56]
        - generic [ref=e57]: 需要管理员账号？请联系Taropoi。
    - contentinfo [ref=e58]:
      - generic [ref=e59]:
        - generic [ref=e60]:
          - generic [ref=e61]:
            - paragraph [ref=e62]: 桂航绯想天
            - paragraph [ref=e63]: GUAT TOUHOU FANS CLUB
            - paragraph [ref=e64]: 桂林航天工业学院东方 Project 同好会。因幻想乡相识，也在校园里成为朋友。
            - link "加入我们" [ref=e65] [cursor=pointer]:
              - /url: /join
              - text: 加入我们
              - generic [aria-hidden] [ref=e66]: ↗
          - navigation "页脚导航" [ref=e67]:
            - paragraph [ref=e68]: 浏览
            - list [ref=e69]:
              - listitem [ref=e70]:
                - link "首页" [ref=e71] [cursor=pointer]:
                  - /url: /
              - listitem [ref=e72]:
                - link "活动" [ref=e73] [cursor=pointer]:
                  - /url: /events
              - listitem [ref=e74]:
                - link "活动回顾" [ref=e75] [cursor=pointer]:
                  - /url: /activities
              - listitem [ref=e76]:
                - link "成员" [ref=e77] [cursor=pointer]:
                  - /url: /members
              - listitem [ref=e78]:
                - link "群史" [ref=e79] [cursor=pointer]:
                  - /url: /history
              - listitem [ref=e80]:
                - link "社群链接" [ref=e81] [cursor=pointer]:
                  - /url: /social
          - generic [ref=e82]:
            - paragraph [ref=e83]: 保持联系
            - paragraph [ref=e84]: QQ 群
            - paragraph [ref=e85]: "123456789"
            - link "扫码入群" [ref=e86] [cursor=pointer]:
              - /url: /join
              - text: 扫码入群
              - generic [aria-hidden] [ref=e87]: ↗
            - generic [ref=e88]:
              - link "站点日志" [ref=e89] [cursor=pointer]:
                - /url: /logs
              - link "管理入口" [ref=e90] [cursor=pointer]:
                - /url: /login
        - generic [ref=e91]:
          - paragraph [ref=e92]: © 2026 桂航绯想天同好会
          - generic [ref=e93]:
            - link "晋ICP备2026001481号" [ref=e94] [cursor=pointer]:
              - /url: https://beian.miit.gov.cn/
            - generic [aria-hidden] [ref=e95]: "|"
            - link "萌ICP备20263036号" [ref=e96] [cursor=pointer]:
              - /url: https://icp.gov.moe/?keyword=20263036
            - generic [aria-hidden] [ref=e97]: ·
            - generic [ref=e98]: Designed by Taropoi
```