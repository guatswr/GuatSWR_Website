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
          - generic [ref=e10]:
            - generic [ref=e11]: 桂航绯想天
            - generic [ref=e12]: GUAT TOUHOU FANS CLUB
        - generic [ref=e13]:
          - button "当前自动 · 日间模式，切换为夜间模式" [ref=e14]
          - button "打开导航菜单" [ref=e17]
    - main [ref=e20]:
      - generic [ref=e24]:
        - generic [ref=e25]:
          - heading "博丽神社办事处" [level=1] [ref=e26]
          - paragraph [ref=e27]: GuatSWR Administration
        - generic [ref=e28]:
          - generic [ref=e29]:
            - generic [ref=e30]: Username
            - textbox "Username" [invalid] [ref=e31]:
              - /placeholder: 请输入管理员账号
              - text: bad user
            - alert [ref=e32]: 用户名仅允许字母、数字、下划线和连字符
          - generic [ref=e33]:
            - generic [ref=e34]: Password
            - textbox "Password" [active] [ref=e35]:
              - /placeholder: 请输入密码
              - text: x
          - generic [ref=e36]:
            - generic [ref=e37]: 二步密码 (可选)
            - textbox "二步密码 (可选)" [ref=e38]:
              - /placeholder: 已启用二步密码时必填
          - button "登录系统" [disabled] [ref=e39]
        - generic [ref=e40]: 需要管理员账号？请联系Taropoi。
    - contentinfo [ref=e41]:
      - generic [ref=e42]:
        - generic [ref=e43]:
          - generic [ref=e44]:
            - paragraph [ref=e45]: 桂航绯想天
            - paragraph [ref=e46]: GUAT TOUHOU FANS CLUB
            - paragraph [ref=e47]: 桂林航天工业学院东方 Project 同好会。因幻想乡相识，也在校园里成为朋友。
            - link "加入我们" [ref=e48] [cursor=pointer]:
              - /url: /join
              - text: 加入我们
              - generic [aria-hidden] [ref=e49]: ↗
          - navigation "页脚导航" [ref=e50]:
            - paragraph [ref=e51]: 浏览
            - list [ref=e52]:
              - listitem [ref=e53]:
                - link "首页" [ref=e54] [cursor=pointer]:
                  - /url: /
              - listitem [ref=e55]:
                - link "活动" [ref=e56] [cursor=pointer]:
                  - /url: /events
              - listitem [ref=e57]:
                - link "活动回顾" [ref=e58] [cursor=pointer]:
                  - /url: /activities
              - listitem [ref=e59]:
                - link "成员" [ref=e60] [cursor=pointer]:
                  - /url: /members
              - listitem [ref=e61]:
                - link "群史" [ref=e62] [cursor=pointer]:
                  - /url: /history
              - listitem [ref=e63]:
                - link "社群链接" [ref=e64] [cursor=pointer]:
                  - /url: /social
          - generic [ref=e65]:
            - paragraph [ref=e66]: 保持联系
            - paragraph [ref=e67]: QQ 群
            - paragraph [ref=e68]: "123456789"
            - link "扫码入群" [ref=e69] [cursor=pointer]:
              - /url: /join
              - text: 扫码入群
              - generic [aria-hidden] [ref=e70]: ↗
            - generic [ref=e71]:
              - link "站点日志" [ref=e72] [cursor=pointer]:
                - /url: /logs
              - link "管理入口" [ref=e73] [cursor=pointer]:
                - /url: /login
        - generic [ref=e74]:
          - paragraph [ref=e75]: © 2026 桂航绯想天同好会
          - generic [ref=e76]:
            - link "晋ICP备2026001481号" [ref=e77] [cursor=pointer]:
              - /url: https://beian.miit.gov.cn/
            - generic [aria-hidden] [ref=e78]: "|"
            - link "萌ICP备20263036号" [ref=e79] [cursor=pointer]:
              - /url: https://icp.gov.moe/?keyword=20263036
            - generic [aria-hidden] [ref=e80]: ·
            - generic [ref=e81]: Designed by Taropoi
```