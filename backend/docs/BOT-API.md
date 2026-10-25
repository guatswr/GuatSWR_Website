# AstrBot 后端接口

此扩展提供 Bot 专用凭据、公开查询、群订阅、持久通知、提醒、身份绑定、报名与审核。既有三个 `/api/bot/notify/*` 继续存在。新增接口使用 `/api/bot/v1/*`，完整契约见 [bot-openapi.yaml](bot-openapi.yaml)，运行时可从 `/api/bot/docs/openapi.yaml` 读取。

## 启用与迁移

1. 按现有备份手册建立可恢复点，在隔离副本先验证。
2. 显式执行 `pnpm --filter guiair-backend db:migrate upgrade --data-dir /absolute/private/data`（具体参数和自定义路径遵循 [MIGRATIONS](../../docs/backend-modernization/MIGRATIONS.md)）。Bot 核心要求主库至少 **4**；当前最新为 **5**，新增群成员同步要求 main5，审计库仍为 **2**。启动不会执行 DDL。
3. 设置 `BOT_PLATFORM_ENABLED=true`、最终地址 `ASTRBOT_WEBHOOK_URL`、出站 `ASTRBOT_TOKEN`。默认平台关闭；打开但未升级主库会拒绝启动。未启用时旧接口和旧通知行为保留。
4. 超级管理员调用 `POST /api/bot/admin/credentials` 创建 Bot API 凭据，并限制权限及允许接收的群。明文只返回这一次；数据库仅存 SHA-256 摘要。
5. 将返回的 `gwb_…` 凭据放入 AstrBot 插件的私有配置。它与 `ASTRBOT_TOKEN`、网站 JWT 是三个不同用途的凭据。

主库 4 是添加表/列/索引的 Expand 迁移，不改旧迁移的 SQL 或 checksum。既有主库 3 在平台关闭时仍可由兼容校验启动。旧 v2.0.0 构建不认识新迁移账本，不能直接把它作为主库 4 的回退应用；回退需保留本次兼容校验代码并关闭平台。不得恢复旧快照覆盖新写入。

## 权限与接口

群成员定时采集、QQ 唯一关联、头像回传、管理员私信与网站后台联动见 [成员同步协议](MEMBER-SYNC.md)。机器契约现有 38 个 Bot 操作和 1 个公共成员版本接口。

所有 `/v1` 请求使用 `Authorization: Bearer <gwb_…>`。没有通配权限；权限不足返回 403，凭据错误或撤销返回 401。所有 Bot API 响应 `Cache-Control: private, no-store`。

| 权限 | 方法及接口（相对于 `/api/bot`） | 用途 |
| --- | --- | --- |
| `query:read` | `GET /v1/events`、`GET /v1/events/:id` | 公开活动、规则和赛果；隐藏草稿/待审内容及私有字段 |
| `query:read` | `GET /v1/articles`、`GET /v1/members`、`GET /v1/history` | 文章摘要、成员、群史 |
| `query:read` | `GET /v1/on-this-day` | 历史上的今天：往年同日文章与群史，含本页播报文本 |
| `subscriptions:write` | `GET/POST /v1/subscriptions`、`DELETE /v1/subscriptions/:id` | 管理本凭据的群订阅 |
| `identity:write` | `POST /v1/identity/bind` | 用一次性绑定码关联 QQ |
| `signup:read` | `GET /v1/events/:id/signup?qq=…` | 查询绑定者自己的报名 |
| `signup:write` | `POST /v1/events/:id/signup`、`DELETE /v1/events/:id/signup?qq=…` | 报名/修改及取消 |
| `review:read` | `GET /v1/reviews?qq=…` | 当前绑定管理员的待审列表 |
| `review:write` | `POST /v1/events/:id/review` | 当前绑定管理员批准/驳回，必须填写理由 |
| `deliveries:read` | `GET /v1/deliveries` | 查询本凭据的投递状态 |
| `deliveries:retry` | `POST /v1/deliveries/:id/retry` | 重发本凭据的 failed/skipped 任务 |

