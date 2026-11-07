<a id="readme-top"></a>

<p align="center">
  <img src="web/public/brand/group-avatar.webp" alt="桂航绯想天社团头像" width="112" height="112">
</p>

<h1 align="center">桂航绯想天 · GuatSWR Website</h1>

<p align="center">桂林航天工业学院东方同好社群网站</p>

<p align="center">
  <a href="https://github.com/guatswr/GuatSWR_Website/releases/tag/v2.0.0"><img src="https://img.shields.io/badge/release-v2.0.0-1677B8?style=flat-square" alt="Release v2.0.0"></a>
  <a href="https://github.com/guatswr/GuatSWR_Website/actions/workflows/backend.yml?query=branch%3Amain"><img src="https://github.com/guatswr/GuatSWR_Website/actions/workflows/backend.yml/badge.svg?branch=main" alt="CI"></a>
  <a href=".node-version"><img src="https://img.shields.io/badge/Node.js-24.16.0-339933?style=flat-square" alt="Node.js 24.16.0"></a>
  <a href="web/package.json"><img src="https://img.shields.io/badge/Nuxt-4.6.3-00DC82?style=flat-square" alt="Nuxt 4.6.3"></a>
  <a href="backend/package.json"><img src="https://img.shields.io/badge/Express-5.3.0-444444?style=flat-square" alt="Express 5.3.0"></a>
  <a href="docker-compose.yml"><img src="https://img.shields.io/badge/PostgreSQL-18.6-4169E1?style=flat-square" alt="PostgreSQL 18.6"></a>
  <a href="backend/package.json"><img src="https://img.shields.io/badge/SQLite-WAL-003B57?style=flat-square" alt="SQLite WAL"></a>
</p>

<p align="center">
  <a href="#快速开始">快速开始</a> ·
  <a href="#本地调试指南">本地调试</a> ·
  <a href="#服务器部署教程">服务器部署</a> ·
  <a href="#后续运维">后续运维</a> ·
  <a href="docs/releases/v2.0.0.md">v2.0.0 版本说明</a> ·
  <a href="https://github.com/guatswr/GuatSWR_Website/issues">问题反馈</a>
</p>

本仓库包含桂航绯想天社群网站的公开前端、同源 BFF 服务层与 Express 业务后端。社团成员可浏览活动文章、投稿活动、报名STG与非想天则比赛、查阅成员列表与群史；管理员可通过后台审核投稿、录入赛果、管理成员与权限，并执行整站数据备份。

<details>
<summary>阅读目录</summary>

