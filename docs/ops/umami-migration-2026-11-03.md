# Umami 迁移报告

**日期**：2026-11-03
**执行范围**：把 Umami 统计分析从 jd（京东云）迁移到 sshtenc（腾讯云主力服务器），并修复生产站 `/api/logs/umami` 的 502
**代码改动**：无。本次全部为服务器侧运维改动，未修改仓库内任何代码文件

---

## 一、结论

Umami 已完整迁移到 sshtenc 并与生产站接通。生产站 `/logs` 页从「统计数据暂不可用」恢复为显示真实数据，`/api/logs/umami` 从 502 恢复为 200，`stats.guatswr.top` 的 DNS 已切到新源站且不再回源 jd。

数据零丢失：迁移后事件 2196、会话 257，与源库逐条一致（含 event_id 级比对）。

---

## 二、问题根因

原故障不是 Umami 本身坏了，而是**迁站时漏搬了配置**：

| 层 | 状态 |
|---|---|
| `backend/.env` | 完全没有 `UMAMI_*` 变量（生产站在 11-02 迁到 sshtenc 时未一并迁移） |
| backend 内部 | 返回 `503 {"message":"Umami 未配置"}` |
| web 的 SWR 层 | 把上游不可用包装成 `502 {"statusMessage":"Public data unavailable"}` |
| umami 容器 | 仍留在 jd 上，监听 jd 的 `127.0.0.1:3036`，sshtenc 上根本不存在 |

所以健康检查全绿、后端日志零错误，但唯一的用户可见统计功能是坏的 —— 因为 `UMAMI_*` 缺失属于「功能未配置」而非「运行时报错」，不产生 error 级日志。

---

## 三、本次改动清单

### 1. 新增 Umami 栈（sshtenc `/opt/umami/`）

```
/opt/umami/
├── docker-compose.yml   # 新建
├── .env                 # 新建，权限 600
└── umami-db-data/       # postgres 数据目录
```

关键决策：

- **镜像锁定 3.0.3，不用 `postgresql-latest`**。源库有 14 条已应用的 prisma 迁移，对应 3.0.3；直接上最新的 3.4.1 会触发不可回滚的 schema 自动迁移。为拿到完全一致的版本，从 jd 用 `docker save/load` 搬运镜像，加载后镜像 ID `28f263fe06f7` 与源站完全相同。
  > **后续变更**：迁移稳定后已按需求升级到 3.4.1，详见文末「附录：升级到 3.4.1」。
- **`HASH_SALT` 保持原值**。这个盐参与已存密码哈希，改动会导致 admin 登录失效。
- **宿主机端口用 13036 而非 3036**。sshtenc 的 sshd 本身就监听 3036，首次启动直接冲突（`address already in use`）。绑定 `127.0.0.1:13036`，不对外暴露。
- **接入 `guatswr_app` 网络并固定 IP `172.30.88.20`**。后端此前无 `extra_hosts`、无法用 `host.docker.internal` 访问宿主回环，走共享 compose 网络是最稳的路径。
- **补了 `logging` 上限与 `pg_isready` healthcheck**（原 jd 配置两者都没有）。

### 2. 数据迁移

`pg_dump --clean --if-exists --no-owner --no-privileges` → 693KB SQL → 导入新库。全链路校验：

| 校验点 | 结果 |
|---|---|
| SQL 文件 SHA256（jd → 本机 → sshtenc） | 三处一致 `9ed0e84f…f5f6` |
| 镜像 ID | `28f263fe06f7`，与源站相同 |
| 表数量 | 14，与源库一致 |
| 事件 / 会话 / 站点 / 迁移 | 2196 / 257 / 1 / 14，与源库一致 |
| admin 登录（用迁移来的密码哈希） | 200 |

### 3. 接入生产站

`backend/.env` 追加 4 个变量（原文件已备份到 `/root/backend.env.bak.20261103-213601`）：

```
UMAMI_BASE_URL=http://umami:3000
UMAMI_USERNAME=admin
UMAMI_PASSWORD=***
UMAMI_WEBSITE_ID=2b03bf5d-751a-4a7c-be54-d545fe250209
```

**注意**：仅 `restart` 容器不会重新注入 env_file，必须 `up -d --no-deps --force-recreate backend`。实际执行的就是后者。

### 4. 反向代理 + 证书

- 新增 `/etc/nginx/sites-available/stats.guatswr.conf`，反代 `127.0.0.1:13036`，启用 HTTP/2、HSTS、`client_max_body_size 8m`
- 证书用 DNS-01 在**切换 DNS 之前**就签好（`certbot certonly --dns-cloudflare`），有效期至 2027-02-01，已纳入 certbot.timer 自动续期
- 踩坑：这台机器是 nginx 1.24，`http2 on;` 是 1.25+ 语法，首次 `nginx -t` 直接 `unknown directive "http2"` 导致 reload 失败。改用 `listen 443 ssl http2;` 后通过

