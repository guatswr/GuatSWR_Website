# Bot 平台扩展 · 2026-10-25

这是 v2.0.0 之后扩展的实现记录，不改变 BM-35 冻结候选及原生产状态。本记录形成于功能提交前；尚未发行或部署，未迁移原数据库，未创建真实 Bot 密钥，未向 AstrBot 或 QQ 发送消息。用户原有的两个 BFF IP/Cookie 修改和 googlebot 脚本保持原样。

## 交付

- 新增 23 个接口：服务凭据、订阅、投递查询/补发、网站绑定码、Bot 绑定、公开查询、报名查询/写入/取消、待审查询/审核。旧 71 个业务操作保留；新增独立 OpenAPI，不改冻结 v1 契约台账。
- 凭据为随机 256 位，只存 SHA-256 摘要；按 scope、群、凭据归属限制；可以撤销。管理接口要求网站超级管理员 JWT，敏感管理写入事务内重新校验当前角色及令牌版本。
- 主库新增 main-004-bot Expand（6 张新表、报名表添加一个身份字段和唯一索引），审计库仍为 2；不修改旧 SQL/checksum。main3 在开关关闭时仍可启动；显式启用而未升级时拒绝启动。
- 活动/内容/报名变更与通知意图同事务；网络发送在事务外。持久租约、最多 5 次自动重试、稳定 event_id/delivery_id、失败/跳过人工补发、退订/撤销取消。接收端必须按 delivery_id 持久去重，不承诺 QQ 消息 exactly-once。
- 提醒按北京时间解析真实 deadline/time，按订阅提前量生成；投递前再检查改期、状态及订阅，取消过期任务。单批 100 活动轮转，不承诺分钟级 SLA。
- 五分钟一次性绑定码，仅存摘要；游客使用受信 BFF 会话的随机 owner，不使用服务端 IP 作为 QQ 身份。绑定网站账号时共用原账号报名；游客需 BFF 传同一个 owner 才能互通，旧 IP 报名不自动认领。
- Bot 审核必须绑定当前网站管理员，仅接受 pending→published/rejected，理由/身份/结果和通知原子提交；私有审核与绑定审计在后端和 BFF 公开日志中均替换为固定描述。
- Bot 契约独立导出 `@guatswr/shared/bot`，不从公共根入口导出，避免公开页载入 Bot 校验代码。ESM、CommonJS 和发布声明保持一致。

接口与接入步骤见 [BOT-API](../../../backend/docs/BOT-API.md)，运行时文档 `/api/bot/docs/openapi.yaml`。`BOT_PLATFORM_ENABLED` 默认 false。AstrBot 插件指令、持久接收端去重、网站绑定 UI/BFF owner 会话接线不在这次后端实现内。

## 验证环境与命令

Windows，固定 `.tools/node-24.16.0/node.exe`，SQLite 3.44.2。源码复制到 `.tools/bot-platform`，使用已有隔离依赖，未原地重装主工作区依赖。所有数据库、资源、端口和接收器均为隔离夹具；TEMP/TMP 指向该副本下的 tmp。Python 元数据子进程通过 BACKUP_NODE_BIN 指定 Node24。敏感凭据不写证据。

主要命令（在对应隔离包中执行，node 均为固定 Node24）：

```text
shared: node typescript/bin/tsc -p tsconfig.build.json
shared: node scripts/build-cjs.mjs
shared: node typescript/bin/tsc --noEmit
shared/backend: node eslint/bin/eslint.js src --max-warnings=0
backend: node typescript/bin/tsc -p tsconfig.build.json
backend: node --test --test-timeout=15000 tests/lifecycle.test.js src/utils/eventContentStorage.test.js
backend: node vitest/vitest.mjs run --configLoader native --reporter=default --reporter=json
shared: node vitest/vitest.mjs run
web: node vitest/vitest.mjs run tests/public-log-redaction.test.ts tests/public-read.test.ts
backend: python scripts/backup_bundle_test.py
backend: python scripts/inspect_data_test.py
backend: python scripts/migration_baseline_test.py
root: node scripts/revamp/check-boundaries.mjs
root: node backend/scripts/check-legacy-budget.cjs
```

打包验证使用本次 shared 的 npm pack 产物（不包含 src），在独立消费者解析全部 6 个导出路径，分别运行 ESM/CommonJS，并对 consumer.cts/consumer.mts 做 strict Node16 类型检查。没有通过源目录覆盖包内容来使验证通过。

