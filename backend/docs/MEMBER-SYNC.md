# QQ 群成员同步与 AstrBot 对接

后端发起异步采集命令，AstrBot 回传完整快照；QQ 是人员的唯一业务标识，原 `members.id` 继续作为内部主键。`group_id` 是群号，`group_card` 是群名片，`nickname` 是 QQ 昵称。一个 QQ 在多个群只对应一个网站成员。

## 启用顺序

1. 在副本完成验证和备份后显式升级主库到 **5**，审计库仍为 2：`pnpm --filter guiair-backend db:migrate upgrade --data-dir /absolute/private/data`。启动不执行 DDL。当前代码可在旧库关闭同步时继续运行；旧发行构建不认识 main5，不能直接当作回退应用。
2. 设置 `BOT_PLATFORM_ENABLED=true`，配好最终 `ASTRBOT_WEBHOOK_URL` 和出站 `ASTRBOT_TOKEN`。成员同步设置默认 disabled，不因升级自动发送任何采集请求。
3. 创建 Bot 服务凭据，授予 **members:sync**、**deliveries:ack** 及允许采集的群。插件回调使用该 `gwb_…`；它不同于出站 Webhook token。
4. 私信接收管理员先登录网站，通过已有一次性绑定码接口绑定此 Bot 的 QQ 身份。接收人配置使用网站管理员的整数用户 ID，不是直接填写任意 QQ。
5. 后台「住民管理 → QQ群成员同步 → 配置同步与手动采集」设置 Bot 凭据 ID、群号、间隔、接收人。默认间隔 360 分钟；可配 30–10080 分钟。多群列表顺序确定自动昵称的来源优先级。
6. 给旧成员关联 QQ，再手动请求第一次采集。首次完整快照只预览；管理员核验后应用。QQ 未关联的旧记录不按昵称自动合并；可以明确确认保留未关联档案。
7. 插件实现并联调后再启用定时采集。调度状态持久化，重启不会重复补发所有历史周期。同群至多一个活动任务。

## 接口

以下路径相对于 `/api/bot`；网站管理操作使用 JWT，插件使用分配的 Bot Bearer。

| 方法与路径 | 权限 | 用途 |
| --- | --- | --- |
| GET/PUT `/admin/member-sync/settings` | super_admin | 读取/保存配置，修改会作废尚未完成的旧配置任务 |
| GET/POST `/admin/member-sync/requests` | super_admin | 最近 50 条任务 / 发起采集，POST 传 `group_id` |
| GET `/admin/member-sync/requests/:id` | super_admin | 任务进度、差异和 QQ 对照名单；支持 page、search |
| POST `/admin/member-sync/requests/:id/apply` | super_admin | 核验首次或异常快照，必须填写理由 |
| PUT `/admin/members/:id/sync-profile` | admin | 关联唯一 QQ、控制自动跟随/保护、标记资料完成 |
| GET `/admin/member-sync/profiles` | admin | 最新 500 条待完善任务及其私信状态 |
| GET `/v1/member-sync/requests/:id` | members:sync | 读取分配给此 Bot 的任务及已知头像校验值 |
| PUT `/v1/member-sync/requests/:id/batches/:batch_no` | members:sync | 暂存不可变成员批次，序号从 1 开始 |
| POST `/v1/member-sync/requests/:id/avatars` | members:sync | 为已经暂存的 QQ 上传头像原始字节 |
| POST `/v1/member-sync/requests/:id/complete` | members:sync | 确认全部批次回传完成，校验后提交/预览 |
| POST `/v1/member-sync/requests/:id/fail` | members:sync | 采集失败，不改变公开名册 |
| POST `/v1/deliveries/:id/receipt` | deliveries:ack | 私信实际发送结果，与 HTTP 接收成功分开 |

公共 `GET /api/members/revision` 只返回 `{ "revision": 123 }`，不含 QQ 或群信息。完整机器契约见 [bot-openapi.yaml](bot-openapi.yaml)：38 个 Bot 操作，加 1 个公共版本接口；原 71 个操作另保留在原 OpenAPI。