### 5. DNS 切换

`stats.guatswr.top` A 记录 `223.109.142.50` → `43.142.74.19`（CF 代理保持开启）。切换前用 `--resolve` 对新源站做了完整本地验证，确认 200 后才改记录。

---

## 四、验证证据

### 功能恢复

| 端点 | 迁移前 | 迁移后 |
|---|---|---|
| `https://www.guatswr.top/api/logs/umami` | **502** | **200**，返回真实数据 |
| `https://www.guatswr.top/logs` | 「统计数据暂不可用」 | Pageviews=15 / Visitors=5，错误提示消失 |
| `https://stats.guatswr.top/` | 回源 jd | 200 |
| `https://stats.guatswr.top/script.js` | 回源 jd | 200 |
| `https://stats.guatswr.top/api/auth/login` | 回源 jd | 200 |

### 数据流已真正改道（决定性验证）

向 `https://stats.guatswr.top/api/send` 发一条探针事件后：

- sshtenc 新库：命中 **1** 条
- jd 旧库：命中 **0** 条

证明 CF → sshtenc → umami 全链路已生效，不存在「DNS 改了但仍在读旧库」的假成功。探针事件验证后已清理。

### 无回归

17 个端点全部 200（首页、members、activities、events、history、join、logs、resources、social、activity/18、sitemap、robots、api/health、api/members、api/activities、api/logs/stats、api/logs/umami）。

后端容器重建后 10 分钟内 **0 条** error/warn 日志。nginx 在切换后无新增 5xx（`/api/logs/umami` 的 502 最后出现于 17:23，切换在 21:36 之后）。

### 资源占用

| 容器 | 内存 | CPU |
|---|---|---|
| umami | 215 MiB | 0.02% |
| umami-db | 42 MiB | 0.01% |
| guatswr-backend-1 | 53 MiB | 0.18% |
| guatswr-web-1 | 216 MiB | 0.17% |

磁盘 178G 用 17G（10%），新增约 2G（镜像 + 数据）。

---

## 五、临时操作与回收

迁移期间为加速 263MB 镜像传输，临时把 jd 的公钥加入 sshtenc 的 `authorized_keys`，走服务器到服务器直传（比经本机中转快约 4 倍）。

**已完全回收**：

- jd 公钥已从 `sshtenc:/root/.ssh/authorized_keys` 移除，恢复为原有 2 条
- `/root/umami-image.tar`、`/root/umami.sql`、`/root/umami-db-cred.txt` 已删除

> ⚠️ 若日后还需此类传输，建议改用 `ssh -R` 反向隧道或一次性密钥，而不是长期往 authorized_keys 里追加。

---

## 六、遗留问题与建议

### 6.1 新站没有注入追踪脚本（重要，未修）

**生产站 v2 从未加载过 Umami 追踪脚本。** 老站（jd 上的 v1）在 `frontend/index.html` 里有：

```html
<script defer src="https://stats.guatswr.top/script.js"
        data-website-id="2b03bf5d-751a-4a7c-be54-d545fe250209"></script>
```

新站 `web/` 里搜不到任何 `stats.guatswr.top` / `script.js` / `data-website-id`。库中最后一条真实事件是 **2026-11-01 09:35**，正好卡在 11-02 迁站上线之前 —— 也就是说上线后两天零采集。

这需要改代码（在 `web/nuxt.config.ts` 的 `app.head` 里加 script，或做一个 Nuxt 插件）。因为本次任务约定不动代码，**未执行**。修复方案建议：

- 加到 `nuxt.config.ts` 的 `app.head.script`，注意已有 CSP 带 `nonce` + `strict-dynamic`，需要让 script 走 nonce 或把 `stats.guatswr.top` 加入 CSP 白名单
- 只对公开页启用，`/admin`、`/login` 不采集
- 改完需重建 web 镜像（`docker compose up -d --no-deps --force-recreate web`）

### 6.2 网络依赖的启动顺序风险

`umami` 的 compose 把 `guatswr_app` 声明为 `external: true`。该网络由 `GuatSWR_Website/docker-compose.yml` 创建（项目名 `guatswr`）。

- 现状：两套 compose 都是 `restart: unless-stopped` / `unless-stopped`，普通重启容器不受影响
- 风险：**整机重启后**若 umami 先于 GuatSWR 栈启动，会因网络不存在而启动失败；需要 `cd /opt/umami && docker compose up -d` 手动补一次

若要彻底消除，可在 `GuatSWR_Website/docker-compose.yml` 里把 umami 并入同一文件，或给 umami 服务加 systemd unit 依赖。

### 6.3 jd 上的旧 Umami 建议保留一段时间再下线

