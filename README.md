<p align="center">
  <img src="web/public/brand/group-avatar.webp" alt="桂航绯想天社团头像" width="112" height="112">
</p>

<h1 align="center">桂航绯想天 · GuatSWR Website</h1>

<p align="center">桂林航天工业学院东方同好社群的网站：活动、报名、住民名册与群史。</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-24.16.0-339933?style=flat-square" alt="Node.js 24.16.0">
  <img src="https://img.shields.io/badge/pnpm-11.25.0-F69220?style=flat-square" alt="pnpm 11.25.0">
  <img src="https://img.shields.io/badge/Nuxt-4.6.2-00DC82?style=flat-square" alt="Nuxt 4.6.2">
  <img src="https://img.shields.io/badge/SQLite-WAL-003B57?style=flat-square" alt="SQLite WAL">
</p>

<p align="center">
  <a href="#快速开始">本地运行</a> ·
  <a href="docs/ARCHITECTURE.md">架构说明</a> ·
  <a href="docs/revamp/STATUS.md">改版进度</a> ·
  <a href="https://github.com/guatswr/GuatSWR_Website/issues">问题反馈</a>
</p>

这个仓库包含公开网站和管理后台。社群成员可以浏览活动记录、参与报名、查看住民资料与群史；管理员可以发布文章、审核活动、维护站点内容和管理备份。

**页面迁移与视觉确认已完成，正在收尾工程验证。** 2026-10-22 用户已确认全部迁移页面的视觉效果；性能、无障碍、安全及部署验收分别记录。新版默认禁止搜索引擎索引，站点地图暂未启用。当前结论与验收证据见 [STATUS.md](docs/revamp/STATUS.md)，详细条目见 [CHECKLIST.md](docs/revamp/CHECKLIST.md)。

## 目录