网站 BFF 使用封闭路径映射 `/api/bff/admin/member-sync/{settings|requests|job|apply|profile|profiles}`，`job/apply/profile` 的 ID 从经过验证的 `?id=` 获取。所有写入照常校验站点会话、当前权限、Origin 和 CSRF；后端 JWT 不进入浏览器。

## 采集命令与回传

后端通过现有持久投递队列发送：

```json
{
  "kind": "command",
  "event": "members.sync.request",
  "event_id": "事件UUID",
  "delivery_id": "投递UUID",
  "target": {"type":"service","bot_id":"服务凭据UUID"},
  "data": {
    "request_id": "同步任务UUID",
    "group_id": "123456789",
    "expires_at": 1790000000000,
    "limits": {"members":10000,"batch":500,"batches":100,"avatar_bytes":2097152}
  },
  "source": "guatswr_web"
}
```

这是插件采集命令，**不能播报到群里**。HTTP 2xx 只表示接收成功，不是成员同步成功。插件以 `delivery_id` 去重，调用适配器取得完整列表，使用同一个 `request_id` 回传；禁止把部分列表标成完整。

分批 PUT 示例：

```json
{
  "members": [
    {"qq":"123456789","group_card":"群名片","nickname":"QQ昵称","group_role":"member"}
  ]
}
```

QQ 为 5–12 位非零开头的十进制字符串；不以昵称、IP 或头像判断同一个人。每批最多 500 人、最多 100 批、总计最多 10000 人；同批重传须内容相同（校验标准化 JSON SHA-256），不同内容返回 409。重复 QQ、批次缺失、人数不符会拒绝提交。`group_role` 可为 member/admin/owner，仅记录群角色，不给网站账号授予权限。

成员批次成功后，可为其中 QQ 上传头像：

```http
POST /api/bot/v1/member-sync/requests/任务UUID/avatars
Authorization: Bearer <gwb_…>
X-Member-QQ: 123456789
Content-Type: image/png

<图片二进制>
```

只接受实际 PNG/JPEG/WebP，最多 2MiB，解码上限 1600 万像素；校验真实格式后去元数据并转换为最大 256×256 WebP。拒绝 SVG、伪装的文本和任意下载 URL。返回 `avatar_ref` 供追踪，但不必回填已经不可变的成员批次，服务器已按任务/QQ 关联。相同任务相同头像可幂等上传；已应用的原始字节 SHA-256 通过 GET 任务的 `known_avatars` 返回，插件可跳过未变化的头像，服务端也会复用仍可用的相同头像。

所有批次结束后 POST complete：

```json
{"complete":true,"batch_count":1,"member_count":1}
```

任务通常有 10 分钟回传期限；不可再写的任务返回 410，配置变化/冲突返回 409，权限问题返回 401/403。首次快照返回 `status=preview`，空列表或较上次减少超过一半返回 `status=blocked`；原成员页此时保持不变。预览/异常快照留给管理员 24 小时核验，不会被定时请求不断覆盖。已成功的 complete 重传返回保存的结果，完成清单不可更改。

首次/异常快照详情中的 `preview` 提供每页 50 人的 QQ、群名片、昵称、已关联站内成员 ID 与展示名；`page` 最大 1000000，`search` 最多 50 字符，可按 QQ/名片搜索。后台「查看名单与关联QQ」可直接选择无QQ的旧档案进行关联，关联后重新计算预计新增数量，不按相似昵称猜测。核验完再应用。

人工应用示例：

```json
{"reason":"已核对成员QQ和名单差异","allow_unlinked":false,"allow_large_drop":false}
```

保留未绑定旧档案或接受空列表/人数骤降需要分别明确设为 true。差异应先在网站核验，不要让插件自动设置这些人工确认项。

## 成员页与资料保护