目前 jd 的 `umami` / `umami-db` 仍在运行（挂 jd `3036`），数据与 sshtenc 一致（2196/257）。建议：

1. 观察 3–7 天，确认 `stats.guatswr.top` 无异常
2. 确认后再 `docker compose down`（**不要加 `-v`，也不要删 `umami-db-data`**），保留目录以便回滚
3. 稳定后清理：`/home/taropoi/workspace/umami/umami-db-data` 约 66M

回滚方式（如需）：把 CF 那条 A 记录改回 `223.109.142.50`，并在 sshtenc 执行 `docker compose down`。

### 6.4 与本次评估其他问题的关系

本次只修了 Umami。上次评估里其余问题**均未处理**，仍然存在：

- `/api/version` 公网 404
- 全站 HEAD 请求 404
- 拿不到真实访客 IP（nginx 未配 `set_real_ip_from`，限流/封禁按边缘 IP 计数）
- sshtenc 上 3 个未提交的 Dockerfile/.npmrc 改动
- 当前 HEAD 的 CI lint 失败
- www 经 ESA 无 HTTP/2、`/_nuxt` 与 `/uploads` 不缓存
- 首屏 504KB 背景图 + 536KB PNG badge 未走 thumb
- 备份单点（同盘、无异地）

其中**真实 IP 缺失**现在更值得优先处理：Umami 后台看到的访客 IP 也会是边缘 IP，统计数据的地理/唯一访客维度同样受影响。

---

## 七、变更文件位置速查

| 项目 | 路径 |
|---|---|
| Umami compose | `sshtenc:/opt/umami/docker-compose.yml` |
| Umami 环境变量 | `sshtenc:/opt/umami/.env`（600） |
| Umami 数据 | `sshtenc:/opt/umami/umami-db-data/` |
| Nginx 站点 | `sshtenc:/etc/nginx/sites-available/stats.guatswr.conf`（已 symlink 到 sites-enabled） |
| 证书 | `sshtenc:/etc/letsencrypt/live/stats.guatswr.top/` |
| backend env | `sshtenc:/opt/GuatSWR_Website/backend/.env`（追加 4 行 UMAMI_*） |
| backend env 备份 | `sshtenc:/root/backend.env.bak.20261103-213601` |
| CF DNS 记录 ID | `d9af3279c9a8e42db159abec073eb233`（`stats.guatswr.top` → `43.142.74.19`） |
| 迁移用 SQL 存档 | `jd:/root/umami-migration/umami.sql`（693K，可作回滚源） |
| 升级前 SQL 存档 | `sshtenc:/root/umami-pre-3.4.1.sql`（693K，SHA `23ef260f…`，3.0.3 回滚源） |

---

## 附录：升级到 3.4.1（2026-11-03 稍晚）

迁移验收通过后按要求做了版本升级。

**动作**：`pg_dump` 全量存档 → `docker pull postgresql-latest`（确认版本号 3.4.1）→ compose 里 `image` 去掉 `umami:3.0.3` 本地 tag 改为 registry tag → `docker compose up -d --force-recreate umami`。

**结果**：

- prisma 迁移从 14 条推进到 **26 条**（新增 api key、annotation、报告、漏斗、目标、收入、会话回放等表），容器日志 `All migrations have been successfully applied.`
- admin 登录仍 200（`HASH_SALT` 未变，旧密码哈希继续有效）
- 业务表行数不变：`website_event` 2196、`website` 1
- `/api/logs/umami`、`/logs`、`stats.guatswr.top` 全部 200，容器日志 0 error

**同时清理了迁移期遗留**：

- 删除 sshtenc 上 1.36GB 悬空镜像（早期试探性拉取的 3.4.1，非在用版本）
- 删除 jd 上 263MB 镜像 tar 与空日志，保留 693K 的 `umami.sql`
- 删除 sshtenc 上临时传输文件；`authorized_keys` 已回到原 2 行

**孤儿行纠错记录**：清理性能探针时，我先按「无事件的 session」批量删，误删了一条；排查后确认它是 jd 上我自己的探针残留（事件已删、只剩空壳），而 sshtenc 的 256 条才是原始真实值。已把 jd 侧那条也清掉，现在两侧均为 2196 事件 / 256 会话，最新事件停在 2026-11-01。**教训：孤儿 session 不能无脑删，要先用 `created_at` 对时刻、并和源库行数交叉比对。**

**升级后新增能力（已实测）**：3.4.1 有独立的 `performance/*` 端点，可返回 LCP/INP/CLS/FCP/TTFB 的 p50/p75/p95，并能按 path/title/device/browser 分组。但追踪脚本里**默认关闭**，必须加 `data-performance="true"` 才会采集。验证方法见技能 `umami-analytics-ops` 的 `references/data-dimensions.md`。