- [功能与页面](#功能与页面)
- [架构与工作区结构](#架构与工作区结构)
- [快速开始](#快速开始)
  - [1. 环境要求与依赖安装](#1-环境要求与依赖安装)
  - [2. 配置前后端环境变量](#2-配置前后端环境变量)
  - [3. 初始化双数据库与超级管理员](#3-初始化双数据库与超级管理员)
  - [4. 启动本地服务](#4-启动本地服务)
- [本地调试指南](#本地调试指南)
  - [1. 终端链路连通性自检](#1-终端链路连通性自检)
  - [2. 核心业务流程联调步骤](#2-核心业务流程联调步骤)
  - [3. 浏览器 Network 与后端日志关联排查](#3-浏览器-network-与后端日志关联排查)
  - [4. 修改文件后的热重载与重启规则](#4-修改文件后的热重载与重启规则)
  - [5. VS Code 后端 TypeScript 断点调试](#5-vs-code-后端-typescript-断点调试)
  - [6. 本地调试常见报错速查](#6-本地调试常见报错速查)
- [开发与质量门禁](#开发与质量门禁)
- [服务器部署教程](#服务器部署教程)
  - [1. 容器拓扑与网络边界](#1-容器拓扑与网络边界)
  - [2. 环境要求与持久化目录](#2-环境要求与持久化目录)
  - [3. 环境变量与 Compose 参数（前后端 .env 填写教程）](#3-环境变量与-compose-参数前后端-env-填写教程)
    - [3.1 配置文件分层与职责划分](#31-配置文件分层与职责划分)
    - [3.2 密钥批量生成快捷命令](#32-密钥批量生成快捷命令)
    - [3.3 后端配置填写教程：`backend/.env`](#33-后端配置填写教程backendenv)
    - [3.4 前端配置填写教程：`web/.env.production`](#34-前端配置填写教程webenvproduction)
    - [3.5 根目录 Compose 插值与 Umami 配置：`.env`](#35-根目录-compose-插值与-umami-配置env)
    - [3.6 运维常见配置排错速查 (FAQ)](#36-运维常见配置排错速查-faq)
  - [4. 构建与镜像版本管理](#4-构建与镜像版本管理)
  - [5. 数据库初始化与历史数据接管](#5-数据库初始化与历史数据接管)
  - [6. 启动与分层验收](#6-启动与分层验收)
  - [7. 生产 HTTPS 反向代理与业务验收](#7-生产-https-反向代理与业务验收)
  - [8. Windows 与局域网访问](#8-windows-与局域网访问)
  - [9. 日常管理、升级与故障排查](#9-日常管理升级与故障排查)
- [后续运维教程](#后续运维)
  - [1. 日常版本升级与平滑重启流程](#1-日常版本升级与平滑重启流程)
  - [2. 数据备份、完整性验包与灾难恢复](#2-数据备份完整性验包与灾难恢复)
  - [3. 文件隔离区与存储清理维护](#3-文件隔离区与存储清理维护)
  - [4. 账号安全、令牌撤销与审计日志维护](#4-账号安全令牌撤销与审计日志维护)
  - [5. 应急只读回退模式](#5-应急只读回退模式)
  - [6. 运维故障与残留锁文件处理](#6-运维故障与残留锁文件处理)
- [文档导航](#文档导航)

</details>

## 功能与页面

| 路由入口 | 页面职责 |
| --- | --- |
| `/` | 首页：社团简介、常驻企划方向、近期活动预告与往期回顾 |
| `/activities` · `/activity/:id` | 活动文章列表与正文（支持 Markdown、代码高亮、KaTeX 公式与 Mermaid 图表） |
| `/events` · `/events/:type` | 活动中心：悬赏令、非想天则、东方 STG、聚会、竞猜；支持游客草稿投稿、活动报名与赛果展示 |
| `/members` · `/history` | 住民名册（成员档案、院校分布）与群史时间轴 |
| `/social` · `/join` | 关联社群导航与入群迎新指引 |
| `/logs` | 经服务端投影与脱敏处理的公开站点操作日志 |
| `/servers` | 河童重工节点状态中心：通过内网联通 Komari 面板展示节点遥测、流量与计费资产（服务端严格剔除节点 IP） |
| `/login` · `/admin` | 管理员登录（支持二步验证密码）与后台：文章、活动审核、成员、群史、站点配置、账号权限与备份管理 |

公开页面由 Nuxt SSR 实时渲染（每次请求生成独立 CSP nonce，服务端数据层采用 SWR 缓存），支持深浅色主题切换、移动端适配与 `prefers-reduced-motion` 减弱动态效果。所有管理员操作与游客写操作均通过同源 Nitro BFF（`/api/bff/**`）完成鉴权、CSRF 校验、Origin 校验与请求体限流，后端签发的 JWT 密文仅保存在 BFF 服务端。

## 架构与工作区结构

```mermaid
flowchart LR
    Browser["浏览器客户端"] -->|"HTTPS / 同源 Cookie + CSRF"| Web["Nuxt 4 SSR 与 Nitro BFF (:3100)"]
    Web -->|"内网 HTTP + Bridge Secret"| API["Express 5 业务后端 (:3000；独立入口可映射 :8088)"]
    Web -.->|"AES-256-GCM 会话持久化"| BFFDB[("BFF 状态存储<br/>(PostgreSQL bff.records / SQLite)")]
    API --> PG[("PostgreSQL 18 生产数据库<br/>(main / audit / bff schemas)")]
    API -.-> SQLite[("轻量/开发 SQLite-WAL<br/>(guatswr_web_main.db / logs.db)")]
    API --> Storage["资源存储 (public / private-upload / asset-quarantine)"]
```

```text
GuatSWR_Website/
├── web/                        # @guatswr/web：Nuxt 4 + Vue 3 + TypeScript 前端与 Nitro BFF
│   ├── app/                    # 页面路由、组件、Pinia 状态与客户端逻辑
│   ├── server/                 # BFF 鉴权、持久化状态存储、游客草稿网关与公开数据 SWR 适配
│   └── tests/                  # 前端单测、BFF 集成测试与 Playwright E2E
├── backend/                    # guiair-backend：Express 5 + 严格 TypeScript 业务后端
│   ├── src/                    # 业务模块、双驱动（PostgreSQL/SQLite）迁移引擎、文件事务发布
│   ├── scripts/                # 备份/恢复/验包工具（PostgreSQL 原生 CLI、Bash + Python 3）
│   └── docs/openapi.yaml       # 后端 71 个操作的 OpenAPI 契约定义
├── packages/shared/            # @guatswr/shared：前后端共用的 Zod 4 校验契约（ESM / CJS 双产物）
├── scripts/                    # 离线迁移编排、仓库级备份入口包装、依赖安全审计与边界检查
├── patches/                    # 经 SHA-256 锁定的上游依赖安全补丁
└── docs/                       # 架构说明、后端现代化运行手册、PostgreSQL 迁移与运维指南
```

三个包共用根目录 `pnpm-lock.yaml`。后端业务层使用严格 TypeScript 编译至 `backend/dist/`，保留少量 CommonJS 平台装配层。系统支持双数据库驱动：生产环境默认采用专有 PostgreSQL 18.6 容器（通过 `DATABASE_DRIVER=postgres` 接入，划分 `main`、`audit`、`bff` 三大 Schema 并由严格最小权限角色驱动），开发与轻量测试支持 SQLite-WAL 双库模式（主库最新版本 `10`、审计日志库版本 `2`，各自维护独立的迁移账本）。旧版 v1 前端源码保存在 Git 标签 `v1-archive` 中。

<p align="right">(<a href="#readme-top">返回顶部</a>)</p>

## 快速开始

以下步骤适用于**全新的本地空白开发环境**。若手头已有历史数据库文件，请先阅读[数据库迁移运行手册](docs/backend-modernization/MIGRATIONS.md)，切勿对非空历史库执行 `initialize`。

### 1. 环境要求与依赖安装

- **Node.js**：`24.16.0`（见 [`.node-version`](.node-version)，工作区限制 `>=24.16.0 <25`）
- **包管理器**：`pnpm@11.25.0`
- **原生编译与脚本工具**：`sqlite3` 与 `sharp` 含原生扩展，若预编译二进制未命中而回退源码编译，需安装 Python 3 与对应平台的 C/C++ 编译工具链（Windows Visual Studio C++ Build Tools / Linux `build-essential`）。执行完整备份与恢复脚本另需 `bash`、`python3`、`sqlite3` 命令行、`tar` 与 `sha256sum`。

克隆仓库并构建共享契约与后端产物：

```sh
git clone https://github.com/guatswr/GuatSWR_Website.git
cd GuatSWR_Website
npm install --global pnpm@11.25.0
pnpm install --frozen-lockfile
pnpm --filter @guatswr/shared build
pnpm --filter guiair-backend build
```

### 2. 配置前后端环境变量

首次运行时，将示例文件复制为本地 `.env`（`.env` 已被 Git 忽略，不会入库）：

```sh
cp backend/.env.example backend/.env
cp web/.env.example web/.env
```

本地调试建议将数据库、上传文件与备份全部放在 `backend/.data/` 隔离目录下，避免污染默认路径。先在仓库根目录打印两个隔离目录的绝对路径：

```sh
node -e "const p=require('node:path'); console.log('DATA_DIR='+p.resolve('backend/.data/dev')); console.log('BACKUP_ROOT='+p.resolve('backend/.data/dev-backups'))"
```

再连续执行以下命令 **3 次**，生成 3 组独立的 64 位十六进制随机密钥（分别用于 `JWT_SECRET`、`BFF_BRIDGE_SECRET` 与 `NUXT_SESSION_PASSWORD`）：

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

编辑 `backend/.env`，填入刚才生成的绝对路径、密钥与初始超级管理员账号：

```dotenv
NODE_ENV=development
BIND_HOST=127.0.0.1
PORT=3000

# 数据库驱动模式：sqlite（默认本地轻量开发）或 postgres（生产环境推荐）
DATABASE_DRIVER=sqlite
# POSTGRES_URL=postgresql://guatswr_app:password@127.0.0.1:5432/guatswr_dev

# 填入上面打印的绝对路径（PUBLIC_DIR 默认解析为 DATA_DIR/public）
DATA_DIR=
BACKUP_ROOT=

# 填入第 1 组随机密钥
JWT_SECRET=
# 填入第 2 组随机密钥（必须与 web/.env 的 NUXT_BFF_BRIDGE_SECRET 完全一致）
BFF_BRIDGE_SECRET=

# 本地回环代理与站点地址
TRUST_PROXY_CIDRS=127.0.0.1/32,::1/128
SITE_URL=http://127.0.0.1:3100
CORS_ORIGINS=http://127.0.0.1:3100

# 仅供下一步 admin:bootstrap 显式创建首位超级管理员使用
SUPER_ADMIN_USERNAME=site-admin
SUPER_ADMIN_PASSWORD=ChangeMe_123456
```

编辑 `web/.env`，填入对应的后端地址与会话密钥：

```dotenv
NUXT_API_BASE=http://127.0.0.1:3000

# 填入第 3 组随机密钥（至少 32 个字符，不可与 JWT_SECRET 混用）
NUXT_SESSION_PASSWORD=
# 填入第 2 组随机密钥（与 backend/.env 的 BFF_BRIDGE_SECRET 完全一致）
NUXT_BFF_BRIDGE_SECRET=

# BFF 状态持久化驱动：sqlite（默认）、postgres（生产推荐）或 memory（仅单测）
BFF_DATABASE_DRIVER=sqlite
# BFF_POSTGRES_URL=postgresql://guatswr_app:password@127.0.0.1:5432/guatswr_dev

# 允许本地回环地址发起写操作并在 HTTP 下写入会话 Cookie
NUXT_BFF_AUTH_ALLOWED_ORIGINS=["http://127.0.0.1:3100"]
NUXT_BFF_AUTH_TRUSTED_PROXY_CIDRS=[]
NUXT_BFF_AUTH_ALLOW_INSECURE_LOOPBACK_COOKIES=true

HOST=127.0.0.1
PORT=3100
```

<details>
<summary>核心环境变量说明表（点击展开）</summary>

| 变量名 | 所属端 | 校验规则与作用 |
| --- | --- | --- |
| `DATABASE_DRIVER` | Backend | `sqlite`（默认轻量开发）或 `postgres`（生产推荐）。切换为 `postgres` 时后端将连接专有 PostgreSQL 实例 |
| `POSTGRES_URL` | Backend | PostgreSQL 业务数据库连接串（如 `postgresql://guatswr_app:pwd@127.0.0.1:5432/guatswr`） |
| `BFF_DATABASE_DRIVER` | Web (BFF) | `sqlite`（默认持久化至本地 SQLite）、`postgres`（持久化至 PG `bff.records`）或 `memory`（仅内存，单测使用） |
| `BFF_POSTGRES_URL` | Web (BFF) | BFF 状态存储专有 PostgreSQL 连接串（留空则回退至 `POSTGRES_URL`） |
| `DATA_DIR` | Backend | 必填绝对路径。存放 `guatswr_web_main.db`、`guatswr_web_logs.db` 及私有上传/隔离目录 |
| `PUBLIC_DIR` | Backend | 公开静态资源绝对路径，默认 `$DATA_DIR/public`。严禁与 `DATA_DIR` 根、`BACKUP_ROOT` 或私有子目录重叠 |
| `BACKUP_ROOT` | Backend | 备份归档绝对路径，默认 `backend/backups`。不得位于 `PUBLIC_DIR` 内 |
| `JWT_SECRET` | Backend | 非空字符串，用于后端签发与校验业务 JWT |
| `BFF_BRIDGE_SECRET` | Backend | `32～256` 位可见 ASCII 字符。生产环境必填，用于校验来自 Nitro BFF 的游客草稿证明 |
| `GUEST_DRAFT_PROOF_MODE` | Backend | 默认 `required`（强制校验 BFF 桥接证明）；仅兼容过渡期可设为 `optional` |
| `TRUST_PROXY_CIDRS` | Backend | 逗号分隔的可信反向代理/BFF CIDR 列表；为空时不信任任何 `X-Forwarded-For` |
| `BACKUP_SCHEDULER_OWNER` | Backend | `app`（默认，由后端进程内置定时器按后台设置触发备份）或 `external`（由宿主机 cron 触发） |
| `SUPER_ADMIN_USERNAME` | Backend | `1～50` 位 ASCII 字母、数字、`_` 或 `-`；仅被 `admin:bootstrap` CLI 读取 |
| `SUPER_ADMIN_PASSWORD` | Backend | `6～100` 字符且 UTF-8 字节长度 `<= 72`（防止 bcrypt 静默截断）；仅被 `admin:bootstrap` CLI 读取 |
| `NUXT_API_BASE` | Web (BFF) | Nitro 服务端访问 Express 的内部 Origin（不带 `/api` 后缀，如 `http://127.0.0.1:3000`） |
| `NUXT_SESSION_PASSWORD` | Web (BFF) | 至少 32 位字符。通过 HKDF-SHA256 派生服务端 JWT 封存密钥（AES-256-GCM）与 CSRF 签名密钥 |
| `NUXT_BFF_BRIDGE_SECRET` | Web (BFF) | 必须与后端的 `BFF_BRIDGE_SECRET` 完全一致 |
| `NUXT_BFF_AUTH_ALLOWED_ORIGINS` | Web (BFF) | JSON 字符串数组（如 `["http://127.0.0.1:3100"]`）。写请求 `Origin` 必须精确匹配，否则返回 403 |
| `NUXT_BFF_AUTH_TRUSTED_PROXY_CIDRS` | Web (BFF) | JSON 字符串数组。仅当直接连接对端位于此 CIDR 内时才解析 `X-Forwarded-For` |
| `NUXT_BFF_AUTH_ALLOW_INSECURE_LOOPBACK_COOKIES` | Web (BFF) | 布尔值，默认 `false`。仅在非生产环境且连接与 `Host` 均为回环地址时允许明文 HTTP Cookie |

</details>

### 3. 初始化双数据库与超级管理员

后端服务在正常启动时**只做只读迁移账本与结构指纹校验**，不会自动建表、改表或创建管理员。首次启动前必须显式执行初始化命令。

#### 3.1 SQLite 本地模式初始化（默认）

先创建配置中的 `DATA_DIR` 目录：

```sh
node --env-file=backend/.env -e "require('node:fs').mkdirSync(process.env.DATA_DIR,{recursive:true})"
```

然后在仓库根目录按当前操作系统执行双库初始化（最新目标版本为 `main: 10`、`audit: 2`）与首位超级管理员创建：

<details open>
<summary>Windows PowerShell</summary>

```powershell
$devData = node --env-file=backend/.env -p "process.env.DATA_DIR"
pnpm --filter guiair-backend db:migrate initialize --data-dir $devData
pnpm --filter guiair-backend db:check --data-dir $devData
node --env-file=backend/.env backend/dist/src/admin/bootstrap-cli.js --main-db (Join-Path $devData 'guatswr_web_main.db')
```

</details>

<details>
<summary>Linux / macOS (Bash / Zsh)</summary>

```sh
DEV_DATA_DIR="$(node --env-file=backend/.env -p 'process.env.DATA_DIR')"
pnpm --filter guiair-backend db:migrate initialize --data-dir "$DEV_DATA_DIR"
pnpm --filter guiair-backend db:check --data-dir "$DEV_DATA_DIR"
node --env-file=backend/.env backend/dist/src/admin/bootstrap-cli.js --main-db "$DEV_DATA_DIR/guatswr_web_main.db"
```

</details>

执行成功后：
- `db:check` 会输出两行 JSON，`main` 的 `version` 为 `10`，`audit` 的 `version` 为 `2`。
- `bootstrap-cli.js` 首次创建会输出 `{"bootstrap":{"status":"created","username":"site-admin"}}`；对已存在的同名超级管理员重复执行会返回 `unchanged`，不会重置密码，也不会提升普通用户权限。

#### 3.2 PostgreSQL 本地/专有模式初始化（可选）

若本地选择以 PostgreSQL 运行，需配置 `DATABASE_DRIVER=postgres` 与 `POSTGRES_URL`，通过专有迁移 CLI 完成建表并引导管理员：

```sh
# 初始化指定数据库（如 guatswr_dev）与应用角色（如 guatswr_app）
POSTGRES_MIGRATION_URL="postgresql://postgres:pwd@127.0.0.1:5432/postgres" \
  pnpm --filter guiair-backend db:postgres initialize guatswr_dev guatswr_app

# 校验 PostgreSQL 架构状态并引导超级管理员
node --env-file=backend/.env backend/dist/src/admin/bootstrap-cli.js --postgres-url-env POSTGRES_URL
```

### 4. 启动本地服务

打开两个独立终端，均在仓库根目录运行：

**终端 1 — 启动 Express 业务后端（监听 `127.0.0.1:3000`）：**

```sh
pnpm --filter guiair-backend dev
```

**终端 2 — 构建共享包并启动 Nuxt 前台与 BFF（监听 `127.0.0.1:3100`）：**

```sh
pnpm dev
```

| 本地访问地址 | 说明 |
| --- | --- |
| [http://127.0.0.1:3100](http://127.0.0.1:3100) | 网站前台首页（**请统一使用 `127.0.0.1:3100` 而非 `localhost:3100`**，以匹配 `NUXT_BFF_AUTH_ALLOWED_ORIGINS`） |
| [http://127.0.0.1:3100/login](http://127.0.0.1:3100/login) | 管理员登录页（输入刚才初始化的 `SUPER_ADMIN_USERNAME` 与密码） |
| [http://127.0.0.1:3100/api/health](http://127.0.0.1:3100/api/health) | Nuxt / Nitro 进程存活探针 |
| [http://127.0.0.1:3000/api/version](http://127.0.0.1:3000/api/version) | 后端存活与契约版本接口（固定返回 `{"version":"4.0","status":"online"}`） |
| [http://127.0.0.1:3000/api/docs](http://127.0.0.1:3000/api/docs) | 后端 Swagger UI 接口文档 |

<p align="right">(<a href="#readme-top">返回顶部</a>)</p>

## 本地调试指南

在完成「快速开始」并保持前后端两个终端运行后，可按以下步骤在本地验证完整读写链路、设置断点与排查问题。

### 1. 终端链路连通性自检

打开第三个终端，依次探测后端存活、Nuxt 存活、SSR 公开读取适配以及 BFF 鉴权握手（Windows PowerShell 请使用 `curl.exe`，Linux/macOS 使用 `curl`）：

```powershell
# 1. 检查 Express 后端是否就绪（预期返回 {"version":"4.0","status":"online"}）
curl.exe -fsS http://127.0.0.1:3000/api/version

# 2. 检查 Nuxt 服务是否就绪（预期返回 200 OK）
curl.exe -fsS http://127.0.0.1:3100/api/health

# 3. 检查 Nuxt 服务端是否成功从后端拉取站点公开配置
curl.exe -fsS http://127.0.0.1:3100/api/config

# 4. 检查 BFF 会话状态与 CSRF 签发接口
curl.exe -fsS http://127.0.0.1:3100/api/bff/auth/session
curl.exe -fsS -i http://127.0.0.1:3100/api/bff/auth/csrf
```

若前两步成功而第 3 步报错，说明 `web/.env` 中的 `NUXT_API_BASE` 未指向正在运行的后端端口。

### 2. 核心业务流程联调步骤

空白开发库不含历史数据，建议按以下顺序验证四条核心业务链路：

1. **管理员登录与后台写操作（验证 BFF 会话与缓存失效）**
   - 浏览器访问 `http://127.0.0.1:3100/login`，使用初始化的超级管理员登录。
   - 进入 `/admin` 后台，在「活动文章」中新建并发布一篇测试文章（可插入 Markdown 标题、代码块与图片）。
   - 打开前台 `/activities` 与文章详情页，确认新文章已立即可见（验证 BFF 写操作成功后自动触发 `invalidatePublicData` 刷新服务端 SWR 缓存）。
2. **游客活动草稿投稿与流式上传（验证 Bridge 密钥与草稿归属）**
   - 打开一个**浏览器无痕窗口**访问 `http://127.0.0.1:3100/events`，点击发起活动投稿。
   - 此时前端会调用 `POST /api/bff/guest/events/draft` 创建草稿并写入 `HttpOnly` 草稿归属 Cookie（路径限制为 `/api/bff/guest`）。
   - 在表单中上传内容图片（走 `POST /api/bff/guest/upload/content`，BFF 校验文件前 256 字节魔数与 50 MiB 上限后流式转发至后端私有暂存区）并提交审核。
   - 切回普通窗口的 `/admin` 后台「活动管理」，审核通过该草稿，观察图片从私有暂存区原子发布到 `PUBLIC_DIR` 并在前台 `/events` 展示。
3. **活动报名与取消（验证报名截止规则与头像上传）**
   - 在后台创建一个状态为 `published` 或 `ongoing` 的 `东方STG` 或 `非想天则` 测试活动。
   - 在前台打开该活动详情，上传参赛头像（`POST /api/bff/guest/upload/avatar`）、填写报名表并提交（`POST /api/bff/guest/events/:id/signup`）。
   - 刷新页面确认当前访客报名信息正常回显，再点击取消报名（`DELETE /api/bff/guest/events/:id/signup`）验证状态清除。
4. **回收站彻底删除与文件隔离（验证 `asset_cleanup_jobs`）**
   - 在后台将测试文章或测试活动移入回收站并执行「永久删除」。
   - 检查 `backend/.data/dev/asset-quarantine/` 目录：被删除且无其他内容引用的上传图片不会立即从磁盘抹除，而是会在后台清理周期（每 30 秒一批）被原子 `rename` 到隔离区目录，供误删恢复使用。

### 3. 浏览器 Network 与后端日志关联排查

当页面提示请求失败时，不要直接猜测原因，按以下两步定位：

1. **查看浏览器 DevTools Network 面板**：筛选 `/api/bff/` 请求，查看响应状态码、返回体 `{"error":{"code":"...","message":"..."}}` 以及响应头中的 `X-Request-ID`。出于安全边界设计，BFF 会拦截并隐去所有上游原始报错堆栈、SQL 错误和敏感字段，仅向浏览器返回固定错误码。
2. **对照后端终端 Pino 结构化日志**：在运行 `guiair-backend` 的终端中查找同一个 `requestId`。后端日志会记录完整的事件类型：
   - `http.completed`：包含 `method`、`route`、`status` 与 `durationMs`
   - `http.failed`：包含未捕获路由异常或上游失败原因
   - `task.started` / `task.completed` / `task.failed`：后台异步任务（清理、审计投递、自动备份）执行情况
   - `audit.failed` / `backup.failed` / `storage.cleanup.retry`：子系统告警

> [!IMPORTANT]
> 反馈问题或贴出调试日志时，只保留 `X-Request-ID`、状态码与脱敏后的日志片段，切勿粘贴浏览器 `Cookie`、后端 `Authorization` 头、`JWT_SECRET`、`NUXT_SESSION_PASSWORD` 或 `BFF_BRIDGE_SECRET`。

### 4. 修改文件后的热重载与重启规则

不同目录的代码改动对运行中进程的影响不同：

| 修改的文件范围 | 生效方式与注意事项 |
| --- | --- |
| `web/app/**`（页面、组件、样式） | Vite / Nuxt HMR 自动热更新，无需重启，登录态保留 |
| `web/server/**`（Nitro BFF 路由、工具） | Nitro 会自动重载服务端模块；若配置为持久化驱动（`sqlite` 或 `postgres`），登录会话与草稿归属保留，若配置为内存驱动（`memory`，仅单测）则会清空 |
| `backend/src/**` 或 `backend/server.js` | `nodemon` 监听到 `.ts`/`.js`/`.json` 变化后，自动发送 `SIGTERM` 优雅停机、重新执行 `npm run build` 并重启后端 |
| `packages/shared/src/**`（共享 Zod 契约） | **不会自动跨包热编译**。修改后必须先运行 `pnpm --filter @guatswr/shared build`，再重启前后端开发终端，防止两端继续使用旧缓存产物 |
| `backend/.env` 或 `web/.env` | 环境变量仅在进程启动时读取，修改后需在对应终端按 `Ctrl+C` 停止并重新启动 |

### 5. VS Code 后端 TypeScript 断点调试

后端生产与常规开发构建默认不生成 Source Map。如需在 VS Code 中对 `backend/src/**/*.ts` 源码打断点单步调试：

**步骤 1：停止常规后端开发终端（避免 `3000` 端口冲突），在仓库根目录编译带内联 Source Map 的调试产物并启动 Inspector：**

```sh
pnpm --filter @guatswr/shared build
pnpm --filter guiair-backend build
pnpm --filter guiair-backend exec tsc -p tsconfig.build.json --sourceMap --inlineSources
node --env-file=backend/.env --inspect=127.0.0.1:9230 --enable-source-maps backend/dist/server.js
```

**步骤 2：在仓库根目录 `.vscode/launch.json` 中添加 Attach 配置：**

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Attach GuatSWR Backend (9230)",
      "type": "node",
      "request": "attach",
      "address": "127.0.0.1",
      "port": 9230,
      "sourceMaps": true,
      "outFiles": ["${workspaceFolder}/backend/dist/**/*.js"],
      "skipFiles": ["<node_internals>/**"]
    }
  ]
}
```

**步骤 3：在 VS Code「运行和调试」面板选择 `Attach GuatSWR Backend (9230)` 启动连接**，即可在 `backend/src/` 下的任意 `.ts` 文件中命中断点。

**步骤 4：调试结束后的清理**。调试端口仅可绑定 `127.0.0.1`。调试完毕后，按 `Ctrl+C` 停止进程，并重新运行一次标准构建以清除 `dist/` 中的调试 Source Map：

```sh
pnpm --filter guiair-backend build
```

### 6. 本地调试常见报错速查

<details>
<summary>点击展开本地常见问题与解决方法</summary>

1. **登录或提交表单时返回 `403 Forbidden`（错误码 `forbidden` 或 Origin 校验失败）**
   - **原因**：浏览器地址栏使用了 `http://localhost:3100`，而 `web/.env` 中配置的是 `NUXT_BFF_AUTH_ALLOWED_ORIGINS=["http://127.0.0.1:3100"]`。BFF 对 `Origin` 执行严格字符串全等匹配。
   - **解决**：统一使用 `http://127.0.0.1:3100` 访问，或将两个地址同时加入 `NUXT_BFF_AUTH_ALLOWED_ORIGINS` 的 JSON 数组中并重启 `pnpm dev`。
2. **登录接口返回 200，但跳转到 `/admin` 立即掉线回到 `/login`**
   - **原因**：会话 Cookie 默认带有 `Secure` 属性；在本地明文 HTTP 下若未开启回环豁免，浏览器会拒绝保存 Cookie。
   - **解决**：确认 `web/.env` 中已设置 `NUXT_BFF_AUTH_ALLOW_INSECURE_LOOPBACK_COOKIES=true`，且使用 `127.0.0.1` 回环地址访问。
3. **游客创建草稿或提交活动时返回 `403` / `502`**
   - **原因**：`backend/.env` 的 `BFF_BRIDGE_SECRET` 与 `web/.env` 的 `NUXT_BFF_BRIDGE_SECRET` 不一致，或密钥长度不足 32 位可见 ASCII 字符。
   - **解决**：核对两端密钥是否完全相同，修改后同时重启后端与 Nuxt。
4. **后端启动立即退出并报 `MIGRATION_REQUIRED` 或 `MIGRATION_SCHEMA_DRIFT`**
   - **原因**：`DATA_DIR` 指向了尚未初始化的空目录，或本地代码更新了数据库迁移版本但开发库尚未升级。
   - **解决**：空目录执行 `db:migrate initialize`；已有开发库执行 `pnpm --filter guiair-backend db:migrate upgrade --data-dir <绝对路径>`。
5. **后端启动报 `Invalid configuration: STORAGE_LAYOUT`**
   - **原因**：`PUBLIC_DIR`、`DATA_DIR` 与 `BACKUP_ROOT` 之间存在目录包含关系（例如把 `BACKUP_ROOT` 放在了 `PUBLIC_DIR` 内，或把 `PUBLIC_DIR` 设为了 `DATA_DIR` 本身），或者主库与日志库指向了同一个文件。
   - **解决**：确保 `DATA_DIR` 与 `BACKUP_ROOT` 是相互独立的绝对路径，`PUBLIC_DIR` 保持默认（即 `$DATA_DIR/public`）或指向完全独立的静态目录。

</details>

<p align="right">(<a href="#readme-top">返回顶部</a>)</p>

## 开发与质量门禁

GitHub Actions 的触发范围、指标阈值、安全审计策略与分支保护设置见 [CI 设计](docs/CI.md)。

所有工作区检查命令均在**仓库根目录**运行：

| 命令 | 检查范围与说明 |
| --- | --- |
| `pnpm typecheck` | 先构建 `@guatswr/shared`，再对全工作区执行严格 TypeScript 类型检查 |
| `pnpm lint` | 运行全工作区 ESLint 检查（后端限制 `--max-warnings=0`） |
| `pnpm test` | 运行 `shared`、`web` 与 `backend` 的单元测试、契约测试与集成测试 |
| `pnpm --filter guiair-backend test:unit` | 单独运行后端引导测试与单元测试 |
| `pnpm --filter guiair-backend test:contracts` | 单独运行后端 OpenAPI 与共享契约一致性测试 |
| `pnpm --filter guiair-backend test:integration` | 单独运行后端 SQLite / 上传 / 鉴权集成测试 |
| `pnpm --filter guiair-backend test:bff` | 真实 Nuxt BFF 产物 + 真实 Express 后端端到端联测（**运行前须先执行 `pnpm --filter @guatswr/web build`**） |
| `pnpm test:tooling` | 运行仓库边界检查器、路由体积检查器、安全补丁探针与隔离 E2E 执行器自测 |
| `pnpm check:boundaries` | 校验浏览器端、Nitro 服务端与共享包之间的模块导入边界 |
| `pnpm check:security` | 校验 `patches/` 补丁 SHA-256 与漏洞修复探针，并执行 pnpm 在线安全审计 |
| `pnpm build` | 构建 `shared`、`web` 与 `backend` 全部生产产物 |
| `pnpm check:artifacts` | 校验构建产物完整性（无残留 Source Map、私有配置未混入客户端 bundle 等，需先 `pnpm build`） |
| `pnpm check:routes` | 启动无头浏览器测量各公开路由初始 JS 体积预算（需先 `pnpm build` 并安装 Chromium） |

**运行 Playwright 隔离 E2E 测试：**

E2E 测试会在 `3100`、`3181`、`3182` 端口启动隔离测试服务与合成数据夹具，不会触碰本地开发数据库。运行前请确保上述三个端口未被占用：

```sh
pnpm build
pnpm --filter @guatswr/web exec playwright install chromium
pnpm test:e2e
```

> [!NOTE]
> 在 Linux 主机上运行 Playwright E2E 或 Lighthouse 性能采集（`pnpm --filter @guatswr/web test:performance`）前，需先安装中文字体与浏览器系统依赖：`sudo apt-get update && sudo apt-get install -y fonts-noto-cjk && pnpm --filter @guatswr/web exec playwright install --with-deps chromium`。

<p align="right">(<a href="#readme-top">返回顶部</a>)</p>

## 服务器部署教程

本节以仓库根目录的 [`docker-compose.yml`](docker-compose.yml) 为标准部署入口：前端 `web` 与后端 `backend` 分别构建、分别运行，通过 Docker 网络连接。生产示例面向 Linux 服务器；Windows Docker Desktop 的局域网使用方式见第 8 节。正式发布还应对照 [发布检查清单](docs/backend-modernization/RELEASE-CHECKLIST.md) 和 [生产运行手册](docs/backend-modernization/RUNTIME-RUNBOOK.md)。

首次部署顺序为：**准备目录 → 配置环境变量 → 构建镜像 → 初始化或迁移数据库 → 启动容器 → 配置 HTTPS 并验收**。后文命令默认在仓库根目录执行；Linux 使用 Bash，标为 `powershell` 的命令用于 Windows PowerShell。

### 1. 容器拓扑与网络边界

```mermaid
flowchart TB
    Client["浏览器"] -->|"HTTPS :443"| Proxy["宿主机 Nginx / Caddy"]
    Proxy -->|"页面、API、图片 → 127.0.0.1:3100"| Web["web / Nuxt SSR + Nitro BFF"]
    subgraph DockerNet["Compose bridge 网络：guatswr_app"]
        Web -->|"http://backend:3000"| Backend["backend / Express"]
        Backend -->|"postgresql://guatswr_app@postgres:5432"| PG["postgres:18.6<br/>guatswr-postgres (:5432)"]
        Web -->|"postgresql://guatswr_app@postgres:5432"| PG
    end
    Backend --> Data["backend/data → /app/data"]
    Backend --> Backups["backend/backups → /app/backups"]
    PG --> PGData["deploy/postgres/data → /var/lib/postgresql/data"]
```

| 项目 | `web` | `backend` | `postgres` |
| --- | --- | --- | --- |
| 构建文件 / 基础镜像 | [`web/Dockerfile`](web/Dockerfile) | [`backend/Dockerfile`](backend/Dockerfile) | `postgres:18.6-bookworm@sha256:...` |
| 构建上下文 | 仓库根目录 `.` | 仓库根目录 `.` | 官方镜像直接拉取 |
| 默认镜像 | `guatswr-web:local` | `guatswr-backend:local` | `postgres:18.6-bookworm` |
| 容器监听 | `0.0.0.0:3100` | `0.0.0.0:3000` | `0.0.0.0:5432` |
| 默认宿主机发布 | `127.0.0.1:3100 → 3100` | 无 `ports` 映射 | 无 `ports` 映射（仅容器网内互通） |
| 运行配置 | `web/.env.production` | `backend/.env` | 根目录 `.env`（`POSTGRES_ADMIN_*`） |
| 健康探针 | `/api/health` | `/api/version`，并检查 `status=online` | `pg_isready -U ... -d postgres` |
| 持久化目录 | 命名卷 `guatswr_bff-state`（SQLite模式） | `/app/data`、`/app/backups` | `deploy/postgres/data`（宿主机 bind mount） |

当前架构按**一个 Web 实例、一个后端实例、一个专有 PostgreSQL 18 数据库实例**运行。虽然 BFF 状态与游客草稿已实现基于 AES-256-GCM + AAD 的数据库持久化存储（PostgreSQL `bff.records` 表或 SQLite `bff-state.db`），且后端支持 PostgreSQL 行级并发控制，但由于本地上传静态资源（`public/`、`asset-quarantine/`）以及内置定时调度任务（备份、清理）仍依赖本地文件系统协调，在引入对象存储（如 S3/MinIO）和分布式调度器前，生产环境依然保持单 Web、单后端实例部署，不应直接水平扩展服务副本。

浏览器只访问前端同源入口。`/api/*` 由 Nuxt 数据接口或 BFF 处理，`/uploads/*` 由 Nuxt 的图片代理读取后端资源。反向代理应把这些路径一并交给 `web`，不要将 `/api/` 直接转发到 Express。

三个核心服务共享 Compose 创建的专用 bridge 网络。`backend` 与 `postgres` 均为 Docker 服务名，Nuxt 的服务端通过 `http://backend:3000` 访问后端，后端与 Web 分别通过 `postgresql://guatswr_app@postgres:5432/...` 连接数据库；容器间通信不依赖宿主机 `8088` 端口、`host.docker.internal` 或宿主机回环。内部连接串属于私有运行配置，严禁放入浏览器端暴露。

此网络保留后端访问 Bot/Webhook 等外部服务的出站能力，未设置 `internal: true`。后端与数据库均没有宿主机端口发布；同一 Docker 网络内的其他容器仍可能连接后端，访客写入还需要桥接密钥和受信任代理校验。

默认网络参数为子网 `172.30.88.0/24`、网关 `172.30.88.1`、Web 容器地址 `172.30.88.10`、PostgreSQL 容器地址 `172.30.88.15`。后端仅信任 Web 的 `/32` 地址，前端默认信任 bridge 网关的 `/32` 地址。实际代理对端可能因 Docker Desktop、额外反向代理或网络模式而变化，上线前应按实际链路核对；不要将受信任代理范围扩大到所有来源。

根目录 Compose 的项目名默认为 `guatswr`，容器名通常为 `guatswr-web-1`、`guatswr-backend-1`、`guatswr-postgres`。下文使用服务名执行命令，不依赖自动生成的容器名。已有的 [`backend/docker-compose.yml`](backend/docker-compose.yml) 是**独立后端入口**，发布宿主机回环 `8088`；完整多容器部署统一使用根目录文件。切换前停止旧服务，避免两套后端同时写入同一组数据。

### 2. 环境要求与持久化目录

#### 2.1 Docker 环境

需要支持 Linux 容器和多阶段构建的 Docker Engine/Docker Desktop，以及支持 `up --wait` 和健康依赖的 Docker Compose 插件。本文使用 `docker compose` 命令。先确认 Docker 服务已启动：

```sh
docker version
docker compose version
```

使用容器构建和运行时，宿主机不需要安装 Node.js、pnpm、SQLite 或 Python。构建会下载基础镜像、系统软件包和 pnpm 依赖，并执行前端安全检查；构建机需能访问对应软件源。密钥生成示例使用 OpenSSL，也可使用密码管理器生成高熵随机密钥。

#### 2.2 Linux 目录与权限

以下示例假设仓库位于 `/srv/guatswr/repo`。应用镜像以非 root 用户 `node` 运行，UID/GID 为 `1000:1000`；PostgreSQL 官方镜像运行用户为 `postgres`（Debian/Bookworm 下通常为 UID/GID `999:999` 或 `70:70`）。Compose 的 bind mount 设置了 `create_host_path: false`，必须提前创建源目录并授予对应运行用户权限：

```sh
cd /srv/guatswr/repo
# 1. 创建应用与数据库挂载目录
sudo mkdir -p backend/data/public backend/backups deploy/postgres/data /srv/guatswr/verify-work

# 2. 设置应用用户（node: 1000:1000）权限
sudo chown -R 1000:1000 backend/data backend/backups /srv/guatswr/verify-work
sudo chmod 700 backend/data backend/backups /srv/guatswr/verify-work
sudo chmod 755 backend/data/public

# 3. 设置 PostgreSQL 容器数据目录权限（UID 999）
sudo chown -R 999:999 deploy/postgres/data
sudo chmod 700 deploy/postgres/data
```

上述命令用于新目录。旧状态目录应先停写并备份，再修正准确的目标路径。容器启动不会自动对挂载卷执行递归 `chown`。

| 宿主机默认目录 | 容器路径 | 内容 |
| --- | --- | --- |
| `backend/data` | `/app/data` | 主库、审计库、私有上传、隔离区、文件发布恢复状态 |
| `backend/data/public` | `/app/data/public` | 通过 `/uploads/*` 提供的公开图片；它是数据卷内的子目录 |
| `backend/backups` | `/app/backups` | 数据库、资源和全量备份归档 |
| `deploy/postgres/data` | `/var/lib/postgresql/data` | PostgreSQL 18 专有数据库集簇目录（含 main/audit/bff 模式及事务日志） |

`data/public`、`data/asset-quarantine`、`data/asset-publications` 应与 `data` 保持在同一个本地文件系统，以支持原子文件移动。不要另行将 `public` 子目录挂载到不同文件系统，也不要把数据库、备份或私有上传目录放进公开资源树。

Windows Docker Desktop 使用工作区下的 `backend/data`、`backend/backups` 作为 bind mount 时，应先创建目录，并确认 Docker Desktop 有权访问该磁盘。Linux 的 `chown/chmod` 命令不适用于 Windows ACL；数据库与资源仍应位于本地磁盘，避免放在网络共享或同步盘中。

### 3. 环境变量与 Compose 参数（前后端 .env 填写教程）

#### 3.1 配置文件分层与职责划分

GuatSWR 采用严格的**分层配置模型**，确保容器编排、服务端 BFF、核心 API 与分析统计之间的安全边界清晰独立：

| 配置层级 | 默认文件路径 | 作用容器/进程 | 核心职责与运维说明 |
| :--- | :--- | :--- | :--- |
| **Compose 插值层** | 仓库根目录 `.env`<br>（或命令行 `--env-file`） | Docker CLI / Compose 编排引擎 | 控制部署镜像标签（`BACKEND_SOURCE_REVISION`）、对外映射端口（`WEB_PORT`）与监听 IP、容器资源配额（CPU/Memory/PIDs）、专属网络子网、Umami 统计栈 PostgreSQL 密码与持久化目录等。 |
| **后端进程环境** | `backend/.env` | `guatswr-backend` 容器<br>（Express 5 进程） | 业务核心机密：JWT 鉴权密钥、管理员 2FA 加密密钥、BFF 内部桥接密钥、站点规范 Origin 与 CORS 白名单、接口流控与单请求体配额、定时备份所有权、可选 Bot/Webhook 平台集成等。 |
| **前端进程环境** | `web/.env.production`<br>（本地开发为 `web/.env`） | `guatswr-web` 容器<br>（Nuxt 4 / Nitro BFF） | BFF 代理与安全：服务端会话与 CSRF 签名密钥、BFF 内部桥接密钥（必须与后端一致）、写操作严格 Origin 白名单、站点 SEO 索引策略、**搜索引擎所有权 HTML 验证标签**（百度/Google/Bing/搜狗/360/自定义）、OpenList 网盘对接、Umami 统计脚本注入等。 |

> [!IMPORTANT]
> **关键加载时机与注意事项**：
> 1. `docker compose --env-file deploy.env ...` 仅仅是 **Compose 命令行插值文件**，不会自动替代容器内部服务的 `env_file`。若需切换配置文件名，应在插值文件中显式设置 `BACKEND_ENV_FILE` 与 `WEB_ENV_FILE`。
> 2. Nuxt 生产产物由 `node .output/server/index.mjs` 运行，**生产模式下不会自动扫描读取宿主机上的 `web/.env` 文件**。所有前端配置均通过 `web/.env.production` 并在容器创建时注入环境变量。
> 3. 修改任何 `.env` 文件后，必须**重新创建或重启对应容器**（如 `docker compose up -d --pull never` 或 `docker compose restart <service>`）才能使新配置生效。
> 4. 容器内存储路径始终固定为 `/app/data`、`/app/data/public`、`/app/backups` 与 `/app/state`，不受宿主机本地目录名变化影响。部署配置与密钥严禁提交至 Git（根目录 `.dockerignore` 与 `.gitignore` 已排除所有环境文件）。

---

#### 3.2 密钥批量生成快捷命令

生产部署时，**严禁使用弱口令或跨服务复用同一个密钥**。请在安全的终端执行以下任一命令，一键生成全套独立的加密密钥：

<details open>
<summary>Node.js 一键批量生成（跨平台推荐）</summary>

```bash
node -e "
const crypto = require('node:crypto');
console.log('=== GuatSWR 运维密钥批量生成（请妥善保存） ===\n');
console.log('JWT_SECRET (backend/.env):                 ' + crypto.randomBytes(32).toString('hex'));
console.log('TWOFA_SECRET (backend/.env，可选独立):      ' + crypto.randomBytes(32).toString('hex'));
console.log('BFF_BRIDGE_SECRET (前后端必须完全一致):    ' + crypto.randomBytes(32).toString('hex'));
console.log('NUXT_SESSION_PASSWORD (web/.env.production):' + crypto.randomBytes(32).toString('hex'));
console.log('UMAMI_HASH_SALT (根目录 .env 统计盐值):     ' + crypto.randomBytes(32).toString('hex'));
console.log('UMAMI_DB_PASSWORD (根目录 .env PG密码):     ' + crypto.randomBytes(16).toString('hex'));
console.log('BOT_CREDENTIAL_ENCRYPTION_KEY (选填Bot):   ' + crypto.randomBytes(32).toString('hex'));
"
```

</details>

<details>
<summary>Linux / macOS 终端 OpenSSL 逐个生成</summary>

```bash
# 生成 32 字节（64 位十六进制）安全随机数：
openssl rand -hex 32
```

</details>

> [!WARNING]
> 1. `JWT_SECRET`、`BFF_BRIDGE_SECRET`、`NUXT_SESSION_PASSWORD` 三者**必须各自独立**，绝不可混用。
> 2. **`BFF_BRIDGE_SECRET`（后端）与 `NUXT_BFF_BRIDGE_SECRET`（前端）必须 100% 相同**且不少于 32 个字符。这是前端 BFF 代理向后端发起特权请求（如游客投稿、匿名草稿校验）的加密数字签名依据，若不一致将导致所有投稿和文件上传出现 `401 Unauthorized` 或 `500 Guest Proof Invalid`。

---

#### 3.3 后端配置填写教程：`backend/.env`

首次部署时复制模板：
```bash
cp backend/.env.example backend/.env
chmod 600 backend/.env
```

##### 完整生产配置模板

```dotenv
# ==========================================
# 1. 核心运行与端口（Docker 编排下由 Compose 固定）
# ==========================================
NODE_ENV=production
BIND_HOST=0.0.0.0
PORT=3000

# ==========================================
# 2. 数据库驱动与连接（生产环境固定连接 postgres 容器）
# ==========================================
# 数据库驱动：postgres（生产推荐专有实例）或 sqlite（轻量开发）
DATABASE_DRIVER=postgres
# PostgreSQL 业务连接串（以非特权应用角色 guatswr_app 访问专有库）
POSTGRES_URL=postgresql://guatswr_app:your_app_password_here@postgres:5432/guatswr_migration_prod
# 运维与备份/恢复专用连接（由运维 CLI 脚本读取，可选）：
# POSTGRES_MIGRATION_URL=postgresql://guatswr_admin:password@postgres:5432/postgres
# POSTGRES_BACKUP_URL=postgresql://guatswr_app:password@postgres:5432/guatswr_migration_prod

# ==========================================
# 3. 身份鉴权与安全密钥（必填，请替换为随机密文）
# ==========================================
# 业务 JWT 签名密钥（64 位十六进制字符，已有部署请保留历史值以防用户掉线）
JWT_SECRET=your_jwt_secret_64_hex_chars_here
# 管理员二步验证二次密码加密密钥（选填；留空则默认复用 JWT_SECRET；服务器迁移时须保留历史值）
TWOFA_SECRET=your_twofa_secret_64_hex_chars_here
# BFF 内部桥接密钥（必须与 web/.env.production 的 NUXT_BFF_BRIDGE_SECRET 完全一致）
BFF_BRIDGE_SECRET=your_bridge_secret_64_hex_chars_here
# 游客草稿签名校验模式：生产环境固定为 required
GUEST_DRAFT_PROOF_MODE=required

# ==========================================
# 4. 站点域名与网络边界
# ==========================================
# 规范公网站点 Origin（末尾严禁加斜杠 /）
SITE_URL=https://www.guatswr.top
# 允许跨域请求的 Origin（末尾严禁加斜杠 /，多个用逗号隔开）
CORS_ORIGINS=https://www.guatswr.top
# 可信反向代理/BFF 的 CIDR 列表（Docker 生产环境下由 Compose 自动指定为前端 IP 172.30.88.10/32）
# TRUST_PROXY_CIDRS=172.30.88.10/32

# ==========================================
# 5. 流量控制与运行限制
# ==========================================
# 单一独立访客 IP 每分钟允许的最大请求数（超额将触发短暂封禁）
GLOBAL_RATE_LIMIT=600
# 共享反代总流量配额（来自可信前端但缺失独立访客 IP 时的每分钟兜底限额）
SHARED_PROXY_RATE_LIMIT=6000
# 最大单请求体大小（与前端上传上限保持匹配）
MAX_BODY_SIZE=50mb
# 上传暂存文件过期回收周期（毫秒，默认 48 小时）
STAGING_TTL_MS=172800000

# ==========================================
# 6. 定时任务与存储（Docker 模式下路径由 Compose 固定挂载）
# ==========================================
# 备份调度器执行主体：app（后端内置定时器按后台规则自动执行）或 external（外部 crontab）
BACKUP_SCHEDULER_OWNER=app
# 容器内固定路径（Compose 已预设挂载，无需在 .env 中修改）：
# DATA_DIR=/app/data
# PUBLIC_DIR=/app/data/public
# BACKUP_ROOT=/app/backups

# ==========================================
# 7. Bot / AstrBot 机器人集成（可选功能，不用可保持关闭）
# ==========================================
# 是否启用 Bot 平台接口（启用前主库须已显式执行 migrate v4/v6）
BOT_PLATFORM_ENABLED=false
# Bot 凭据本地静态加密密钥（32 字节十六进制，开启 Bot 必填且须妥善异地备份）
# BOT_CREDENTIAL_ENCRYPTION_KEY=
# 发往 AstrBot 实例的 Webhook 接收端完整 URL
# ASTRBOT_WEBHOOK_URL=https://bot.example.com/api/webhook
# 发往 AstrBot 的身份认证 Bearer Token
# ASTRBOT_TOKEN=
# Webhook 请求超时（毫秒）
ASTRBOT_TIMEOUT_MS=5000
# 推送给 Bot 的富媒体素材公网基础 Origin（留空则自动回退至 SITE_URL）
# BOT_PUBLIC_ASSET_BASE_URL=https://www.guatswr.top
```

##### 关键参数说明表

| 变量名 | 是否必填 | 格式规范与示例 | 详细作用与运维注意事项 |
| :--- | :---: | :--- | :--- |
| `DATABASE_DRIVER` | **必填** | `postgres` 或 `sqlite` | 后端数据库驱动类型。生产环境建议设置为 `postgres` 并配合专有 PostgreSQL 容器运行；开发或单体环境设为 `sqlite`。 |
| `POSTGRES_URL` | PG模式必填 | `postgresql://guatswr_app:pwd@postgres:5432/guatswr_migration_prod` | 后端连接业务 PostgreSQL 专有数据库的 URL，必须使用经受限授权的非特权应用角色（如 `guatswr_app`）。 |
| `JWT_SECRET` | **必填** | 64 位十六进制随机字符串 | 用于签发并校验管理端会话与 API 访问令牌。**生产环境严禁随意更改**，轮换密钥将导致当前所有已登录管理员的 Token 立即失效。 |
| `TWOFA_SECRET` | 选填 | 64 位十六进制随机字符串 | 用于加密数据库中管理员配置的二步验证二级密码。若留空则自动回退到 `JWT_SECRET`；**跨服务器数据迁移时必须保持原值不变**，否则管理员无法通过二步验证登录。 |
| `BFF_BRIDGE_SECRET` | **必填** | 32～256 位 ASCII 字符串 | 后端用于校验来自前端 Nitro BFF 网关的 HMAC-SHA256 请求签名（游客活动报名、游客草稿创建等）。**必须与前端完全一致**。 |
| `GUEST_DRAFT_PROOF_MODE` | **必填** | `required` 或 `optional` | 控制是否强制要求前端附带 BFF 证明签名。生产环境请保持 `required`，确保写操作不可绕过 BFF 安全门禁直接伪造。 |
| `SITE_URL` | **必填** | `https://www.guatswr.top` | 站点的正规对外主域名。**末尾严禁携带斜杠 `/`**。影响邮件通知、日志脱敏与绝对路径拼接。 |
| `CORS_ORIGINS` | **必填** | `https://www.guatswr.top` | 允许跨域资源共享的 Origin。同样**末尾不可带斜杠**。如有备用域名或管理端独立域名，可用逗号分隔：`https://a.top,https://b.top`。 |
| `GLOBAL_RATE_LIMIT` | 选填 | 正整数，默认 `600` | 后端对单个客户端真实 IP 的每分钟滑动窗口请求限额。防范脚本暴力扫描与 CC 攻击。 |
| `BACKUP_SCHEDULER_OWNER`| 选填 | `app` 或 `external` | 设为 `app` 时，后端启动后会自动拉取后台“备份设置”并执行定时滚动备份与过期清理；设为 `external` 则完全交由宿主机外部定时任务管控。 |

> [!NOTE]
> Compose 会覆盖后端的 `NODE_ENV=production`、`PORT=3000`、`BIND_HOST=0.0.0.0`、容器内存储路径与 `TRUST_PROXY_CIDRS`。不要用修改 `backend/.env` 的 `PORT` 来调整宿主机对外端口。

---

#### 3.4 前端配置填写教程：`web/.env.production`

首次部署时复制模板：
```bash
cp web/.env.example web/.env.production
chmod 600 web/.env.production
```

##### 完整生产配置模板

```dotenv
# ==========================================
# 1. 内部通信与运行基础（Docker 编排下由 Compose 固定）
# ==========================================
NODE_ENV=production
HOST=0.0.0.0
PORT=3100
# 后端在 Compose 网络内的内部服务地址（必须带协议与端口，严禁带 /api 后缀）
NUXT_API_BASE=http://backend:3000

# ==========================================
# 2. BFF 状态持久化与数据库驱动（必填）
# ==========================================
# 状态驱动模式：postgres（生产推荐专有实例）或 sqlite
BFF_DATABASE_DRIVER=postgres
# BFF PostgreSQL 连接串（以非特权应用角色连接专有库，留空则回退至 POSTGRES_URL）
BFF_POSTGRES_URL=postgresql://guatswr_app:your_app_password_here@postgres:5432/guatswr_migration_prod

# ==========================================
# 3. BFF 核心会话与安全凭证（必填）
# ==========================================
# BFF 会话封存与 CSRF 签名密钥（至少 32 字符，使用 HKDF-SHA256 派生 AES-256-GCM 密钥）
NUXT_SESSION_PASSWORD=your_session_password_at_least_32_chars_long
# 内部桥接密钥（必须与 backend/.env 的 BFF_BRIDGE_SECRET 100% 完全相同）
NUXT_BFF_BRIDGE_SECRET=your_bridge_secret_64_hex_chars_here
# 允许发起写操作的 Origin 列表（必须是合法的 JSON 字符串数组，末尾严禁加斜杠 /）
NUXT_BFF_AUTH_ALLOWED_ORIGINS=["https://www.guatswr.top"]
# 仅在非生产环境且连接与 Host 均为回环地址时允许明文 HTTP Cookie（生产环境必须为 false）
NUXT_BFF_AUTH_ALLOW_INSECURE_LOOPBACK_COOKIES=false

# ==========================================
# 4. 站点 SEO、索引与规范域名
# ==========================================
NUXT_SITE_URL=https://www.guatswr.top
NUXT_SITE_ENV=production
# 生产环境开启搜索引擎爬虫索引（预发布/测试环境请填 false）
NUXT_SITE_INDEXABLE=true

# ==========================================
# 5. 搜索引擎与站点所有权 HTML 标签验证
# ==========================================
# 百度搜索资源平台验证（支持纯 Token 如 codeva-xxx，或整段 <meta name="..." content="..." />）
NUXT_PUBLIC_SITE_VERIFICATION_BAIDU=codeva-g9JIawSEQ3
# Google Search Console 网站所有权验证（可选）
# NUXT_PUBLIC_SITE_VERIFICATION_GOOGLE=google_verification_token
# 必应 Bing Webmaster Tools 验证（可选，对应 msvalidate.01）
# NUXT_PUBLIC_SITE_VERIFICATION_BING=bing_verification_token
# 搜狗站长平台验证（可选，对应 sogou_site_verification）
# NUXT_PUBLIC_SITE_VERIFICATION_SOGOU=sogou_verification_token
# 360 搜索站长平台验证（可选，对应 360-site-verification）
# NUXT_PUBLIC_SITE_VERIFICATION_SO=360_verification_token
# 自定义/其他验证标签（可选，支持 JSON 数组、对象或 key=val 逗号分隔列表）
# NUXT_PUBLIC_SITE_VERIFICATION_CUSTOM=bytedance-verification-code=xyz123,yandex-verification=abc456

# ==========================================
# 6. OpenList v3 网盘与资源站对接（可选）
# ==========================================
# 网盘基础 API 地址
NUXT_OPENLIST_BASE_URL=https://pan.guatswr.top
# 公共资源对外下载与预览地址
NUXT_OPENLIST_PUBLIC_URL=https://pan.guatswr.top
# OpenList v3 认证 Token（在网盘后台“管理 - 用户/Token”中生成）
NUXT_OPENLIST_TOKEN=openlist-your-api-token-here
# 资源挂载的网盘根路径
NUXT_OPENLIST_ROOT_PATH=/社团资源
# 网盘接口交互超时时间（毫秒）
NUXT_OPENLIST_TIMEOUT_MS=8000
# 临时上传资源缓存目录（留空则默认使用系统临时目录）
# NUXT_OPENLIST_UPLOAD_TEMP_DIR=

# ==========================================
# 7. Umami 访问统计分析集成（可选）
# ==========================================
# 统计脚本公网可访问地址（默认接入本地统一栈 https://stats.guatswr.top/script.js）
# NUXT_PUBLIC_UMAMI_SCRIPT_URL=https://stats.guatswr.top/script.js
# Umami 站点 ID（从 Umami 后台获取的 UUID 标识）
# NUXT_PUBLIC_UMAMI_WEBSITE_ID=2b03bf5d-751a-4a7c-be54-d545fe250209

# ==========================================
# 8. Komari 服务器监控内网联通（可选）
# ==========================================
# Komari JSON-RPC2 内网服务地址（Docker 编排下默认自动注入为 http://komari:25774）
# NUXT_KOMARI_BASE_URL=http://komari:25774
# NUXT_KOMARI_TIMEOUT_MS=5000
```

##### 关键参数说明表

| 变量名 | 是否必填 | 格式规范与示例 | 详细作用与运维注意事项 |
| :--- | :---: | :--- | :--- |
| `BFF_DATABASE_DRIVER` | **必填** | `postgres` 或 `sqlite` | BFF 服务端状态持久化存储驱动。生产环境建议设置为 `postgres`，会话与草稿将加密存入 PostgreSQL 的 `bff.records` 表。 |
| `BFF_POSTGRES_URL` | PG模式推荐 | `postgresql://guatswr_app:pwd@postgres:5432/guatswr_migration_prod` | BFF 连接 PostgreSQL 的专有连接串。留空时会自动回退使用 `POSTGRES_URL`。 |
| `NUXT_SESSION_PASSWORD` | **必填** | 至少 32 个字符的随机字符串 | 用于派生会话封存（AES-256-GCM）与 CSRF 防伪校验密钥。**生产环境严禁泄露或随意变更**（变更会导致当前已登录管理会话全部注销）。 |
| `NUXT_BFF_BRIDGE_SECRET` | **必填** | 32～256 位 ASCII 字符串 | **必须与后端的 `BFF_BRIDGE_SECRET` 完全一致**。 |
| `NUXT_BFF_AUTH_ALLOWED_ORIGINS` | **必填** | **标准 JSON 字符串数组**<br>`["https://www.guatswr.top"]` | **防 CSRF 核心屏障**。所有向 `/api/bff/**` 发起的写请求（POST/PUT/DELETE/PATCH）的 `Origin` 必须精确匹配此列表中的某一项。**严禁包含末尾斜杠 `/`**。如需允许多个域名，写为 `["https://www.guatswr.top","https://guatswr.top"]`。 |
| `NUXT_PUBLIC_SITE_VERIFICATION_BAIDU` | 选填 | `codeva-g9JIawSEQ3` 或完整 `<meta ...>` | **百度站长平台验证**。系统会在公开页面（包括首页 `/`）的服务端渲染 `<head>` 中动态注入 `<meta name="baidu-site-verification" content="...">`。<br>运维人员既可以直接填纯 Token，也可以整段粘贴百度提供的标签代码，系统会自动提取并过滤危险字符。修改后无需重新构建镜像，**重启容器即刻生效**。 |
| `NUXT_PUBLIC_SITE_VERIFICATION_GOOGLE` | 选填 | 谷歌验证 Token | 自动渲染为 `<meta name="google-site-verification" content="...">`。 |
| `NUXT_PUBLIC_SITE_VERIFICATION_BING` | 选填 | 必应验证 Token | 自动渲染为 `<meta name="msvalidate.01" content="...">`。 |
| `NUXT_PUBLIC_SITE_VERIFICATION_SOGOU` | 选填 | 搜狗验证 Token | 自动渲染为 `<meta name="sogou_site_verification" content="...">`。 |
| `NUXT_PUBLIC_SITE_VERIFICATION_SO` | 选填 | 360 搜索验证 Token | 自动渲染为 `<meta name="360-site-verification" content="...">`。 |
| `NUXT_PUBLIC_SITE_VERIFICATION_CUSTOM`| 选填 | `k1=v1,k2=v2` 或 JSON 数组 | 任意其他第三方平台的所有权验证标签，均会被安全解析并注入到 `<head>`。 |
| `NUXT_OPENLIST_TOKEN` | 选填 | `openlist-xxx...` | OpenList 网盘通信密钥。配置后网站 `/resources` 页面可在线浏览、搜索与直链下载社团公共资源文件。 |

---

#### 3.5 根目录 Compose 插值与 Umami 配置：`.env`

根目录下的 `.env` 文件是 Docker Compose 在解析 `docker-compose.yml` 时的参数插值源。

首次部署时复制模板：
```bash
cp .env.example .env
chmod 600 .env
```

##### 完整生产配置模板

```dotenv
# ==========================================
# 1. 镜像构建与发布版本控制
# ==========================================
# 当前部署的源码 Git Commit Hash（执行 git rev-parse HEAD 获得）
BACKEND_SOURCE_REVISION=d1920b77f54e5a7e62bc46fa214786cc9b10ec1e
# Docker 镜像源前缀（国内镜像加速，结尾必须带斜杠 /；可选）
# IMAGE_REGISTRY=docker.m.daocloud.io/

# ==========================================
# 2. 宿主机网络与端口映射
# ==========================================
# 前端服务在宿主机的监听 IP（生产环境固定为 127.0.0.1，仅供宿主机 Nginx 反代；若局域网直连可改具体局域网 IP）
WEB_BIND_ADDRESS=127.0.0.1
# 前端服务在宿主机的对外映射端口（内部容器端口固定为 3100）
WEB_PORT=3100

# ==========================================
# 3. 容器资源上限约束（安全基线配置）
# ==========================================
BACKEND_MEMORY_LIMIT=1g
BACKEND_CPU_LIMIT=1.5
BACKEND_PIDS_LIMIT=256
WEB_MEMORY_LIMIT=1g
WEB_CPU_LIMIT=1.5
WEB_PIDS_LIMIT=256

# ==========================================
# 4. Umami 网站统计分析服务（统一技术栈）
# ==========================================
# PostgreSQL 数据库密码（请生成高强度随机字符串）
UMAMI_DB_PASSWORD=your_umami_db_password_here
# Umami 内部数据混淆盐值（请生成随机字符串）
UMAMI_HASH_SALT=your_umami_hash_salt_here
# Umami Web 界面宿主机映射端口（反代至 https://stats.guatswr.top）
UMAMI_PORT=13036
# Umami Web 宿主机监听 IP（建议 127.0.0.1，仅供 Nginx 反向代理）
UMAMI_BIND_ADDRESS=127.0.0.1
# Umami PostgreSQL 数据文件持久化目录
UMAMI_DB_DATA_DIR=/opt/umami/umami-db-data
# IP 归属地 GeoIP 数据库目录
UMAMI_GEO_DIR=/opt/umami/geo

# ==========================================
# 5. Komari 服务器监控面板（统一技术栈，内网联通 web）
# ==========================================
# Komari 持久化数据目录（挂载至容器内 /app/data）
KOMARI_DATA_DIR=/opt/komari/data
# 宿主机 Agent 上报与反代监听地址/端口
KOMARI_BIND_ADDRESS=127.0.0.1
KOMARI_PORT=25774

# ==========================================
# 6. PostgreSQL 18 专有业务数据库（生产推荐）
# ==========================================
# PostgreSQL 官方容器镜像（固定主版本 18.6 及完整 sha256 摘要）
# POSTGRES_IMAGE=postgres:18.6-bookworm@sha256:f1ea2a1a4fb7b68d4836be1fdcb8a6466a89b072158bf9d97663600538c294c5
# PostgreSQL 管理员角色（用于创建数据库、模式并授予应用角色权限）
POSTGRES_ADMIN_USER=guatswr_admin
# PostgreSQL 管理员强密码（必填高熵随机字符串）
POSTGRES_ADMIN_PASSWORD=your_secure_postgres_admin_password_here
# PostgreSQL 数据库集簇宿主机持久化目录（权限 999:999 700）
POSTGRES_DATA_DIR=./deploy/postgres/data
# 容器资源上限
POSTGRES_MEMORY_LIMIT=512m
POSTGRES_CPU_LIMIT=1.0
```

##### 关键参数说明表

| 参数名 | 默认值 | 详细作用与运维注意事项 |
| :--- | :--- | :--- |
| `BACKEND_SOURCE_REVISION` | `local` | 同时作为 `guatswr-backend` 与 `guatswr-web` 镜像的 tag。升级版本时应先执行 `git rev-parse HEAD` 并写入该变量，确保容器镜像版本与 Git 提交记录精确对齐。 |
| `WEB_BIND_ADDRESS` | `127.0.0.1` | 前端宿主机监听地址。强烈建议仅监听 `127.0.0.1`，再由宿主机统一配置 Nginx/Caddy 对外提供 HTTPS 与证书管理；局域网演示时可临时配置为局域网 IP。 |
| `WEB_PORT` | `3100` | 前端宿主机对外映射端口。内部容器端口固定为 `3100`。 |
| `DOCKER_SUBNET` | `172.30.88.0/24` | 专用 bridge 子网；需避开宿主机物理网络、VPN 与已有 Docker 网络。 |
| `DOCKER_GATEWAY` | `172.30.88.1` | 上述子网内的网关；同时用于前端默认代理信任列表。 |
| `DOCKER_WEB_IP` | `172.30.88.10` | 同一子网内的固定 Web 地址；后端信任其 `/32`。 |
| `DOCKER_POSTGRES_IP` | `172.30.88.15` | 同一子网内的固定 PostgreSQL 地址；供 backend 与 web 容器内部直连。 |
| `BACKEND_MEMORY_LIMIT` | `1g` | 后端容器内存硬上限，防止内存泄露打爆宿主机。配套有 10MB × 3 的自动切分日志轮转策略。 |
| `WEB_MEMORY_LIMIT` | `1g` | 前端容器内存硬上限。挂载有独立 `bff-state` 持久卷（SQLite 模式）。 |
| `POSTGRES_ADMIN_USER` | `guatswr_admin` | 专有 PostgreSQL 容器超级管理用户。仅供初始化数据库模式与运维备份/恢复使用，应用运行时使用受限应用角色。 |
| `POSTGRES_ADMIN_PASSWORD` | 无默认值 | 专有 PostgreSQL 管理员密码。生产环境**必须设置高强度随机密文**。 |
| `POSTGRES_DATA_DIR` | `./deploy/postgres/data` | 专有 PostgreSQL 数据文件宿主机挂载目录。 |
| `UMAMI_DB_PASSWORD` | 无默认值 | 统一栈内 PostgreSQL 密码。生产环境必须设置强口令。数据库文件独立存储在 `UMAMI_DB_DATA_DIR` 下。 |

---

#### 3.6 运维常见配置排错速查 (FAQ)

##### Q1: 提交活动草稿、游客投稿或在管理后台保存时提示 `403 Forbidden: Origin not allowed`？
- **排查原因**：前端 BFF 开启了严格的 Origin 跨站请求伪造保护。检查发现请求头中的 `Origin` 未在白名单中。
- **解决方法**：
  1. 查看浏览器 Network 面板中写请求（如 `/api/bff/**`）的 Request Headers 中的 `Origin` 值（例如 `https://www.guatswr.top`）。
  2. 检查 `web/.env.production` 中的 `NUXT_BFF_AUTH_ALLOWED_ORIGINS`，必须是合法的 JSON 数组且**严禁包含末尾斜杠**。
  3. 正确写法：`NUXT_BFF_AUTH_ALLOWED_ORIGINS=["https://www.guatswr.top"]`。
  4. 错误写法：`NUXT_BFF_AUTH_ALLOWED_ORIGINS=["https://www.guatswr.top/"]`（多了一个 `/` 将导致比对失败）。
  5. 修改后执行 `docker compose restart web`。

##### Q2: 游客活动投稿时提示 `500 Internal Error` 或后端日志显示 `guest proof verification failed`？
- **排查原因**：前端 BFF 与后端之间的数字验签密钥不匹配。
- **解决方法**：
  1. 打开 `backend/.env` 检查 `BFF_BRIDGE_SECRET`。
  2. 打开 `web/.env.production` 检查 `NUXT_BFF_BRIDGE_SECRET`。
  3. 确认两处的密文**完全一致且长度大于等于 32 个字符**。修改后重新拉起容器。

##### Q3: 修改了 `web/.env.production`（如添加了搜索引擎验证码），刷新网页却看不到 `<meta>` 标签？
- **排查原因**：Docker 容器内的 Node 进程仅在启动初始化时读取环境变量，直接修改宿主机文件不会自动热更新正在运行的容器。
- **解决方法**：
  - 无需重新执行漫长的镜像构建打包，直接执行平滑重启命令即可使新配置生效：
    ```bash
    docker compose restart web
    ```
  - 重启后在宿主机验证：
    ```bash
    curl -fsSL http://127.0.0.1:3100/ | grep -i "baidu-site-verification"
    ```

##### Q4: 重启或重新部署前端容器后，管理员是否会掉线需要重新登录？
- **解答**：**不会**。
  - 在生产模式（`BFF_DATABASE_DRIVER=postgres`）下，BFF 会话凭据与游客草稿通过 AES-256-GCM + AAD 加密持久化存储在专有 PostgreSQL 的 `bff.records` 表中。
  - 在本地轻量模式（`BFF_DATABASE_DRIVER=sqlite`）下，会话凭据加密持久化存储在 Docker 命名卷 `guatswr_bff-state`（挂载至容器内 `/app/state`）的 SQLite 数据库中。
  - 无论哪种模式，只要数据库/持久卷正常存在且 `NUXT_SESSION_PASSWORD` 保持不变，容器重启、销毁重建或升级均不会导致管理会话掉线。
  - 若遇紧急安全事件需**强制注销所有在线管理员**，只需在 `web/.env.production` 中轮换 `NUXT_SESSION_PASSWORD` 并重启 `web` 容器，或在后台执行全局令牌版本刷新即可。

##### Q5: `NUXT_BFF_AUTH_ALLOWED_ORIGINS` 在启动时报错 `JSON.parse error`？
- **排查原因**：在 `.env` 文件中使用了单引号（如 `['https://...']`），而标准 JSON 规范要求必须使用**双引号**。
- **解决方法**：
  - 务必使用英文双引号：`NUXT_BFF_AUTH_ALLOWED_ORIGINS=["https://www.guatswr.top"]`
  - 若在某些特殊 Shell 环境中双引号被吃掉，可使用单引号将整体包裹：`NUXT_BFF_AUTH_ALLOWED_ORIGINS='["https://www.guatswr.top"]'`

### 4. 构建与镜像版本管理

配置文件与目录准备完成后，从仓库根目录执行：

```sh
cd /srv/guatswr/repo
export BACKEND_SOURCE_REVISION="$(git rev-parse HEAD)"
docker compose config --quiet
docker compose build
```

生产构建应使用明确的 Git 修订与已审核源码；`BACKEND_SOURCE_REVISION` 只是标记，不会验证工作区是否包含未提交改动。镜像标签默认只保存在本机构建机，Compose 不会自动把镜像推送到镜像仓库。

前后端均为多阶段镜像。后端构建共享包与编译产物，通过 `pnpm deploy --prod` 安装生产依赖；前端依次执行依赖安全检查、类型检查、lint、单元测试、生产构建和产物检查。前端契约测试只在构建阶段读取后端路由声明，最终运行镜像仅复制 Nuxt `.output`，不携带后端应用。

构建失败应先阅读第一个失败步骤的日志。不要通过跳过测试或复制宿主机 `node_modules` 绕过构建问题。两个 Dockerfile 都依赖根目录工作区文件，单独构建也必须使用根目录作为上下文：

```sh
docker compose build backend
docker compose build web
```

若已有与本次配置标签一致的镜像，可在后续启动时使用 `--no-build`。没有显式修订时会使用 `:local`，适合本地验证；正式发布应固定并记录修订标签。

### 5. 数据库初始化与历史数据接管

应用启动只校验迁移状态，不会自动创建可用数据库、接管历史库或执行结构变更。下列命令通过一次性的后端容器或宿主机 CLI 运行：`--no-deps` 不启动关联服务，`--rm` 在命令结束后移除临时容器；挂载目录中的数据会保留。

#### 5.1 生产标准：PostgreSQL 18 专有数据库初始化与管理员引导

全新生产部署推荐直接使用 PostgreSQL 18 专有容器：

```sh
# 1. 启动专有 postgres 容器并等待其就绪
docker compose up -d postgres
docker compose ps postgres

# 2. 通过后端容器内的专有迁移 CLI 初始化 main/audit/bff 模式与应用角色权限
docker compose run --rm --no-deps \
  -e POSTGRES_MIGRATION_URL="postgresql://${POSTGRES_ADMIN_USER}:${POSTGRES_ADMIN_PASSWORD}@postgres:5432/postgres" \
  backend node dist/src/migrations/postgres/cli.js initialize guatswr_migration_prod guatswr_app
```

接着引导首位超级管理员：

```bash
read -r -p '超级管理员用户名: ' SUPER_ADMIN_USERNAME
read -r -s -p '超级管理员密码: ' SUPER_ADMIN_PASSWORD
printf '\n'
export SUPER_ADMIN_USERNAME SUPER_ADMIN_PASSWORD
docker compose run --rm --no-deps \
  -e SUPER_ADMIN_USERNAME -e SUPER_ADMIN_PASSWORD \
  -e POSTGRES_URL="postgresql://guatswr_app:你的应用密码@postgres:5432/guatswr_migration_prod" \
  backend node dist/src/admin/bootstrap-cli.js --postgres-url-env POSTGRES_URL
unset SUPER_ADMIN_USERNAME SUPER_ADMIN_PASSWORD
```

#### 5.2 生产标准：从已有 SQLite 历史数据离线迁移至 PostgreSQL 18（PG-04 规范）

若已有生产站点运行在 SQLite 上，请严格执行以下维护窗口停写迁移流程：

1. **优雅停止服务并制作冻结备份**：
   ```sh
   docker compose stop
   docker compose run --rm --no-deps \
     -e BACKUP_WRITE_FENCE=acknowledged \
     -e BACKUP_SOURCE_REVISION="$(git rev-parse HEAD)" \
     backend bash scripts/backup_all.sh
   ```
2. **准备签名保护的只读源数据目录**：
   ```sh
   # 提取备份归档并生成防篡改 .migration-source.json 凭证
   pnpm prepare:postgres-source \
     --bundle backend/backups/full/full_YYYYMMDD_HHMMSS_XXXXX.tar.gz \
     --sha256 <64位SHA256哈希> \
     --target-dir /srv/guatswr/verified-source
   ```
3. **离线预演（dry-run，不写数据库）**：
   ```sh
   POSTGRES_MIGRATION_URL="postgresql://${POSTGRES_ADMIN_USER}:${POSTGRES_ADMIN_PASSWORD}@postgres:5432/postgres" \
     pnpm migrate:postgres \
     --source /srv/guatswr/verified-source/data \
     --target-database guatswr_migration_prod \
     --run-id mig-dryrun-01 \
     --dry-run
   ```
4. **正式离线导入与完整性核对**：
   ```sh
   POSTGRES_MIGRATION_URL="postgresql://${POSTGRES_ADMIN_USER}:${POSTGRES_ADMIN_PASSWORD}@postgres:5432/postgres" \
     pnpm migrate:postgres \
     --source /srv/guatswr/verified-source/data \
     --target-database guatswr_migration_prod \
     --run-id mig-prod-01
   ```
   导入过程会自动按拓扑顺序迁移全部 30 张表、执行行数与摘要校验、校准自增序列、验证文件静态引用并在 `docs/ops/evidence/stability/` 下输出证据报告。
5. **切换环境变量并拉起服务**：
   将 `backend/.env` 的 `DATABASE_DRIVER` 设为 `postgres`，配置 `POSTGRES_URL`；将 `web/.env.production` 的 `BFF_DATABASE_DRIVER` 设为 `postgres`，配置 `BFF_POSTGRES_URL`。

#### 5.3 本地开发与轻量模式：SQLite 双库初始化、历史接管与升级

若运行在轻量/本地开发模式（`DATABASE_DRIVER=sqlite`），当前仓库声明的主库最新版本为 `10`、审计库为 `2`：

- **全新 SQLite 空库**：
  ```sh
  docker compose run --rm --no-deps backend \
    node dist/src/migrations/cli.js initialize --data-dir /app/data
  docker compose run --rm --no-deps backend \
    node dist/src/migrations/cli.js check --data-dir /app/data
  docker compose run --rm --no-deps \
    -e SUPER_ADMIN_USERNAME -e SUPER_ADMIN_PASSWORD backend \
    node dist/src/admin/bootstrap-cli.js --main-db /app/data/guatswr_web_main.db
  ```
- **无账本历史库接管（`adopt`）**：
  ```sh
  docker compose run --rm --no-deps backend \
    node dist/src/migrations/cli.js inspect --data-dir /app/data
  docker compose run --rm --no-deps backend \
    node dist/src/migrations/cli.js adopt --data-dir /app/data \
    --main-fingerprint "$MAIN_FINGERPRINT" \
    --audit-fingerprint "$AUDIT_FINGERPRINT"
  ```
- **已有迁移账本升级（`upgrade`）**：
  ```sh
  docker compose run --rm --no-deps backend \
    node dist/src/migrations/cli.js upgrade --data-dir /app/data
  docker compose run --rm --no-deps backend \
    node dist/src/migrations/cli.js check --data-dir /app/data
  ```

### 6. 启动与分层验收

#### 6.1 启动核心服务容器（web、backend、postgres）

```sh
docker compose up -d --no-build --wait --wait-timeout 120
docker compose ps
docker compose logs --tail=100 postgres backend web
```

Compose 声明了健康依赖链路：`web` 依赖 `backend` 处于 `service_healthy`，`backend` 依赖 `postgres` 处于 `service_healthy`。首次拉起时容器会严格按序等待就绪后启动。两镜像探针默认每 30 秒检查一次，启动宽限期 15 秒，超时 3 秒，连续失败 3 次转为 `unhealthy`。`web` 的 `/api/health` 仅检查自身存活，不能代替后端连通性验收。

Compose 的健康依赖负责启动顺序，后端后续变为 `unhealthy` 不会自动连带重启前端；`restart: unless-stopped` 针对容器退出生效，不会仅因健康状态失败而重启进程。两容器还配置了 init、移除全部 Linux capabilities、禁止提权及 30 秒停止宽限期。

#### 6.2 检查前端入口与 Docker 内部链路

默认发布到宿主机回环时：

```sh
curl -fsS http://127.0.0.1:3100/api/health
curl -fsS http://127.0.0.1:3100/api/config
docker compose exec web node -e "fetch('http://backend:3000/api/version').then(async r => { console.log(await r.text()); process.exit(r.ok ? 0 : 1) }).catch(() => process.exit(1))"
```

验收时应同时满足：两个服务均为 `healthy`；前端 `/api/config` 能读取后端数据；Web 容器通过服务名访问后端成功；`docker compose ps` 中后端只有 `3000/tcp` 的容器端口说明，没有宿主机 `HOST:PORT->3000/tcp` 映射。

如果修改了 `WEB_BIND_ADDRESS` 或 `WEB_PORT`，上述宿主机探针应改用实际地址和端口。直接检查后端自身探针也可执行：

```sh
docker compose exec backend node scripts/healthcheck.cjs
```

### 7. 生产 HTTPS 反向代理与业务验收

#### 7.1 Nginx 配置示例

生产入口使用有效证书，并将所有请求转发到 Nuxt。下面假设 Nginx 运行在宿主机上，且 `WEB_BIND_ADDRESS=127.0.0.1`、`WEB_PORT=3100`；域名与证书路径需按部署环境修改。

```nginx
server {
    listen 80;
    server_name guatswr.top www.guatswr.top;
    return 308 https://www.guatswr.top$request_uri;
}

server {
    listen 443 ssl;
    server_name www.guatswr.top;

    ssl_certificate     /etc/nginx/ssl/guatswr.top.pem;
    ssl_certificate_key /etc/nginx/ssl/guatswr.top.key;

    # 允许 50 MiB 文件和 multipart 头部开销通过
    client_max_body_size 52m;

    location / {
        proxy_pass http://127.0.0.1:3100;
        proxy_http_version 1.1;
        proxy_set_header Host $http_host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }
}
```

单次备份下载可能超过普通请求的 60 秒，若使用大备份包，应按实际下载时长调高对应反向代理的读取超时。配置修改后先执行 `nginx -t`，通过后再重载服务。

完整的 www 规范域名、裸域名 HTTPS 跳转、robots 与 sitemap 上线检查见 [生产域名与索引配置](docs/PRODUCTION-SEO.md)。

若 Nginx/Caddy 自身运行在容器中，它的 `127.0.0.1` 指向代理容器自身。此时需另外设计代理网络、通过服务名访问 `web:3100`，并调整 Web 的受信任代理列表；上述宿主机配置不能原样套用。CDN/多级代理也应逐层核对真实客户端地址与转发头。

#### 7.2 完整业务验收

通过最终 HTTPS Origin 在浏览器逐项确认：

- [ ] 首页、活动文章、活动中心、住民和群史页面正常，已有 `/uploads/*` 图片可以读取。
- [ ] `/login` 能登录原管理员账号，`guatswr-next` Cookie 具备 `HttpOnly; Secure; SameSite=Lax`。
- [ ] 无痕窗口能创建游客草稿、上传图片并报名；管理员审核后公开页数据及时刷新。
- [ ] 后台可以生成、下载和验证备份；确认预定的自动备份调度所有者与首次执行结果。
- [ ] 页面 HTML 和 `/api/*` 不被 CDN 复用缓存，携带 CSP nonce 的 HTML 和私有会话响应不进入共享缓存。

技术探针成功不代表上述业务全部验收完成；公开站点的索引、robots 与 sitemap 也应按独立发布检查清单核实。

### 8. Windows 与局域网访问

#### 8.1 开放前端的局域网 HTTP 入口

在部署插值文件中设置本机当前局域网 IPv4。例如 `192.168.1.100` 只是网络示例，必须替换为 `ipconfig` 显示的实际地址：

```dotenv
WEB_BIND_ADDRESS=192.168.1.100
WEB_PORT=3100
```

然后使用同一套 Compose 参数执行 `up -d` 重新创建 Web 容器。其他设备通过 `http://实际IP:3100` 浏览公开页面。仅设置 `HOST=0.0.0.0` 不会改变宿主机端口发布地址；应调整 `WEB_BIND_ADDRESS`。

连接不通时，依次确认网卡 IP 未变化、端口已监听、Windows 防火墙允许 Docker Desktop 对当前网络配置接收入站连接，以及 Wi-Fi 未开启客户端隔离。放通规则应限定必要端口和可信局域网范围，不需要开放后端 `3000`。Windows 的网络类别可能为 `Public`，只配置 `Private` 规则不一定生效。

#### 8.2 登录和提交需要 HTTPS

项目拒绝把非回环 HTTP 地址配置为允许写入的 Origin；生产模式还会强制使用 Secure Cookie。局域网 HTTP 页面能够打开，并不代表管理员登录和游客写入可用。不要通过把 `http://局域网IP:3100` 加入允许列表来绕过这个限制。

完整功能应使用以下任一方式提供 HTTPS：为局域网域名配置可信证书；使用自建 CA 并在访问设备中安装信任；或在临时调试环境使用含实际 IP SAN 的自签名证书并明确处理浏览器证书提示。TLS 入口的精确 Origin（包含非默认端口）必须加入 `NUXT_BFF_AUTH_ALLOWED_ORIGINS`，然后重新创建 Web 容器。

#### 8.3 本机已有的双容器局域网配置

<details>
<summary>2026-10-28 核对的本机配置与管理命令</summary>

本工作区已创建下列**本机文件**。它们位于被 Git 忽略的目录或环境文件中，不会随仓库克隆分发；其他机器应按前文重新准备，不能假设这些文件和镜像存在。

| 本机文件 | 用途 |
| --- | --- |
| `.tools/lan-deployment/compose.env` | 选择本机已构建的 `compose-validation` 镜像标签，并绑定局域网 IPv4 |
| `.tools/lan-deployment/lan-compose.yml` | 在现有 Web 容器中附加 HTTPS 代理，发布 `3443`，仍保持两个应用容器 |
| `.tools/lan-deployment/tls/proxy.mjs` | 将 TLS 请求转发到同一 Web 容器内的 `127.0.0.1:3100` |
| `.tools/lan-deployment/tls/server.crt`、`server.key` | 本机 TLS 证书与私钥，通过只读 bind mount 提供给 Web |
| `web/.env.production` | 本机前端密钥与 HTTPS Origin 配置 |
| `.tools/lan-deployment/data-original` | 接管前保全的原始数据副本；不是自动备份任务的输出目录 |

本机当次配置的公开页面入口为 `http://10.39.107.86:3100`，HTTPS 入口为 `https://10.39.107.86:3443`。这是当前机器的地址，不是仓库默认地址。证书 SAN 包含该 IP，有效期至 **2026-11-26 17:26（北京时间）**，未配置自动续期。首次访问会出现自签名证书提示；长期使用应建立客户端信任并安排续期。IP 变化后还需同步修改绑定地址、TLS 发布地址、证书 SAN 和允许的 Origin。

在仓库根目录使用以下 PowerShell 参数管理该部署：

```powershell
$lanCompose = @(
  '--env-file', '.tools/lan-deployment/compose.env',
  '-f', 'docker-compose.yml',
  '-f', '.tools/lan-deployment/lan-compose.yml'
)

docker compose @lanCompose ps
docker compose @lanCompose logs --tail=100 backend web

# 配置检查后重建容器，复用本机已有镜像
docker compose @lanCompose config --quiet
docker compose @lanCompose up -d --no-build --wait --wait-timeout 120
```

`compose-validation` 是这台机器已有镜像的本地标签，不是发布版本号，也不是远程可拉取的镜像。需要部署新源码时，应先构建对应镜像，再按第 9 节的停写与迁移流程切换。

这套 HTTPS 代理用于本机局域网验证，没有独立的 TLS 健康探针或进程监督；Web 容器为 `healthy` 不能证明 `3443` 可用。应单独检查 HTTPS 页面、证书和登录流程，并复核代理信任与真实客户端 IP。正式生产使用第 7 节的反向代理方案。

当次检查确认双容器健康、Docker 内部 API 可达，且本机通过局域网 IP 的 HTTP/HTTPS 页面与登录请求校验正常；其他设备的实际可达性仍需在同一网络中验证。后端依然不发布宿主机端口。

</details>

### 9. 日常管理、升级与故障排查

#### 9.1 常用管理命令

以下为根目录默认部署示例；使用自定义 `--env-file` 或 override 时应给每一条命令带上同样参数：

| 操作 | 命令与影响 |
| --- | --- |
| 查看状态 | `docker compose ps` |
| 跟踪日志 | `docker compose logs -f --tail=100 backend web` |
| 重启进程 | `docker compose restart web`；沿用原容器环境，不加载新 `env_file` |
| 应用前端环境修改 | `docker compose up -d --no-build --force-recreate web` |
| 应用源码修改 | `docker compose build` 后按升级步骤启动新镜像 |
| 停止服务 | `docker compose stop`；保留容器和数据 |
| 移除服务容器与项目网络 | `docker compose down`；本项目 bind mount 的宿主机数据、资源与备份目录保留 |

在配置了持久化状态存储（PostgreSQL `bff.records` 或 SQLite `bff-state.db`）的情况下，重启或重新拉起前端容器不会丢失登录态与游客草稿归属记录。根目录 Compose 的后端停止宽限期为 30 秒，默认应用退出超时为 15 秒；如果调整 `SHUTDOWN_TIMEOUT_MS`，应同步保证 `stop_grace_period` 足够完成退出。

备份工具已包含在后端镜像中，可直接执行在线全量备份，无需在宿主机另装 SQLite/Python：

```sh
docker compose exec backend bash scripts/backup_all.sh
```

在线备份标记为 `online-per-resource`，用于日常恢复，不表示双库与资源处在同一原子业务时点。维护窗口已停止所有写入后，可通过一次性后端容器执行停写备份；先将 `BACKUP_SOURCE_REVISION` 设置为实际备份来源版本，再运行：

```sh
docker compose run --rm --no-deps \
  -e BACKUP_WRITE_FENCE=acknowledged -e BACKUP_SOURCE_REVISION backend \
  bash scripts/backup_all.sh
```

`BACKUP_WRITE_FENCE` 是操作者对停写状态的声明，不会自动阻止其他程序写入。备份输出保留在宿主机 `backend/backups` 中。Linux 下可复用第 2 节创建的私有工作目录，在一次性容器中验包；提示中填写容器内归档绝对路径，例如 `/app/backups/full/full_实际标签.tar.gz`：

```bash
read -r -p '容器内备份归档绝对路径: ' BACKUP_ARCHIVE
docker compose run --rm --no-deps \
  -v /srv/guatswr/verify-work:/verify-work backend \
  python3 scripts/backup_bundle.py verify "$BACKUP_ARCHIVE" --work-dir /verify-work
unset BACKUP_ARCHIVE
```

验包成功后，归档旁会生成 `.verified.json` 标记，临时容器移除后标记仍保留。验包需要额外磁盘空间，工作目录应位于私有目录；校验 sidecar、验包保护与恢复流程见后续运维章节。

#### 9.2 更新版本

先安排维护窗口并排空写请求，停止核心服务及所有外部写入/调度入口，再完成停写备份与验包。之后拉取目标修订并构建新镜像：

```sh
docker compose stop
# 此处完成停写全量备份与验包，操作见后续运维章节
git pull --ff-only
export BACKEND_SOURCE_REVISION="$(git rev-parse HEAD)"
docker compose build

# 若运行在 PostgreSQL 生产模式，校验架构指纹与模式完整性：
# docker compose run --rm --no-deps backend pnpm db:postgres check

# 若运行在 SQLite 模式，显式执行账本升级与校验：
# docker compose run --rm --no-deps backend node dist/src/migrations/cli.js upgrade --data-dir /app/data
# docker compose run --rm --no-deps backend node dist/src/migrations/cli.js check --data-dir /app/data

docker compose up -d --no-build --wait --wait-timeout 120
```

升级后重复第 6、7 节的连通性与业务验收。保存上一版本的镜像标识、配置及有效恢复点；新版本产生业务写入后，不应直接用旧备份覆盖现状。完整备份、验包、恢复目录切换和回退判据见[后续运维](#后续运维)。

#### 9.3 常见故障

| 现象 | 检查与处理 |
| --- | --- |
| Docker API/pipe 连接失败 | 确认 Docker Engine/Docker Desktop 已启动，并检查当前用户的 Docker 访问权限 |
| `env file ... not found` | 确认两个业务配置文件存在；区分 Compose `--env-file` 与服务 `env_file`；核对多文件部署的路径基准 |
| bind mount 源目录不存在 | 提前创建数据和备份目录；本项目禁止自动创建宿主机路径 |
| 数据目录 `EACCES` / `permission denied` | Linux 检查 UID/GID `1000:1000` 与目录权限；Windows 检查磁盘共享和 ACL |
| 后端启动失败或迁移校验报错 | 查看 `logs backend`，确认挂载的是目标目录、双库存在且迁移状态正确；不要在历史数据上执行 `initialize` |
| SQLite 只读挂载检查失败 | WAL 模式的读取也可能需要访问关联文件或共享内存；按运行手册在隔离副本上检查，不要删除 WAL/SHM 强行启动 |
| `address already in use` | 检查宿主机端口占用，修改 `WEB_PORT` 并同步反向代理地址 |
| 绑定地址不可用 | 确认 `WEB_BIND_ADDRESS` 属于当前宿主机；DHCP/VPN 变化可能改变地址 |
| 网络子网重叠或固定 IP 无效 | 同时调整 `DOCKER_SUBNET`、`DOCKER_GATEWAY`、`DOCKER_WEB_IP`，停止服务后重新创建项目网络 |
| Web 健康但业务 API 失败 | 检查后端状态与 Docker DNS 连通性；根目录 Compose 应使用 `http://backend:3000` |
| 配置修改后无效 | 使用同一组 Compose 参数执行 `up -d --force-recreate`；`restart` 不会重新注入环境文件 |
| 登录/游客请求被拒绝 | 检查精确 HTTPS Origin、Secure Cookie、CSRF、桥接密钥一致性，以及前后端实际代理对端是否被正确授权 |
| `3443` 失败但 Web 为健康 | 本机临时 TLS 代理没有独立探针；检查代理日志、挂载文件、端口和证书期限 |
| 局域网其他设备无法连接 | 检查网卡 IPv4、Docker 端口发布、当前 Public/Private 防火墙策略与无线客户端隔离 |

<details>
<summary>可选：宿主机 Node.js 24 原生部署</summary>

此路径需要宿主机安装仓库要求的 Node.js/pnpm，并遵守同样的目录隔离、显式迁移、单实例与 HTTPS 约束：

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm check:artifacts
```

将后端设置为 `BIND_HOST=127.0.0.1`、`PORT=8088`，前端设置为 `HOST=127.0.0.1`、`PORT=3100`、`NUXT_API_BASE=http://127.0.0.1:8088`。存储路径使用宿主机绝对路径，代理信任列表使用实际对端地址。新库可通过后端 `db:migrate initialize` 和 `admin:bootstrap` 脚本创建；历史库按相同原则先备份、接管或升级。

由 systemd 等进程管理器注入环境并运行：

```sh
node --env-file=/srv/guatswr/repo/backend/.env /srv/guatswr/repo/backend/dist/server.js
node --env-file=/srv/guatswr/repo/web/.env.production /srv/guatswr/repo/web/.output/server/index.mjs
```

</details>

<p align="right">(<a href="#readme-top">返回顶部</a>)</p>

## 后续运维

### 1. 日常版本升级与平滑重启流程

日常发布新版本请按以下步骤执行（由于 BFF 状态已具备数据库持久化存储能力，会话凭据与游客草稿在优雅重启后仍将保持）：

1. **排空或确认游客草稿窗口**：若条件允许，在维护窗口前暂停新游客草稿创建（`POST /api/bff/guest/events/draft`），等待在途未提交草稿完成提交（草稿最长 TTL 为 6 小时）；若直接重启 Nuxt，已提交入库的活动与图片不受影响，已持久化的未提交草稿在有效期内仍可继续提交。
2. **优雅停止写流量并制作恢复点**：使用 `docker compose stop`（按 Compose 的停止宽限期发送 `SIGTERM` 并等待退出）停止前后端容器。后端生命周期管理器会拒绝新请求（返回 `503 服务正在关闭`），并等待在途请求、数据库事务、安全审计投递与子进程在 `SHUTDOWN_TIMEOUT_MS`（默认 15 秒）内安全退出。
3. **执行停写全量备份与验包**：在停写状态下执行带 `BACKUP_WRITE_FENCE=acknowledged` 的全量备份并运行 `verify`（命令见下节）。
4. **拉取代码、构建并显式校验模式**：Docker 部署按[版本更新流程](#92-更新版本)拉取代码、构建新镜像并执行模式校验，然后启动核心服务。原生 Node 部署则先安装依赖、构建共享包和后端，再启动服务。
5. **完成启动与业务核验**：按「服务器部署教程」第 6、7 节验证服务状态、内部链路、图片、登录与游客写入，并观察发布后的错误率、延迟及首次定时备份结果。

### 2. 数据备份、完整性验包与灾难恢复

#### 2.1 运行时状态目录结构

| 容器内路径（宿主机默认对应 `backend/` 下同名目录） | 存储内容与保留策略 |
| --- | --- |
| `/var/lib/postgresql/data`（宿主机 `deploy/postgres/data`） | PostgreSQL 18 专有数据库集簇（main/audit/bff 模式及 WAL 事务日志） |
| `/app/backups/postgres/`（宿主机 `backend/backups/postgres`） | PostgreSQL 专有原生流式备份包 `pg_bundle_<TAG>.tar.gz` 与 `receipt.json` |
| `/app/data/guatswr_web_main.db` | SQLite 主数据库（仅轻量模式使用：账号、文章、活动、报名、配置、文件清理队列、审计发件箱） |
| `/app/data/guatswr_web_logs.db` | SQLite 审计日志数据库（仅轻量模式使用：登录、管理操作与安全审计记录） |
| `/app/data/public/` | 经审核发布、可通过 `/uploads/*` 公开访问的图片与缩略图 |
| `/app/data/private-upload/` | 尚未公开或处理中的上传临时文件（不公开，超期自动清理） |
| `/app/data/asset-quarantine/` | 被删除内容关联图片的可恢复隔离区（不公开，默认 `keep-all` 保留，纳入全量备份） |
| `/app/data/asset-publications/` | 文件发布事务中断后的崩溃恢复日志（启动与清理时自动重放恢复） |
| `/app/backups/{db,uploads,full}/` | SQLite 模式数据库子包、资源子包与全量归档 `full_<TAG>.tar.gz`（权限 `0600`，默认 `keep-all` 保留） |

#### 2.2 自动备份调度配置

备份调度提供两种方式，通过 `backend/.env` 的 `BACKUP_SCHEDULER_OWNER` **二选一**（切勿同时开启以免竞争同一备份目录）：
- **方式一（默认推荐，`BACKUP_SCHEDULER_OWNER=app`）**：由后端进程内置调度器每 30 秒检查一次，按后台 `/admin` 中配置的 `backup_enabled` 与 `backup_time`（北京时间，默认每天 `02:30`）自动调用备份任务，并在后台记录 `backup_last_run` 与 `backup_last_error`。
- **方式二（宿主机 Cron，`BACKUP_SCHEDULER_OWNER=external`）**：禁用内置定时器，由宿主机 `crontab` 显式传入绝对路径调用备份脚本。

#### 2.3 手动创建全量备份

##### 2.3.1 PostgreSQL 生产原生全量备份（生产推荐）

在生产环境中，使用专有 PostgreSQL 原生备份工具打包数据库模式、全表数据、公开静态资源、隔离区与防篡改清单：

```sh
# 创建带防篡改校验清单的原生全量备份（产物为 pg_bundle_<TAG>.tar.gz 与 receipt.json）
POSTGRES_BACKUP_URL="postgresql://guatswr_app:你的应用密码@postgres:5432/guatswr_migration_prod" \
SOURCE_REVISION="$(git rev-parse HEAD)" \
  node backend/scripts/postgres/cli.mjs create \
    --tag "$(date +%Y%m%d_%H%M%S)" \
    --output-dir /srv/guatswr/repo/backend/backups/postgres
```

##### 2.3.2 SQLite 模式备份（开发/轻量环境）

- **日常在线热备（产物标记为 `online-per-resource`）**：
  ```sh
  DATA_DIR=/srv/guatswr/repo/backend/data \
  PUBLIC_DIR=/srv/guatswr/repo/backend/data/public \
  BACKUP_ROOT=/srv/guatswr/repo/backend/backups \
  bash /srv/guatswr/repo/backend/scripts/backup_all.sh
  ```
- **维护窗口停写一致性备份（产物标记为 `quiesced-attested`）**：
  ```sh
  BACKUP_WRITE_FENCE=acknowledged \
  BACKUP_SOURCE_REVISION="$(git -C /srv/guatswr/repo rev-parse HEAD)" \
  DATA_DIR=/srv/guatswr/repo/backend/data \
  PUBLIC_DIR=/srv/guatswr/repo/backend/data/public \
  BACKUP_ROOT=/srv/guatswr/repo/backend/backups \
  bash /srv/guatswr/repo/backend/scripts/backup_all.sh
  ```

#### 2.4 验证备份包并生成防误删保护标记（`verify`）

- **PostgreSQL 原生备份包验证**：
  ```sh
  node backend/scripts/postgres/cli.mjs verify \
    --bundle /srv/guatswr/repo/backend/backups/postgres/pg_bundle_<TAG>.tar.gz
  ```
- **SQLite 备份包验证**：
  ```sh
  python3 /srv/guatswr/repo/backend/scripts/backup_bundle.py verify \
    /srv/guatswr/repo/backend/backups/full/full_<TAG>.tar.gz \
    --work-dir /srv/guatswr/verify-work
  ```

验证通过后会在归档同目录生成绑定该文件身份的 `.verified.json`。
> **防误删保护机制**：后台备份管理接口强制要求**至少保留一个带有有效 `.verified.json` 标记的完整备份包**；试图删除最后一个已验证恢复点会返回 `409 Conflict` 拒绝执行。

#### 2.5 从备份恢复数据（灾难恢复与试恢复演练）

##### 2.5.1 PostgreSQL 灾难恢复（恢复至全新隔离数据库与独立目录）

恢复过程使用非破坏性流程：恢复至一个**全新独立命名的测试/候选数据库**及独立目录，通过验证后再正式切流：

```sh
POSTGRES_RESTORE_URL="postgresql://${POSTGRES_ADMIN_USER}:${POSTGRES_ADMIN_PASSWORD}@postgres:5432/postgres" \
  node backend/scripts/postgres/cli.mjs restore \
    --bundle /srv/guatswr/repo/backend/backups/postgres/pg_bundle_<TAG>.tar.gz \
    --target-database guatswr_restore_candidate \
    --target-dir /srv/guatswr/recovery/candidate-01 \
    --runtime-role guatswr_app
```

> [!CAUTION]
> **生产切换后的前向修复铁律（Forward-Fix Only）**：
> 生产环境一旦正式切换至 PostgreSQL 并产生真实业务写入，**严禁将切换前的旧 SQLite 快照覆盖回生产系统**！任何此类回滚都会造成新写入的文章、活动、赛果与报名数据永久丢失。如遇故障，必须基于 PostgreSQL 原生备份执行恢复，或通过前向修复（Forward-Fix）解决。

##### 2.5.2 SQLite 模式恢复（恢复到全新候选目录）

```sh
# 将指定备份包恢复到全新候选目录（candidate-01 必须尚不存在）
bash /srv/guatswr/repo/scripts/restore.sh \
  /srv/guatswr/repo/backend/backups/full/full_<TAG>.tar.gz \
  --target /srv/guatswr-recovery/candidate-01
```

恢复成功后核对 `RESTORE_READY.json`，核验无误后停止服务，将原数据目录重命名归档，将恢复数据移入对应挂载路径并重启。

### 3. 文件隔离区与存储清理维护

当管理员在后台永久删除文章或活动时，后端会在数据库事务中登记 `asset_cleanup_jobs` 任务，并由后台执行器每 30 秒按批次（每批最多 20 项，单项最多自动重试 10 次）复核全局引用后将无引用文件移入 `$DATA_DIR/asset-quarantine/{job-id}`。

运维人员可通过 `storage:cleanup` CLI 手动查看清理队列状态或离线接续处理：

```sh
# 1. 只读汇总当前 asset_cleanup_jobs 各状态（pending / quarantined / retained / missing / obsolete）任务数量
pnpm --filter guiair-backend storage:cleanup \
  --main-db /srv/guatswr/repo/backend/data/guatswr_web_main.db \
  --public-dir /srv/guatswr/repo/backend/data/public \
  --quarantine-dir /srv/guatswr/repo/backend/data/asset-quarantine

# 2. 显式重放中断的发布日志并执行一批（最多 20 项）pending 清理任务
pnpm --filter guiair-backend storage:cleanup \
  --main-db /srv/guatswr/repo/backend/data/guatswr_web_main.db \
  --public-dir /srv/guatswr/repo/backend/data/public \
  --quarantine-dir /srv/guatswr/repo/backend/data/asset-quarantine \
  --apply
```

- **容量管理**：`asset-quarantine` 与 `backups` 默认均为 `keep-all` 策略，不会按天数自动 `unlink` 物理文件。运维人员应定期检查磁盘使用率（`df -h`），在确认最新完整备份已包含历史状态且无误删恢复需求后，再按运维计划归档或清理早期备份。

### 4. 账号安全、令牌撤销与审计日志维护

- **单用户令牌即时撤销**：当用户在后台修改密码、修改二步验证密码或被管理员调整角色/禁用时，主库 `users.auth_version` 会递增，且 BFF 会在持久化状态存储中吊销该用户的有效会话记录。
- **全局令牌紧急刷新**：若怀疑 `JWT_SECRET` 范围外的历史令牌泄露，超级管理员可在后台触发全局令牌版本刷新，使所有旧全局版本的 JWT 立即失效，同时轮换 `NUXT_SESSION_PASSWORD` 并重启 Nuxt BFF 即可立即使所有现存持久化会话失效并强制全员重新登录。
- **可靠安全审计发件箱（Outbox）**：关键安全事件会先在主库业务事务内写入 `security_audit_outbox`，再由后台调度器每 30 秒按 `source_id` 幂等去重投递至审计存储（PostgreSQL `audit.audit_logs` 表或 SQLite `guatswr_web_logs.db`）。若日志库短暂繁忙，发件箱会自动重试；**切勿手动清空 `security_audit_outbox` 表**。

### 5. 应急只读回退模式

若在数据库升级并产生新业务写入后发现异常，**严禁直接将升级前的旧数据库快照覆盖回当前目录**（否则会丢失新写入数据并破坏文件隔离区状态一致）。

此时应先进入应急只读模式保全现场并维持公开页面可访问：

1. 停止当前常规后端进程，对现有状态目录生成一份新的备份。
2. 使用内置的只读回退启动器 `backend/scripts/read-only-server.cjs` 启动后端。Docker 部署可将以下内容保存为根目录 `compose.readonly.yml`，保持原服务名、内网、环境变量和数据挂载：

   ```yaml
   services:
     backend:
       command: ["node", "scripts/read-only-server.cjs"]
   ```

   ```sh
   docker compose -f docker-compose.yml -f compose.readonly.yml \
     up -d --no-build --force-recreate backend
   ```

   自定义部署应保留原有 `--env-file` 和全部 `-f` 参数，将只读 override 追加在最后；恢复读写时移除只读 override 并重新创建后端，随后完成业务核验。

   该启动器会在加载应用前为连接强制开启只读模式，关闭所有后台清理与定时任务，并在最外层拦截所有非 `GET` / `HEAD` 请求（统一返回 `503 {"message":"只读回退模式"}`），确保前台文章、活动、成员与群史正常展示的同时数据库零写入。

### 6. 运维故障与残留锁文件处理

| 故障现象或报错信息 | 原因分析与标准处理步骤 |
| --- | --- |
| PostgreSQL 连接超时 / 无法访问 | 确认 `guatswr-postgres` 容器运行正常且健康（`docker compose ps postgres`）；检查 `POSTGRES_URL` 凭据及容器 bridge 固定 IP（默认 `172.30.88.15`）连通性。 |
| `pg_dump` 备份报错 `lacks SELECT privilege on sequence` | 运行或备份角色缺少序列读取权限。进入 psql 补全授权：`GRANT SELECT, USAGE ON ALL SEQUENCES IN SCHEMA main, audit, bff TO guatswr_app;`。 |
| 备份报错退出码 `75`：`backup or cleanup fence already exists` | 上一次备份进程被强制 kill（如 `SIGKILL` / 宿主机断电），导致 `$DATA_DIR/.asset-cleanup-fence` 目录残留。先执行 `ps aux \| grep -E 'backup_all\|cleanup'` 确认无正在运行的备份或清理进程，再执行 `rmdir /srv/guatswr/repo/backend/data/.asset-cleanup-fence`。 |
| 验包或后台删除备份报锁冲突（`.backup-retention.lock` 已存在） | 上一次 `backup_bundle.py verify` 或备份删除操作异常中断。先确认无 `backup_bundle.py` 进程运行，再执行 `rmdir /srv/guatswr/repo/backend/backups/full/.backup-retention.lock`。 |
| 后台删除备份返回 `409 Conflict` | 当前要删除的备份是最后一个带有有效 `.verified.json` 的完整恢复点，或验证标记与文件哈希不匹配。请先对另一份更新的全量备份执行验证，再删除旧包。 |
| 容器启动立即退出，日志报 `EACCES: permission denied` | 宿主机挂载目录 `/srv/guatswr/repo/backend/data` 或 `deploy/postgres/data` 内部存在属主权限错误。应用目录确认 UID `1000`（`node`），PostgreSQL 目录确认 UID `999`（`postgres`）。 |
| 升级后登录或安全写接口返回 `503 Service Unavailable` | 若使用 SQLite，主库（需 `v10`）或审计库（需 `v2`）仅有一方完成了迁移，需运行 `pnpm --filter guiair-backend db:check` 并执行 `db:migrate upgrade` 补齐；若使用 PostgreSQL，运行 `pnpm --filter guiair-backend db:postgres check` 确认模式健康。 |

<p align="right">(<a href="#readme-top">返回顶部</a>)</p>

## 文档导航

| 文档路径 | 内容说明 |
| --- | --- |
| [docs/ops/POSTGRESQL-EXECUTION-GUIDE.md](docs/ops/POSTGRESQL-EXECUTION-GUIDE.md) | PostgreSQL 18 条件执行手册、离线迁移验证标准与生产切换 Runbook |
| [docs/ops/STABILITY-TASKS.md](docs/ops/STABILITY-TASKS.md) | 稳定性加固与 PostgreSQL 迁移实施跟踪表（PG-00～PG-07 全部已验收） |
| [docs/PRODUCTION-SEO.md](docs/PRODUCTION-SEO.md) | www 生产域名、robots、Sitemap、预览环境隔离与上线验收 |
| [docs/releases/v2.0.0.md](docs/releases/v2.0.0.md) | `v2.0.0` 版本发行说明、验证结论与上线边界 |
| [docs/backend-modernization/STATUS.md](docs/backend-modernization/STATUS.md) | 后端现代化 BM00–BM36 里程碑状态与验收记录 |
| [docs/backend-modernization/MIGRATIONS.md](docs/backend-modernization/MIGRATIONS.md) | 双库迁移引擎、历史库接管（`adopt`）、增量升级（`upgrade`）与管理员初始化手册 |
| [docs/backend-modernization/RUNTIME-RUNBOOK.md](docs/backend-modernization/RUNTIME-RUNBOOK.md) | 生产容器镜像、挂载边界、权限核验与卷演练说明 |
| [docs/backend-modernization/RELEASE-CHECKLIST.md](docs/backend-modernization/RELEASE-CHECKLIST.md) | 正式生产发布前现场核验项、停写窗口执行顺序与回退判据 |
| [docs/backend-modernization/BACKUP-RUNBOOK.md](docs/backend-modernization/BACKUP-RUNBOOK.md) · [scripts/README.md](scripts/README.md) | 备份归档格式、一致性等级、验包与恢复约定 |
| [docs/backend-modernization/CONTRACT-COVERAGE.md](docs/backend-modernization/CONTRACT-COVERAGE.md) · [backend/docs/openapi.yaml](backend/docs/openapi.yaml) | 后端 71 个 API 操作契约覆盖表与 OpenAPI 规范 |
| [docs/revamp/AUTH.md](docs/revamp/AUTH.md) · [docs/revamp/GUEST.md](docs/revamp/GUEST.md) | Nitro BFF 会话模型、CSRF/Origin 边界、可信代理 IP 解析与游客草稿网关 |
| [docs/revamp/SEO.md](docs/revamp/SEO.md) · [docs/revamp/STAGING.md](docs/revamp/STAGING.md) | SSR 搜索引擎索引策略、Sitemap/RSS 规则与预览环境拓扑提案 |
| [docs/revamp/STATUS.md](docs/revamp/STATUS.md) · [docs/revamp/logs/README.md](docs/revamp/logs/README.md) | 前端 Nuxt 4 改版各阶段验收状态与历史证据归档 |

<p align="right">(<a href="#readme-top">返回顶部</a>)</p>