列表支持 `page`（默认 1，最大 1000000）和 `limit`（默认 20，最大 100）；活动支持 `type`。活动状态遵循网站公开状态，不因为 Bot 凭据而泄露待审内容。赛果包含在公开活动的 `content` 中。

网站超级管理员（JWT）可使用：

- `GET/POST /admin/credentials`，`DELETE /admin/credentials/:id`：创建、查看、撤销凭据。撤销同时取消其尚未发送的任务；已经开始的网络请求可能已被接收。
- `GET /admin/deliveries`，`POST /admin/deliveries/:id/retry`：查询全部投递和人工补发。已 sent 的任务不能通过重试接口再次发送。

示例创建凭据：

```json
{
  "name": "社团活动助手",
  "scopes": ["query:read", "subscriptions:write", "identity:write", "signup:read", "signup:write", "deliveries:read"],
  "groups": ["123456789"]
}
```

## 历史上的今天

```http
GET /api/bot/v1/on-this-day
Authorization: Bearer <gwb_…>
```

默认按**北京时间今天的月日**汇总往年同一天的活动文章和群史，日期取记录的 `date`，不使用创建时间。不包含参考日期所在年份或未来年份；文章必须未删除且已发布（兼容历史 `status=NULL`），群史必须未删除。身份、审计、正文和草稿等内部数据不进入摘要。

参数均可选：`date=YYYY-MM-DD` 指定参考日期，`source=all|articles|history` 选择来源；`page` 默认 1，`limit` 默认 20、最大 100。例如：

```text
GET /api/bot/v1/on-this-day?date=2026-10-25&source=all&limit=10
```

响应示例：

```json
{
  "date": "2026-10-25",
  "month_day": "10-25",
  "timezone": "Asia/Shanghai",
  "source": "all",
  "page": 1,
  "limit": 10,
  "total": 1,
  "has_more": false,
  "items": [{
    "source": "articles",
    "id": 12,
    "title": "社团交流活动",
    "date": "2024-10-25",
    "years_ago": 2,
    "description": "活动简介",
    "image": "/uploads/cover.png",
    "image_url": "https://guatswr.top/uploads/cover.png",
    "images": ["https://guatswr.top/uploads/cover.png"],
    "images_truncated": false,
    "tag": "交流",
    "url": "/activity/12"
  }],
  "broadcast_text": "历史上的今天（10月25日），共1条往年记录（第1页）：\n2024年（2年前） · 活动文章：社团交流活动",
  "broadcast_images": ["https://guatswr.top/uploads/cover.png"]
}
```

`items` 合并后按日期降序、来源及 ID 升序稳定分页；`years_ago` 为参考年与原始年份之差。标题最多 200 字符，简介最多 500 字符；群史链接指向 `/history`，文章指向详情页。`broadcast_text` 只包含当前页、可作为普通文本消息发送；插件应使用纯文本消息段，不把标题当消息控制码解析。需要全部记录时按 `has_more` 拉取后续页。

**文本配图播报：** 把 `broadcast_text` 作为文本消息段，再把 `broadcast_images` 中的 URL 逐个作为图片消息段即可；也可遍历 `items`，使用每条的标题/简介和 `images` 分条发送，保持图文对应。`image` 保留原有存储值以兼容旧调用；Bot 应使用绝对地址 `image_url`（首张可用图）或 `images`（多图），不需要自己拼接域名。

**活动文章只返回封面图**：每条 `images` 最多一张；不读取或收集文章相册、正文和简介中的图片。未设置封面或封面不可用时返回 `images=[]`、`image_url=""`，不会用其他图片兜底，继续纯文本播报。群史仍包括独立配图和描述中的常见 Markdown/HTML 图片，去重并略过代码示例。

只返回本站 `/uploads/` 中存在且为普通文件的 PNG/JPEG/GIF/WebP/AVIF/BMP；缺失、非法路径、准备区、非图片后缀和外站 URL 不进入新图片列表。SVG、任意动态组件、CSS 背景和 srcset 不在提取范围内；接口不返回原始文章正文。

