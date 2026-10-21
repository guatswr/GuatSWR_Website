# 项目结构与代码边界

更新：2026-10-21。适用于迁移中的 `revamp/*` 分支。

## 目录职责

```text
GuatSWR_Website/
├── backend/                  现有 Express 业务后端，独立 npm/Docker 生命周期
├── frontend/                 旧版 Vue/Vite，部署回滚与视觉参照
├── web/                      新版 Nuxt 应用
│   ├── app/                  页面、布局、组件、客户端状态与交互
│   ├── server/               BFF、会话、公开接口适配与服务端渲染工具
│   │   ├── api/              按 URL/HTTP 方法组织的薄路由入口
│   │   ├── lib/public-read/  查询、传输、日志投影等内部实现，显式导入
│   │   └── utils/            稳定的服务端调用入口与通用工具
│   ├── shared/               此 Nuxt 应用的前后端共用 DTO/纯逻辑
│   ├── tests/                单元/集成测试、E2E 与内存夹具
│   └── scripts/              Nuxt 应用专属的 E2E/性能工具
├── packages/shared/          独立的 TypeScript 类型、接口契约与 Zod 校验
├── scripts/revamp/           仓库级预算、产物、依赖边界与发布检查
├── scripts/*.sh              仓库布局下的备份/恢复脚本
├── docs/revamp/              当前进度、清单、迁移设计及验收证据
└── .tools/                   本机运行时、临时构建和调试证据，不入库
```

`pnpm-workspace.yaml` 只纳入 `web` 和 `packages/*`。旧前后端的 npm
锁文件仍是各自安装的依据；迁移期间不能删除它们或把旧系统强行纳入 pnpm。
`backend/`、`frontend/` 保留现有路径和部署方式，目录整理不修改 API 契约。

## 两种 shared 的区别

| 位置 | 应放内容 | 依赖边界 |
| --- | --- | --- |
| `packages/shared/src` | 独立契约、Zod schema、纯类型和纯映射 | 仅包内相对导入及已审阅的 `zod`；不依赖 Nuxt、Vue、Node 或业务服务 |
| `web/shared` | 仅此 Nuxt 应用使用的 Markdown AST、内容响应 DTO、SEO 公共契约 | 可依赖自身与 `@guatswr/shared`，不依赖 `app` 或 `server` |
| `web/app` | 界面、交互、浏览器数据访问 | 可依赖 shared，通过同源 API 访问服务端；不能导入 server、旧后端或 Node 内置模块 |
| `web/server` | 会话密封、上游凭据、缓存、净化和服务端接口适配 | 可依赖 shared；不要反向导入 UI 组件或浏览器状态 |

旧后端当前没有采用 `@guatswr/shared`。它仍是冻结接口的契约来源，不能把
“共享包”误解为已经与旧后端统一了实现。

运行 `pnpm check:boundaries` 检查上述前三层的源代码导入；CI 同样执行。
检查器使用 TypeScript AST 与 Vue SFC 解析器，覆盖静态导入、重导出、类型
导入及字面量动态导入，拒绝不能静态验证的计算式导入。它不解析模板中的
自动组件依赖，也不是运行时沙箱，不能代替秘密扫描、SSR 和安全测试。

## 模块整理规则

- `pages/` 与 `server/api/` 按路由组织，重构内部函数不改公开 URL。
- 公共组件归 `components/`，已有业务组件继续归 `home/`、`events/`、
  `admin/` 等子目录；只有真实复用时才提取到 `ui/`。
- 复杂服务端实现放到 `server/lib/<领域>/` 并显式导入，避免把每个内部函数
  都变成 Nitro 自动导入项。`server/utils/public-read.ts` 保留稳定的调用
  入口，内部的查询、传输和日志脱敏已分离，不新增重复实现。
- `composables/` 负责 Vue/Nuxt 生命周期绑定；纯计算、状态机和传输核心放在
  工具模块。后续按独立职责渐进拆分，不以文件行数作为唯一标准。
- 新的独立 package 应有明确的复用对象、依赖边界和发布/构建需求；不要仅为
  缩短目录列表创建新的 package 或层级。

## 测试与夹具

`web/tests/*.test.ts` 包含纯函数和真实 loopback HTTP 集成测试；E2E 位于
`web/tests/e2e/`，内存 API 位于 `web/tests/fixtures/`。位置不决定测试是否
完整，测试必须覆盖可观察的契约和行为。

- `public-contract.mjs` 是不可变公开夹具与可变后台夹具共用的纯投影规则。
  历史 null 状态、作者展示字段、缩略图和群史排序不能有两个不同版本。
- 每个 `createAuthUpstreamFixture()` 拥有自己的可变数据副本；集成测试使用
  临时端口，并在退出时关闭服务器。禁止修改导出的公共种子数组。
- E2E 使用现有隔离执行器：每批最多两项、单 worker、全新服务器。**同批
  两项仍共享服务器状态**，不能把它描述成逐用例隔离。会冲突的写操作应使用
  独立资源，或显式 `--max-per-batch 1`；不能用重试、放宽像素阈值掩盖污染。
- `fixture-boundaries.test.ts` 验证启用后台前后公开契约一致，并验证一个
  夹具的写入不会污染另一个实例或后续创建的实例。

## 工具、备份与证据

备份脚本的部署场景和路径差异见 [脚本说明](../scripts/README.md)。不要在
不检查数据目录、容器构建上下文和自动备份入口的情况下合并脚本。

已验证、可重复使用的工具应放在 `scripts/revamp/` 或 `web/scripts/`。
`.tools/` 仅保存本机运行材料；某次验收依赖的临时命令和配置仍须在工作流
报告中说明，不能把本机目录当成 CI 的隐式前提。

[当前状态](revamp/STATUS.md) 只承载当前结论、未完成事项和证据入口。
2026-10-21 之前的长账本保存在 [历史快照](revamp/STATUS-HISTORY-2026-10-21.md)，
各工作流报告仍在 [日志索引](revamp/logs/README.md)。已有历史证据不删除；新增
大体积 trace/截图优先保存到 CI artifacts，报告记录对应构建、路径与保留期限。
现有 CI artifacts 有期限，过期后不能声称仍可下载；长期必要的批准证据继续入库。