- [功能与页面](#功能与页面)
- [项目结构](#项目结构)
- [快速开始](#快速开始)
- [配置说明](#配置说明)
- [开发与检查](#开发与检查)
- [构建与部署](#构建与部署)
- [数据与备份](#数据与备份)
- [参与维护与权利声明](#参与维护与权利声明)

## 功能与页面

| 入口 | 可以做什么 |
| --- | --- |
| 首页 `/` | 了解社群、查看近期活动与活动回顾、访问常用社群链接 |
| 活动文章 `/activities` | 阅读活动记录；正文支持 Markdown、代码高亮、公式与 Mermaid 图表 |
| 活动中心 `/events` | 查看悬赏令、非想天则、东方 STG、聚会与竞猜；按活动类型投稿或报名 |
| 住民与群史 `/members`、`/history` | 浏览成员资料、学校分布与社群时间轴 |
| 社群入口 `/social`、`/join` | 查看社群信息与入群指引 |
| 公开日志 `/logs` | 查看经过脱敏处理的公开日志 |
| 管理后台 `/admin` | 管理文章、活动、成员、群史、站点设置、账号权限和备份；入口权限按角色控制 |

界面支持浅色与深色主题、移动端布局和减少动态效果偏好。公开页面使用 SSR；后台通过同源 BFF（前端服务层）访问业务后端，后端 JWT 保存在服务端。

## 项目结构

```text
GuatSWR_Website/
├── web/                      # Nuxt 4 + Vue 3 + TypeScript
│   ├── app/                  # 页面、布局、组件和浏览器交互
│   ├── server/               # Nitro BFF、会话、公开数据适配与渲染
│   ├── shared/               # 仅此 Nuxt 应用共用的类型和纯逻辑
│   └── tests/                # Vitest、HTTP 集成测试、Playwright E2E
├── backend/                  # Express 4 + SQLite，独立 npm/Docker 项目
│   ├── src/                  # 业务接口、鉴权、数据库与上传处理
│   ├── data/                 # 运行时数据库与上传资源，不入库
│   └── docs/openapi.yaml     # 现有业务 API 契约
├── packages/shared/          # TypeScript 类型与 Zod 校验契约
├── scripts/                  # 仓库级检查、备份与恢复工具
└── docs/                     # 架构、迁移设计与验收记录
```

pnpm 工作区包含 `web/` 和 `packages/*`。`backend/` 使用自己的 `package-lock.json`，单独通过 npm 安装。`packages/shared/` 供新版应用使用，现有 Express 后端仍保留原接口实现。

目录边界与测试夹具约定见 [架构说明](docs/ARCHITECTURE.md)。旧版 `frontend/` 源码保留在本地 Git 标签 `v1-archive` 中。

## 快速开始

### 1. 准备环境与依赖

- Node.js **24.16.0**，与 [`.node-version`](.node-version) 一致；工作区要求 `>=24.16.0 <25`。
- pnpm **11.25.0**，以及 Node.js 自带的 npm。

以下步骤对应当前新版分支 `revamp/nuxt-foundation`：

```sh
git clone --branch revamp/nuxt-foundation https://github.com/guatswr/GuatSWR_Website.git
cd GuatSWR_Website
npm install --global pnpm@11.25.0
pnpm install --frozen-lockfile
npm --prefix backend ci
```

`sqlite3` 和 `sharp` 包含原生依赖；若安装进入源码编译，需要 Python 和对应平台的 C/C++ 编译工具。

### 2. 配置本地环境

首次运行时复制配置；已有 `.env` 时直接编辑原文件。以下 `cp` 命令也可在 Windows PowerShell 中使用。

```sh
cp .env.example backend/.env
cp web/.env.example web/.env
```

编辑 `backend/.env`，设置自己的 `SUPER_ADMIN_USERNAME`、`SUPER_ADMIN_PASSWORD` 和随机 `JWT_SECRET`，再调整以下开发配置：

```dotenv
NODE_ENV=development
PORT=3000
SITE_URL=http://127.0.0.1:3100
CORS_ORIGINS=http://127.0.0.1:3100
```

编辑 `web/.env`，设置独立的随机 `NUXT_SESSION_PASSWORD`（至少 32 个字符），并加入或修改：

```dotenv
NUXT_API_BASE=http://127.0.0.1:3000
NUXT_BFF_AUTH_ALLOWED_ORIGINS=["http://127.0.0.1:3100"]
NUXT_BFF_AUTH_ALLOW_INSECURE_LOOPBACK_COOKIES=true
HOST=127.0.0.1
PORT=3100
```

`web/.env.example` 的上游示例端口是 `8080`，这里按本地后端的 `3000` 改写。明文 Cookie 开关只供非生产环境的回环地址调试；正式服务使用 HTTPS。

### 3. 分别启动后端和网站

在仓库根目录打开两个终端。终端一启动业务后端：

```sh
npm --prefix backend run dev
```

终端二启动 Nuxt；根目录脚本会先构建共享包：

```sh
pnpm dev
```

| 地址 | 用途 |
| --- | --- |
| [http://127.0.0.1:3100](http://127.0.0.1:3100) | 公开网站，浏览器请统一使用此地址 |
| [http://127.0.0.1:3100/login](http://127.0.0.1:3100/login) | 使用配置的站长账号登录后台 |
| [http://127.0.0.1:3100/api/health](http://127.0.0.1:3100/api/health) | Nuxt 服务存活检查，不代表后端或数据库健康 |
| [http://127.0.0.1:3000/api/version](http://127.0.0.1:3000/api/version) | Express 版本接口，返回 `version: "4.0"`、`status: "online"` |
| [http://127.0.0.1:3000/api/docs](http://127.0.0.1:3000/api/docs) | 现有后端 Swagger 文档 |

首次启动会创建数据库和配置的站长账号。已有同名账号的密码不会因修改环境变量而重置。新数据库不含历史社群内容，需要从后台录入或按运维流程恢复数据。

## 配置说明

后端读取 `backend/.env`；Nuxt 开发模式读取 `web/.env`。**Nuxt 构建产物启动时不自动读取 `.env`**，运行配置需要由进程环境或部署平台注入。真实 `.env` 文件不提交到 Git。

| 变量 | 位置 | 说明 |
| --- | --- | --- |
| `JWT_SECRET` | 后端 | JWT 签名密钥；缺少时后端退出 |
| `SUPER_ADMIN_USERNAME` / `SUPER_ADMIN_PASSWORD` | 后端 | 初始化站长账号，首次配置时替换示例内容 |
| `PORT` / `NODE_ENV` | 两端分别配置 | 本地后端 `3000`、网站 `3100`；开发与生产分别使用 `development`、`production` |
| `SITE_URL` | 后端 | 后端生成公开链接时使用的站点地址 |
| `CORS_ORIGINS` | 后端 | 生产环境跨域来源白名单，逗号分隔；与 BFF 来源白名单分别配置 |
| `MAX_BODY_SIZE` / `STAGING_TTL_MS` | 后端 | 请求体默认 `50mb`；暂存上传默认保留 48 小时 |
| `DB_PATH` / `LOG_DB_PATH` | 后端 | 可选数据库路径；相对路径基于 `backend/data/` |
| `NUXT_API_BASE` | Nuxt | 服务端可达的 Express origin，不带 `/api` 路径；保存在私有运行配置中 |
| `NUXT_SESSION_PASSWORD` | Nuxt | 至少 32 个字符的随机会话密钥，与 `JWT_SECRET` 分别生成 |
| `NUXT_BFF_AUTH_ALLOWED_ORIGINS` | Nuxt | 精确匹配的写请求来源，使用 JSON 数组；默认空列表会拒绝写操作 |
| `NUXT_BFF_AUTH_TRUSTED_PROXY_CIDRS` | Nuxt | 实际可信反向代理的 CIDR 数组，默认不信任转发的客户端 IP |
| `NUXT_BFF_AUTH_ALLOW_INSECURE_LOOPBACK_COOKIES` | Nuxt | 默认 `false`；仅非生产、回环连接及回环 Host 下允许 HTTP Cookie |

当前登录会话与游客草稿保存在单进程内存中，重启会丢失；多实例运行需要先补齐共享存储。会话、来源检查与代理配置详见 [鉴权说明](docs/revamp/AUTH.md) 和 [游客流程](docs/revamp/GUEST.md)。

## 开发与检查

在仓库根目录执行：

| 命令 | 检查内容 |
| --- | --- |
| `pnpm typecheck` | 工作区 TypeScript 类型 |
| `pnpm lint` | 工作区 ESLint 规则 |
| `pnpm test` | 共享包与 Nuxt 的单元、集成测试 |
| `pnpm test:tooling` | 仓库检查工具、E2E 执行器和性能指标工具 |
| `pnpm check:boundaries` | 共享包、浏览器代码和服务端代码的导入边界 |
| `pnpm check:security` | 验证依赖补丁与漏洞回归，再执行在线审计；未知告警或补丁失效即失败 |
| `pnpm build` | 构建共享包和 Nuxt 生产产物 |
| `pnpm check:artifacts` | 检查构建产物，需要先构建 |
| `pnpm check:routes` | 检查路由初始 JavaScript 体积，需要构建产物及 Chromium |
| `pnpm --filter @guatswr/web test:performance` | 在真实首页、文章列表和 STG 页面采集移动端 Lighthouse；CI 在 Linux 执行 |

Playwright E2E 使用隔离测试服务与内存数据。先构建，再安装 Chromium 并运行：

```sh
pnpm build
pnpm --filter @guatswr/web exec playwright install chromium
pnpm test:e2e
```

E2E 默认使用 `3100`、`3181`、`3182` 端口，运行前需确保这些端口空闲。Linux 主机还需安装浏览器系统依赖与中文字体，具体步骤见 [CI 工作流](.github/workflows/revamp.yml)。测试数据和隔离规则见 [夹具说明](web/tests/fixtures/README.md)。

工作区命令覆盖 `web/` 与 `packages/*`，后端有独立生命周期。CI 包含 Windows、Linux 和容器检查；完整迁移验收状态以 [验收清单](docs/revamp/CHECKLIST.md) 为准。

## 构建与部署

Nuxt 生产产物位于 `web/.output/`。原生 Node 服务的入口是 `web/.output/server/index.mjs`，可在注入运行环境后通过 `pnpm --filter @guatswr/web preview` 启动。

构建 Nuxt 容器镜像时，**从仓库根目录执行**：

```sh
docker build --file web/Dockerfile --tag guatswr-web:local .
```

Dockerfile 会安装锁定依赖、运行类型检查、lint、测试、构建和产物检查；最终镜像以 `node` 用户运行，监听容器内 `3100` 端口。Express 使用独立的 [Compose 配置](backend/docker-compose.yml)，当前映射宿主机 `8088` 至容器 `3000`。

接入服务器时需要对齐以下配置：

- 反向代理将网站页面、`/api/*` 和 `/uploads/*` 交给 Nitro；其中 `/api/bff/*` 由新版会话层处理。
- `NUXT_API_BASE` 使用 Nitro 所在网络能够访问的后端地址。独立容器之间应使用容器网络中的服务地址；容器内 `127.0.0.1` 指向本容器。
- 为真实 HTTPS 站点配置写请求来源、会话密钥及实际可信代理网段。
- 公开 HTML 每次请求重新渲染，数据 SWR 在服务端适配层；API 和私有路由保留各自的缓存控制策略。

当前部署方案仍处于待执行状态，服务器、域名和流量切换的步骤见 [部署提案](docs/revamp/STAGING.md)。搜索索引与站点地图的启用要求见 [SEO 说明](docs/revamp/SEO.md)。

## 数据与备份

默认持久化数据位于：

| 路径 | 内容 |
| --- | --- |
| `backend/data/guatswr_web_main.db` | 成员、文章、活动、账号与站点配置 |
| `backend/data/guatswr_web_logs.db` | 审计日志 |
| `backend/data/public/` | 上传图片、缩略图与公开资源 |

仓库级备份脚本在 Linux/Bash 环境使用，需要 `sqlite3`、`tar` 和 `sha256sum`：

```sh
bash scripts/backup_all.sh
```

全量归档写入 `backups/full/`，附带 SHA-256 完整性清单，并清理超过 30 天的全量归档及清单。定时任务模板见 [cron.example](scripts/cron.example)。

SQLite 使用 WAL 模式。运行中应通过 SQLite `.backup` 导出快照；现有数据库脚本在缺少 `sqlite3` 时会退回普通文件复制，因此热备前必须确认该命令可用。恢复脚本会覆盖数据库和公开资源，执行前需停止后端、校验归档并保留当前数据副本。

`scripts/` 和 `backend/scripts/` 使用不同的数据根目录，自动备份与宿主机定时任务也可能写往不同位置。恢复与挂载前先核对 [脚本职责和备份入口](scripts/README.md)。
