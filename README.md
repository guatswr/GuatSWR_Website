# 桂航绯想天社团门户 (GuatSWR Website)

> 桂林航天工业学院 · 绯想天社团官方综合服务门户与全功能运营后台

[![Node.js](https://img.shields.io/badge/Node.js-%E2%89%A520.0.0-339933?style=flat-square&logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![Vue 3](https://img.shields.io/badge/Vue.js-3.x-4FC08D?style=flat-square&logo=vuedotjs&logoColor=white)](https://vuejs.org)
[![Nuxt 3](https://img.shields.io/badge/Nuxt-3.x-00DC82?style=flat-square&logo=nuxtdotjs&logoColor=white)](https://nuxt.com)
[![Express](https://img.shields.io/badge/Express-4.x-000000?style=flat-square&logo=express&logoColor=white)](https://expressjs.com)
[![SQLite3](https://img.shields.io/badge/SQLite3-WAL_Mode-003B57?style=flat-square&logo=sqlite&logoColor=white)](https://www.sqlite.org)
[![Docker](https://img.shields.io/badge/Docker-Compose_Ready-2496ED?style=flat-square&logo=docker&logoColor=white)](https://www.docker.com)

---

## 一、项目概况

**GuatSWR Website** 是桂林航天工业学院·绯想天社团的官方门户系统。前台负责展示社群入口、最新活动排期与报名、往期活动回顾、成员名册分布图与群史纪事；后台提供活动发布、成员管理、全局站点配置（群号/加群直链/Logo）、系统日志审计与数据备份调度。

### 架构设计与职责分工

系统采用分层解耦的现代化全栈架构：

1. **Nuxt 3 统一全栈应用 (`web/`)**
   - 基于 Nuxt 3 + Nitro 全栈框架，兼任统一前端与 BFF（Backend for Frontend）。
   - 公开页面支持服务端渲染（SSR）与边缘数据缓存（SWR），大幅提升首屏加载速度与搜索引擎收录效果（SEO）。
   - 内置安全会话管理、CSRF 校验、敏感数据脱敏与接口适配层。
   - 使用原生 `IntersectionObserver` 实现了轻量级视口揭示动效，并严格遵循无障碍（a11y）标准。
2. **业务后端核心服务 (`backend/`)**
   - 基于 Node.js + Express 的 RESTful API 核心业务服务。
   - 使用 SQLite3（开启 WAL 模式）持久化业务数据与操作审计日志，内置 Sharp 图像缩略图处理、JWT 鉴权与免停机一致性备份调度。
3. **独立共享契约包 (`packages/shared/`)**
   - 统一维护前后端共用的 TypeScript 强类型定义与 Zod 校验 Schema，保障模块导入边界与类型安全。

> [!NOTE]
> 原旧版 Vue 3 SPA（`frontend/`）已顺利完成全量功能迁移与验收收尾，主线已彻底移除旧目录。完整历史保留在 Git 标签 `v1-archive` 中。

---

## 二、项目目录树与职责

仓库采用 Monorepo 混合结构组织，前后端源码、持久化数据与运维工具边界明确：

```text
GuatSWR_Website/
├── backend/                      # 业务后端（独立 Node.js / Express 项目）
│   ├── data/                     # 生产持久化数据（SQLite 数据库与上传资源）
│   │   ├── guatswr_web_main.db   # 业务主数据库（成员、活动、站点配置等）
│   │   ├── guatswr_web_logs.db   # 审计与系统安全操作日志数据库
│   │   └── public/               # 上传的图片原图与缩略图存储目录
│   ├── src/                      # 后端核心源码（路由 routes、模型 models、中间件、工具函数）
│   ├── scripts/                  # 容器镜像内部独立的备份/恢复脚本
│   ├── Dockerfile                # 后端 Docker 容器构建文件
│   ├── docker-compose.yml        # 后端容器编排配置（映射宿主机 8088 端口）
│   └── package.json              # 后端 npm 依赖配置
│
├── web/                          # Nuxt 3 全栈应用（统一前端 SSR + Nitro BFF）
│   ├── app/                      # 页面 pages、布局 layouts、组件 components 与状态
│   ├── server/                   # Nitro 服务端路由、BFF 接口适配与会话管理
│   ├── shared/                   # Web 应用内公共 DTO 与纯数据转换
│   ├── tests/                    # 单元测试、集成测试、Playwright E2E 测试
│   └── Dockerfile                # 基于 Node 24 Alpine 的轻量无特权生产容器
│
├── packages/
│   └── shared/                   # 前后端共享契约（独立 TypeScript 类型与 Zod 校验）
│
├── scripts/                      # 宿主机运维与工程治理脚本
│   ├── db_backup.sh              # 数据库一致性安全备份（WAL 快照导出）
│   ├── uploads_backup.sh         # 上传媒体目录打包备份
│   ├── backup_all.sh             # 全量归档脚本（生成 SHA-256 清单并自动轮换）
│   ├── restore.sh                # 灾难恢复脚本（解压、覆盖并自动清理脏索引）
│   ├── cron.example              # Linux 定时任务（crontab）模板文件
│   └── revamp/                   # 代码边界规范检查、路由预算与安全门禁
│
├── docs/                         # 系统架构设计规范与改版进度台账
├── .env.example                  # 后端通用环境变量示例
├── pnpm-workspace.yaml           # pnpm 工作区配置（管理 web 与 packages/shared）
└── package.json                  # 根项目统一指令与代码规范配置
```

---

## 三、快速开始与本地开发

### 3.1 环境准备
- **Node.js**：需 Node.js `>= 24.16.0 < 25`（参见 `.node-version`，推荐使用 nvm 或 fnm 管理）。
- **包管理器**：`pnpm >= 11.25.0`（工作区统一管理）与 `npm`（后端构建）。

### 3.2 本地双端启动开发流

本地开发建议分别在两个终端拉起业务后端与 Nuxt 前端：

```bash
# 终端 1：启动业务后端 (Express)
cd backend
cp ../.env.example .env
npm install
npm run dev
# 后端默认监听 http://localhost:3000

# 终端 2：启动全栈前端 (Nuxt 3)
# 在仓库根目录下安装工作区依赖并拉起开发环境
pnpm install --frozen-lockfile
pnpm dev
# 前端默认监听 http://127.0.0.1:3100，自动同源反代 /api 与 /uploads 至后端
```

代码质量与契约校验：
```bash
pnpm check:boundaries  # 检查模块导入边界规范（禁止越级导入）
pnpm -r typecheck      # TypeScript 强类型校验
pnpm -r test           # 运行全工作区自动化单元测试
```

---

## 四、生产部署教程（着重）

### 4.1 环境要求与端口规划

- **操作系统**：Linux 服务器（Ubuntu 22.04 LTS / Debian 12 / 1Panel 运行环境）。
- **依赖软件**：Docker `>= 24.0`、Docker Compose V2、Nginx、Git、`sqlite3` 命令行工具。
- **端口分配规划**：
  - 宿主机 `8088`：后端 Express 容器对外端口（由 `backend/docker-compose.yml` 定义）。
  - 宿主机 `3100`：Nuxt 3 统一前端服务端口（由 `web/Dockerfile` 或 PM2 启动）。
  - 宿主机 `80 / 443`：Nginx 统一对外服务端口与 SSL 终止。

---

### 4.2 环境变量配置清单

复制根目录 `.env.example` 到 `backend/.env` 并按需调整：

```bash
cp .env.example backend/.env
```

| 变量名 | 必填 | 默认推荐值 | 说明 |
| :--- | :---: | :---: | :--- |
| `PORT` | 否 | `3000` | 容器内部 Node 服务监听端口 |
| `NODE_ENV` | 是 | `production` | 运行环境，生产环境填 `production` |
| `JWT_SECRET` | **必须** | - | **JWT 签名密钥**（建议 ≥ 32 位随机字符）。**未填会导致后端主动退出** |
| `SUPER_ADMIN_USERNAME`| 是 | `admin` | 初始化超级管理员用户名 |
| `SUPER_ADMIN_PASSWORD`| 是 | - | 初始化超级管理员密码 |
| `CORS_ORIGINS` | 是 | - | 允许跨域的前端域名（逗号分隔），例如 `https://guatswr.top,https://admin.guatswr.top` |
| `SITE_URL` | 是 | `https://guatswr.top` | 站点公开访问地址（末尾不要加斜杠） |
| `MAX_BODY_SIZE` | 否 | `50mb` | 文件上传与 JSON 请求体体积上限（需与 Nginx 保持同步） |
| `STAGING_TTL_MS` | 否 | `172800000` | 上传临时文件保留时间（默认 48 小时） |

> [!WARNING]
> 请勿将包含真实生产密钥的 `.env` 提交到 Git 仓库。`JWT_SECRET` 一旦泄露会导致 Token 被伪造。

---

### 4.3 方案 A：Docker 容器化部署（推荐）

#### 第一步：创建数据持久化目录与权限
在服务器项目根目录下执行：
```bash
mkdir -p backend/data backend/uploads backups/full
chmod -R 755 backend/data backend/uploads
```

#### 第二步：启动业务后端容器
后端使用 `backend/docker-compose.yml`，映射宿主机端口 `8088:3000` 并挂载数据目录：

```bash
cd backend
docker compose up -d --build
```

验证后端是否正常运行：
```bash
curl http://127.0.0.1:8088/api/version
# 返回类似: {"version":"4.0.0","status":"healthy"} 代表后端启动成功
```

> [!TIP]
> **中国大陆服务器构建加速**：若服务器拉取 Debian 官方源缓慢，可指定清华源构建参数：
> ```bash
> docker compose build --build-arg APT_MIRROR=http://mirrors.tuna.tsinghua.edu.cn/debian
> ```

#### 第三步：构建并部署 Nuxt 3 全栈前端
Nuxt 3 前端提供专属的生产 Dockerfile（基于 Node 24 Alpine，多阶段优化构建，采用非 root 用户运行）：

```bash
cd ../web
# 构建前端生产镜像
docker build -t guatswr-web:latest .

# 启动前端容器（映射宿主机 3100 端口）
docker run -d \
  --name guatswr_web \
  --restart always \
  -p 127.0.0.1:3100:3000 \
  -e NODE_ENV=production \
  -e NUXT_PUBLIC_API_BASE=http://127.0.0.1:8088 \
  guatswr-web:latest
```

---

### 4.4 方案 B：宿主机原生部署（PM2）

若不使用 Docker，可以使用进程管理器 **PM2** 直接运行：

```bash
# 1. 全局安装 PM2
npm install -g pm2

# 2. 部署后端 (Express)
cd backend
npm ci --omit=dev
pm2 start server.js --name "guatswr-backend"
pm2 save

# 3. 部署全栈前端 (Nuxt 3)
cd ../web
pnpm install --frozen-lockfile
pnpm build
PORT=3100 pm2 start .output/server/index.mjs --name "guatswr-web"
pm2 save
pm2 startup
```

---

### 4.5 Nginx 反向代理与 SSL 配置

创建 Nginx 站点配置文件（例如 `/etc/nginx/conf.d/guatswr.conf`）：

```nginx
# HTTP 自动重定向至 HTTPS
server {
    listen 80;
    server_name guatswr.top www.guatswr.top;
    return 301 https://$host$request_uri;
}

# HTTPS 主站点配置
server {
    listen 443 ssl http2;
    server_name guatswr.top www.guatswr.top;

    # SSL 证书配置
    ssl_certificate /etc/letsencrypt/live/guatswr.top/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/guatswr.top/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # 上传文件大小限制（与后端 MAX_BODY_SIZE=50mb 保持一致）
    client_max_body_size 50m;

    # 1. Nuxt 静态资源分发（长期不可变缓存）
    location /_nuxt/ {
        alias /var/www/GuatSWR_Website/web/.output/public/_nuxt/;
        expires 30d;
        add_header Cache-Control "public, max-age=2592000, immutable";
    }

    # 2. 上传资源目录静态分发（直读磁盘，降低 Node 负载）
    location /uploads/ {
        alias /var/www/GuatSWR_Website/backend/data/public/;
        expires 7d;
        add_header Cache-Control "public";
    }

    # 3. 后端 RESTful API 反向代理
    location /api/ {
        proxy_pass http://127.0.0.1:8088;
        
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # 4. Nuxt 3 SSR 服务端反向代理（承接所有前端路由）
    location / {
        proxy_pass http://127.0.0.1:3100;

        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # 安全防护响应头
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
}
```

测试并重载 Nginx：
```bash
sudo nginx -t && sudo systemctl reload nginx
```

---

## 五、后期维护与运维指南（着重）

### 5.1 SQLite WAL 模式机制与维护要点

本项目 SQLite 数据库启用了 **WAL（Write-Ahead Logging）预写日志模式**。
- **运行特征**：主库文件旁会存在 `guatswr_web_main.db-wal`（事务增量文件）与 `guatswr_web_main.db-shm`（共享内存索引文件）。写入操作优先进入 `-wal`，在 Checkpoint 触发或连接关闭时才合入主 `.db` 文件。

> [!CAUTION]
> **运维维护红线：**
> 1. **严禁在服务运行中直接通过 `cp main.db` 进行热备份**：由于数据仍滞留在 `-wal` 缓冲区，直接拷贝主文件会导致数据丢失或备份文件损坏。
> 2. **严禁在运行中手动删除 `-wal` 或 `-shm`**：删除会导致未合并事务破坏、数据库索引损坏。
> 3. 必须通过内置脚本或 `sqlite3 db.db ".backup 'target.db'"` 机制导出快照。

---

### 5.2 自动化备份与防篡改策略

项目在 `scripts/` 下提供免停机的一致性备份工具链：

| 脚本路径 | 备份对象 | 数据源路径 | 产物输出路径 |
| :--- | :--- | :--- | :--- |
| `scripts/db_backup.sh` | 数据库安全快照 | `backend/data/*.db` | `backups/db/db_*.tar.gz` |
| `scripts/uploads_backup.sh` | 上传媒体与图片 | `backend/data/public` | `backups/uploads/uploads_*.tar.gz` |
| `scripts/backup_all.sh` | 全量打包归档 | 上述两项组合打包 | `backups/full/full_*.tar.gz` |

#### 防篡改与滚动淘汰机制
- **SHA-256 完整性清单**：每次备份均自动生成配套的 `.sha256` 校验和文件（如 `full_20261021_023000.sha256`），防止备份介质位损坏或恶意篡改。
- **自动归档滚动清理**：`backup_all.sh` 脚本执行后，会自动清理 `backups/full/` 目录下创建超过 **30 天** 的旧备份与对应哈希文件，防止磁盘占满。

#### 配置 Linux Crontab 定时备份
在宿主机执行 `crontab -e`，添加每日定时任务（请替换为实际项目绝对路径）：

```cron
# 每日凌晨 02:30 执行全量自动备份并记录执行日志
30 2 * * * /bin/bash /var/www/GuatSWR_Website/scripts/backup_all.sh >> /var/log/guatswr_backup.log 2>&1
```

> [!NOTE]
> **宿主机与容器脚本区别**：宿主机 Crontab 必须执行根目录下的 `scripts/*.sh`；`backend/scripts/` 仅供 Docker 容器内部上下文调用，二者路径基准不同。

---

### 5.3 灾难恢复与数据还原 SOP

当发生误删数据、主机迁移或系统故障时，请遵循以下 5 步恢复 SOP：

#### 步骤 1：停止后端服务（避免写入冲突）
```bash
# Docker 停止后端
docker compose -f backend/docker-compose.yml stop guiair-backend

# 或 PM2 停止后端
pm2 stop guatswr-backend
```

#### 步骤 2：校验备份归档完整性
```bash
cd backups/full
sha256sum -c full_YYYYMMDD_HHMMSS.sha256
# 看到控制台输出 ": 成功" 或 ": OK" 再继续
```

#### 步骤 3：对当前故障现场建立保底副本
```bash
mkdir -p /tmp/guatswr_crash_bak
cp -r backend/data /tmp/guatswr_crash_bak/
```

#### 步骤 4：运行一键还原脚本
```bash
# 传入指定的全量备份归档文件
./scripts/restore.sh backups/full/full_20261021_023000.tar.gz

# 脚本会自动完成：
# 1. 解压备份包内的数据库与上传媒体
# 2. 覆盖写入 main.db 与 logs.db
# 3. 清除残留的 -wal 与 -shm 脏索引
# 4. 覆盖还原 data/public 资源
```

#### 步骤 5：修复文件归属权限并验证启动
```bash
# 确保运行用户拥有数据目录读写权
chown -R 1000:1000 backend/data backend/uploads
chmod -R 755 backend/data backend/uploads

# 启动服务
docker compose -f backend/docker-compose.yml start guiair-backend
# 或 pm2 start guatswr-backend

# 验证健康状态
curl http://127.0.0.1:8088/api/version
```

---

### 5.4 服务监控、健康检查与排障

#### 1. 健康检查探针
- 后端主探针：`curl http://127.0.0.1:8088/api/version`
- Nuxt BFF 探针：`curl http://127.0.0.1:3100/api/health`

#### 2. 服务运行日志查看
```bash
# 查看后端 Docker 容器实时日志
docker logs -f guatswr_backend --tail=100

# 查看 PM2 进程日志
pm2 logs guatswr-backend --lines 100
```

#### 3. 常见异常排查清单
- **问题 1：容器启动即挂掉，报错 `未设置 JWT_SECRET`**  
  *原因*：缺少关键安全变量。核对 `backend/.env` 中是否存在 `JWT_SECRET`，并确认 `docker-compose.yml` 引入了 `env_file: - .env`。
- **问题 2：后台上传大图报错 `413 Payload Too Large`**  
  *原因*：Nginx 默认限制为 1MB。核对 Nginx 配置中是否有 `client_max_body_size 50m;`，同时核对后端 `.env` 中 `MAX_BODY_SIZE=50mb`。
- **问题 3：前端页面刷新直接出现 Nginx 404**  
  *原因*：缺少 SPA 路由 fallback。确认 Nginx 中包含 `try_files $uri $uri/ /index.html;`。

---

### 5.5 版本升级与更新流程

当需要部署新特性或安全补丁时：

```bash
# 1. 拉取最新代码
git pull origin <release-branch>

# 2. 依赖检查与质量门禁（工作区模式）
pnpm install --frozen-lockfile
pnpm check:boundaries
pnpm -r test

# 3. 重新构建 Nuxt 3 前端
pnpm --filter @guatswr/web build

# 4. 重构并平滑拉起后端容器与前端服务
cd backend
docker compose up -d --build
cd ..
# 若前端使用 Docker：
# cd web && docker build -t guatswr-web:latest . && docker restart guatswr_web && cd ..
# 若前端使用 PM2：
# pm2 restart guatswr-web

# 5. 线上验证
curl -I https://guatswr.top/api/version
curl -I https://guatswr.top/api/health
```

---

## 六、特色功能与业务特性

### 1. 入群配置与二维码管理
- 管理员可在管理后台「全局配置」修改 **QQ 群号**、**加群 HTTP(S) 链接** 以及 **入群问卷说明**。
- 前台优先呈现加群直链；未配置直链时自动呈现二维码。
- 二维码图片上传时系统自动保留原图无损存储，杜绝有损压缩导致扫码识别失败。

### 2. 首页事件与活动排期
- 首页清晰划分为 **可参与事件（近期活动 / 报名）** 与 **历史活动回顾**。
- 无时区日期的活动统一按 **北京时间（UTC+8）** 进行解析计算；已截止的事件自动从推荐板块中移除，无需管理员手动下架。

### 3. 视口动效与无障碍支持
- **首屏揭示 (`v-reveal`)**：基于共享 `IntersectionObserver` 实现，单卡片错峰 90~100ms 平滑入场，手机端自动减半过渡时长。
- **无障碍兼容**：系统开启「减少动态效果（prefers-reduced-motion）」或处于打印预览模式时，动效自动停用并直接呈现完全可见的静态内容。
- **彩蛋交互**：连续点击 9 次社团头像（或输入 `baka`）将触发冰冻彩蛋，用户可通过自然向下滚动滚轮完成解冻，保证无障碍键盘焦点不锁死。

---

## 📜 许可证与维护声明

本项目由桂林航天工业学院·绯想天社团内部技术组维护。保留所有权利。未经授权请勿商用。