- 先暂存全部批次，完整校验后在主库事务内写入成员、群关系、待完善任务及私信意图；失败回滚，不能半批更新。
- 一个 QQ 对应一条成员记录，多群保留各自名片；新成员以群名片、昵称、未命名群友依次回退，初始学校为空、标签为空、身份为社群成员，排在已有名单后方。
- 旧成员的展示名、学校、标签、身份和排序保持原值。后台显式勾选后才跟随群资料；手工修改昵称/头像会关闭相应跟随。网站角色与群管理员角色无关联。
- 后台 QQ 字段用来关联旧记录，号码唯一；已关联号码不允许直接换成另一个 QQ，以免错误合并两个人。
- 连续两次**完整成功**快照缺席才标记该群离开；只隐藏已离开全部受管群、由同步创建且没有保护标记的成员。档案、头像和手工记录不删除，手工软删除记录不自动恢复。
- 名册先提交；头像通过已有文件事务每轮最多处理 20 个，失败保留旧图/占位，不阻塞整群。调度约每 30 秒检查一次；采集调度独立于 Webhook 网络投递，重启可继续处理。
- 公开成员 API、Bot 公开查询、SSR/payload 均不返回 QQ 或同步内部字段；管理员通过受保护接口查看和完善。

主库触发器自动增加成员版本，涵盖 Bot、后台和其他合法写入口。BFF 按版本区分成员列表/排序键/院校统计缓存，版本探测合并为最多五秒一次（失败不缓存、旧后端 404 兼容）；BFF 成员写操作立即清除版本探测缓存。已打开的公开成员页在可见时每 60 秒检查版本，有变化才刷新。头像更新同样产生版本变化。

## 管理员私信

新成员会产生持久资料待办，并按本轮同步合并提醒；首次导入是一条初始化汇总，多群同 QQ 不重复创建待办。提醒消息的目标必须是配置中、已绑定此 Bot QQ 身份且当前仍为管理员的用户：

```json
{
  "kind":"notification",
  "event":"members.profile_required",
  "delivery_id":"投递UUID",
  "target":{"type":"private","bot_id":"服务凭据UUID","qq":"管理员QQ"},
  "data":{
    "count":1,"initial":false,
    "members":[{"id":42,"qq":"123456789","name":"群名片"}],
    "truncated":false,"admin_path":"/admin/members?pending=1"
  }
}
```

插件将它发送给指定管理员的私聊，内容提示新成员 QQ、昵称以及网站后台待完善入口。每条最多列 50 人，`count/truncated` 指示是否需到后台查看剩余记录。名片按纯文本处理，不当 CQ 码、命令或链接执行。插件负责好友/临时会话能力及实际发送。

发送后提交回执：`{"status":"sent"}` 或 `{"status":"failed","error_code":"not_friend"}`。error_code 只允许 unavailable/not_friend/rate_limited/unknown，不回传原始私聊内容或平台凭据。HTTP 2xx 接收后 `message_status` 仍 pending，只有回执才确认实际发送；十分钟无回执转为失败，可通过既有投递重试接口重发，沿用同一个 delivery_id，插件必须持久去重。迟到的成功回执可纠正超时状态，矛盾回执返回 409。

没有可用接收人、接收人失去管理员权限、Bot 离线或私信失败时，网站待办仍保留。后台显示待完善状态和通知异常；未排队的待办在启用同步且有有效接收人后补排。完成资料核验后清除待办，不因重复同步反复提醒。

## 验证与部署边界

本功能仍默认关闭，插件未在此仓库实现。测试使用隔离双库、本地模拟接收器和真实 Nuxt/浏览器，未迁移生产数据库或给真实 QQ 发消息。调用现有验包/恢复工具建立恢复点后再显式升级 main5；保持当前运行代码以关闭功能回退，不能把旧快照覆盖新写入。

开发验证：先构建 shared 和后端，构建 web，运行 `test:bff`；浏览器专项使用 `pnpm --filter guiair-backend test:ui`，需要安装 Playwright Chromium，并通过 `BACKEND_BFF_OUTPUT` 指向 web 生产产物。完整记录见 [迁移证据](../../docs/backend-modernization/evidence/MEMBER-SYNC-2026-10-25.md)。