## 失败记录与限制

- 首次运行系统 TEMP 的 mkdtemp 被 EPERM 拒绝，改用明确的隔离 TEMP 后继续。初次 Python 验包调用系统 Node22 被元数据提供器拒绝，明确指定 Node24 后 20 项通过；没有降低提供器版本要求。
- 新 schema 初次全量出现 4 个旧版本断言失败，生命周期另有旧表数/索引数断言。只更新最新版本预期，并补 main3→4 保留数据/账本、重复升级及 feature gate 验证，未删迁移/回退断言。
- 独立文档路由首次使用 sendFile，在 `.tools` 隐藏目录下返回失败；改为读取固定文档路径发送，23 个路由与独立契约逐项对照通过。
- 一次中间全量中，既有成员头像搬移用例出现 500；首次全量及后续定向/完整复验通过。未宣称找到了根因，已给该断言增加结构化错误诊断，保留失败日志 `.tools/bot-platform/bot-final.log`。没有放宽状态断言、重试策略或资源身份检查。
- 前端隔离副本初次缺少 WebP 夹具文件导致超时，复制仓库原始夹具后相关 48 项通过，未改超时门槛。
- 未执行 Linux/容器、远程 CI、整站 E2E、真实外部 Bot 联调或生产部署。数据库增长和历史通知归档策略见接口文档；当前保留历史数据。

最终结果见下方验收记录；原始失败和各阶段 JSON/log 保留在忽略目录 `.tools/bot-platform`。

## 最终验收记录

| 检查 | 结果 |
| --- | --- |
| shared ESM/CJS 构建、strict 类型检查 | 通过 |
| 后端 strict 编译、后端/shared ESLint（max-warnings=0） | 通过 |
| 启动/生命周期 Node tests | 17/17 |
| 最终后端 Vitest | **2015 通过，1 项 Windows 上既定 POSIX 不适用跳过；56 文件通过** |
| 本次 Bot HTTP/队列/绑定/报名/审核集成 | 16/16，包含在上述总数中 |
| 新增独立契约/路由、旧 71 操作与原 OpenAPI | 通过，均未跳过；新接口 23 个逐项匹配 |
| shared 单测 | 79/79 |
| BFF 公开读取/日志脱敏相关测试 | 48/48（含新增 Bot 私有审计投影） |
| Python 备份验包/恢复、数据检查、迁移基线 | 20/20、9/9、2/2 |
| 无源码 tarball 消费者 | ESM/CJS 的 6 个路径及 strict .cts/.mts 通过 |
| 导入边界、legacy JS 清单 | 131 文件零违规；31 个既有 JS 清单不增长 |
| OpenAPI 生成器与提交文档 SHA 对照、git diff --check | 通过 |

最终全量使用独立 Bot 子路径构建，命令退出码 0，JSON/log 为 `.tools/bot-platform/bot-final-subpath.{json,log}`，2015 个 Vitest + 17 个 Node tests 共 **2032 项通过**，另计 1 项已明确的不适用跳过。前一轮全量 2014 项通过后增加了版本化路由诊断验证；此次最后完整复验包含该验证与新子路径。未把定向通过数叠加成额外唯一测试数。

## 后续：历史上的今天（只读接口）

新增 `GET /api/bot/v1/on-this-day`，沿用 `query:read`，扩展总数由 23 增至 **24**，既有 operationId 不变，新操作为 bot_24。默认北京时间今天，可通过 date 指定参考日，source 筛选文章/群史，page/limit 稳定分页；仅匹配早于参考年的同月同日公开记录。摘要使用业务日期，不使用创建时间；排除草稿、软删除、无效/不完整日期与时间戳形式日期，闰日不自动挪日。

响应同时提供来源、原始日期、years_ago、简介、图片、相对站内链接及当前页 broadcast_text。单条标题/简介截为 200/500 字符；只选择公开摘要列，不带正文、身份或删除元数据。单个 SQLite WITH 语句读取总数与分页结果，防止两次读取之间的并发变更造成总数/条目快照不一致。空结果及超末页都有明确反馈。

本次未新增迁移、后台任务、外部发送或前端改动。上面的 2032 项是前一轮平台全量的历史结果，不冒称本轮重跑。Node24 隔离副本上后端 strict 编译及 ESLint 零警告通过；执行：