`BOT_PUBLIC_ASSET_BASE_URL` 配置 AstrBot 及发图适配器可达、提供 `/uploads/` 的公开 origin（协议、主机和可选端口，不带路径/查询）；未设置时使用 `SITE_URL`，再回退 `https://guatswr.top`。本站绝对图片地址和相对上传路径会统一映射到这个 origin；不从请求 Host/转发头推断，也不允许客户端通过查询参数指定下载域名。**部署时须确保该 origin 的 `/uploads/` 映射同一份公共资源**。图片下载是公开 GET，不携带 Bot Bearer/JWT；实际向 QQ 发图和必要的格式转换由 AstrBot 插件完成。

群史每条最多 50 张图片，最多检查前 256 个候选；描述最多扫描 262144 个字符，超出预算时 `images_truncated=true`，不能将其当成完整图集。活动文章不扫描这些字段，`images_truncated` 固定为 false。图片文件在查询后仍可能变化，插件应在单图下载失败时继续处理其他图/文本。接口本身不抓取外站或探测公开域名；测试通过隔离服务器验证了返回 URL 可匿名下载真实 PNG。

没有匹配时返回 `total=0`、`items=[]` 和“暂无往年记录”，不是错误；超出末页仍保留总数。只识别完整且有效的 `YYYY-MM-DD` 历史日期，年/月精度、时间戳形式和脏日期不猜测补全。2 月 29 日仅匹配真实闰年的同日记录，不自动挪到 2 月 28 日或 3 月 1 日；非法查询日期返回 400。

这是只读查询接口，不新增迁移、不创建投递任务，也不会自动向群里发消息。AstrBot 可在每日定时任务或用户指令中调用它进行播报，沿用现有 Bot 平台启用条件及 `query:read` 权限。

## 群订阅与事件

`POST /v1/subscriptions`：

```json
{"group_id":"123456789","event":"event.approved","event_id":123,"lead_minutes":60}
```

省略 `event_id` 表示订阅全部活动；指定活动的订阅不影响文章/成员等非活动事件。群必须在凭据允许列表内。重复提交相同凭据/群/事件/活动会更新提前量并返回同一个订阅 ID。

- 内容：`activity.published`、`history.updated`、`member.added`。
- 活动：`event.pending`、`event.published`、`event.updated`、`event.approved`、`event.rejected`、`event.status`、`event.deleted`、`event.settled`、`event.result_set`。
- 报名：`event.signup`、`event.signup_cancelled`，不推送 QQ、IP 或内部绑定 ID。
- 提醒：`reminder.deadline`、`reminder.start`。

`event.pending/rejected` 订阅额外要求 `review:read`；报名通知要求 `signup:read`，应配置到管理群。AstrBot 服务本身是受信调用方，后端不验证 QQ 群内职务，插件必须从平台消息上下文取得 QQ，禁止把用户输入的“代某 QQ 操作”当作身份。

提醒读取 `content.deadline` 或 `content.time`，无偏移的日期时间按北京时间解析；不把活动时间冒充报名截止。`lead_minutes` 为 1–10080，默认 60。后台每 30 秒轮询，每批最多扫描 100 个公开活动，按 ID 轮转；实际提醒延迟取决于活动规模和接收端响应耗时，不承诺分钟级 SLA。未启用后台任务的测试/只读进程不调度。改期、取消、删除或退订后，发送前再次校验并取消过期提醒；过了日程时间不补发。每个订阅/日程/提前量只产生一份提醒意图。

## 网站绑定与报名互通

绑定码由网站的受信入口创建，不能由 Bot 自行申请冒充网站用户：