```text
node vitest/vitest.mjs run --configLoader native \
  tests/integration/bot-on-this-day.test.mjs \
  tests/integration/bot-platform.test.mjs \
  tests/contracts/bot-openapi.test.mjs \
  tests/contracts/openapi.test.mjs
```

**26/26 通过，0 跳过**（新增功能 6、平台回归 16、扩展契约 1、原 OpenAPI 3），JSON 为 `.tools/bot-platform/bot-on-this-day.json`。覆盖混合来源及隐私投影、稳定分页/空页总数、北京时间午夜与跨年、真实闰日/脏日期、非法/复合参数、权限和无投递副作用。独立 OpenAPI 与实际 24 个接口逐项匹配；131 文件边界检查、31 项 legacy JS 清单与 git diff --check 通过。

## 后续：历史上的今天图文播报

原 `image` 字段保留；新增每条 `image_url`（首张可用图）、`images`（绝对 URL 列表）、`images_truncated`（预算截断标志），以及本页全局去重的 `broadcast_images`，与原 `broadcast_text` 配对。封面优先，随后文章相册、常见 Markdown/HTML 正文和描述插图；群史含独立配图与描述插图。正文只在当前页的同一 SQL 快照内读取有限片段用于提取，不作为 JSON 字段输出。

绝对 origin 仅来自 `BOT_PUBLIC_ASSET_BASE_URL` / `SITE_URL` / 固定默认站点，不信任 Host 或查询参数。只收录可映射到本站公共上传目录、文件实际存在的常见栅格图片，复用 storage 的路径/真实目录边界校验，拒绝外站、路径穿越、准备区、非图片后缀和指向私有目录的链接。URL 规范化去重，去掉查询参数和 fragment；非配置源的绝对 URL 不转发。不抓取外站，公开 URL 是否实际可达仍取决于部署映射。

预算为单条 50 图、256 候选，相册/正文/描述各 262144 字符，超过时明确标记；无图继续文本。扫描跳过代码示例及注释，处理常见内联/引用 Markdown 和 HTML img src，不宣称覆盖任意动态组件、SVG 或所有 Markdown 扩展。

Node24 隔离副本后端 strict 编译、ESLint 零警告通过。执行以下六个 suite，**41/41 通过，0 跳过**：

```text
tests/integration/bot-on-this-day.test.mjs   11
tests/integration/bot-platform.test.mjs      16
tests/integration/public-boundaries.test.mjs  6
tests/integration/storage-security.test.mjs   4
tests/contracts/openapi.test.mjs              3
tests/contracts/bot-openapi.test.mjs           1
```

结果 `.tools/bot-platform/bot-on-this-day-images.json`。用真实 PNG 建立封面/相册/正文/群史夹具，逐个使用 fetch（不带 Authorization）下载返回 URL，断言 HTTP200、image/png 和原始字节完全一致。额外覆盖中文/空格/括号路径、HTML 实体、引用图、跨条目去重、伪造 Host、缺图回退、外链过滤、编码路径穿越、私有目录 junction、图片数量/正文长度截断及无效公开 origin。接口数仍 24，不增加 schema 版本、依赖或群消息发送；原平台全量数字不作为此轮重跑结果。

## 最新调整：活动文章仅封面

按用户最新要求，活动文章的 `images` 限定为零或一张可用封面，`image_url` 为该封面绝对 URL；没有封面或封面不可用时为空，不回退相册、正文或简介插图。SQL 不再读取文章相册/正文或完整简介用于提图，文章 `images_truncated` 固定 false。群史的独立配图、描述提图、预算和公共资源边界均保留；本页 `broadcast_images` 继续跨条目去重。

示例、独立 OpenAPI 和当前 STATUS 同步，旧章节中的相册/正文图片行为仅为前一检查点记录。Node24 strict 编译、ESLint 零警告及定向回归 **29/29 通过，0 跳过**：历史上的今天 12、Bot 平台 16、扩展契约 1。JSON 为 `.tools/bot-platform/bot-on-this-day-cover-only.json`。覆盖有真实相册/正文/简介图片时仍只返回封面、无封面/缺图不兜底、超长文章正文不触发提图预算，以及群史多图/截断行为和实际 PNG 下载保持正常。未新增迁移或执行外部发送。