1. 网站 BFF 调用 `POST /api/bot/link-codes`。登录用户携带后端 JWT；游客必须经过原有 Bridge/CIDR 校验，并附 `X-Bot-Owner`：由 BFF 生成并保存在该浏览器会话中的 **32 字节随机值（64 位小写 hex）**。不能用 IP、QQ、可预测用户 ID，也不能直接转发浏览器自填的 header。
2. 用户把返回的 `code` 私聊给 Bot。五分钟有效、只存摘要、只能使用一次；重新申请会作废该身份旧码。
3. 插件调用 `POST /v1/identity/bind`，传 `{ "code":"…", "qq":"123456789" }`。
4. 网站可调用 `DELETE /api/bot/binding` 解除绑定，凭据要求与创建相同。重新关联另一 Bot/QQ 前必须解绑。

网站游客的后续报名、查询和取消请求须由 BFF 继续附同一个 `X-Bot-Owner`，即可与 Bot 共用报名记录。同 NAT 下的不同浏览器使用不同随机身份，Bot 不把所有群友映射到服务端 IP。绑定网站账号的成员则直接复用账号已有报名。

历史仅凭 IP 的游客报名不会自动合并到新身份，避免把同 NAT 下其他人的记录认领给当前用户；需要原身份取消后重新报名，或另行执行经审核的数据迁移。没有实现公众注册/新建网站管理员，Bot 也不能通过 QQ 自行获得网站账号。

报名仍复用网站业务校验：只允许 STG/则则、允许报名的活动状态、截止时间、常用 ID、QQ 和有效上传头像。接口不会代下载外部头像。示例：

```json
{"qq":"123456789","common_id":"玩家昵称","avatar":"/uploads/avatar.png","machine_sign":"机签","pilot_source":"来源"}
```

审核必须绑定一个当前仍有管理员权限的网站账号；每次事务内复核角色，只能处理 pending 活动，并把审核结果、操作者、Bot ID、理由、通知意图一起提交。并发重复审核返回 409。查询凭据不能直接修改任何业务记录。

## 投递协议与恢复

Webhook 仍是 JSON POST，携带出站 `Authorization: Bearer <ASTRBOT_TOKEN>`。在旧 `event/data/actor/source/timestamp` 之外增加：

```json
{
  "event_id": "持久事件 UUID",
  "delivery_id": "持久投递 UUID",
  "event": "event.approved",
  "data": {"eventId":123,"status":"published"},
  "target": {"bot_id":"服务凭据 ID","group_id":"123456789"},
  "actor": {"id":2,"username":"admin","role":"admin"},
  "source": "guatswr_web",
  "timestamp": "2026-10-25T00:00:00.000Z"
}
```

同一事件可有多个群投递。无群订阅时，旧三种公开内容通知仍兼容默认接收端（无 `target`）；新活动事件没有订阅则记录 skipped。插件应按 **delivery_id 持久去重**，并在真正接收/可靠入队后返回 2xx；后端不会检查响应正文。

业务变更和通知意图同库事务提交，HTTP 在事务外发送。投递使用 60 秒租约，进程重启后可恢复；最多自动尝试 5 次，指数退避，失败后可人工重发。网络确认丢失时可能重复请求，因此是至少一次传输，不承诺群消息 exactly-once。重试继续使用相同 delivery_id。接收端 2xx 表示已接收，不证明 QQ 消息已经送达。

保留原有 5 秒默认期限（可配 1–30000ms）、拒绝重定向、失败正文 64KiB 上限和退出取消。API/日志不回显出站凭据或接收端私有错误正文。尝试投递时没有配置接收端会记 skipped；停用外部服务时 worker 不发送，订阅产生的 pending 任务保留。旧兼容通知跳过发送时明确返回 skipped，修复原先仍称“已通知”的反馈。

投递状态为 pending/sending/sent/failed/skipped/cancelled。已撤销凭据或已退订的任务不继续投递。当前不自动物理删除历史通知、投递和审计；应监控数据库容量，保留恢复点后另行制定归档策略。

## 接入边界

这次提供后端能力和契约。AstrBot 指令、群消息格式、接收端幂等存储，以及网站 BFF 的绑定 UI/owner 会话接线仍需调用这些接口完成。没有部署生产、创建真实 Bot 凭据、调用外部 AstrBot、迁移原数据库或发送群消息。
