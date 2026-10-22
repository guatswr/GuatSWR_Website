# 后端接口清单与消费者映射

更新：2026-10-23。基线为 PLAN 中的提交。静态登记 70 个 router 操作及 version，共 71 个；OpenAPI 56 个，缺 15 个。下表鉴权是当前中间件事实，不表示安全验收通过。隐式 HEAD/OPTIONS、static、Swagger 子路径另行测试，不计入 71。

| 编号 | 方法与完整路径 | 当前鉴权 | 源码行 | OpenAPI 登记 | 固定 BFF operation / 消费组 |
| --- | --- | --- | --- | --- | --- |
| API-01 | GET /api/activities | 可选 JWT（另有业务检查） | backend/src/routes/activities.js:12 | 有（不代表字段准确） | activity.list |
| API-02 | GET /api/activities/:id | 可选 JWT（另有业务检查） | backend/src/routes/activities.js:49 | 有（不代表字段准确） | activity.detail |
| API-03 | POST /api/activities/draft | JWT（无路由级角色中间件） | backend/src/routes/activities.js:73 | 有（不代表字段准确） | activity.draft |
| API-04 | POST /api/activities | JWT（无路由级角色中间件） | backend/src/routes/activities.js:86 | 有（不代表字段准确） | activity.create |
| API-05 | PUT /api/activities/:id | JWT（无路由级角色中间件） | backend/src/routes/activities.js:120 | 有（不代表字段准确） | activity.update |
| API-06 | DELETE /api/activities/:id | JWT（无路由级角色中间件） | backend/src/routes/activities.js:141 | 有（不代表字段准确） | activity.delete |
| API-07 | POST /api/activities/:id/restore | JWT + super_admin | backend/src/routes/activities.js:152 | 有（不代表字段准确） | activity.restore |
| API-08 | GET /api/admin/users | JWT + super_admin | backend/src/routes/admin.js:24 | 有（不代表字段准确） | user.list |
| API-09 | DELETE /api/admin/users/:id | JWT + super_admin | backend/src/routes/admin.js:34 | 有（不代表字段准确） | user.delete |
| API-10 | PUT /api/admin/users/:id/password | JWT + super_admin | backend/src/routes/admin.js:49 | 有（不代表字段准确） | user.resetPassword |
| API-11 | PUT /api/admin/users/:id/twofa/reset | JWT + super_admin | backend/src/routes/admin.js:67 | 有（不代表字段准确） | user.resetTwofa |
| API-12 | POST /api/admin/token-version/refresh | JWT + super_admin | backend/src/routes/admin.js:85 | 有（不代表字段准确） | tokenVersion.refresh |
| API-13 | GET /api/admin/logs | JWT（无路由级角色中间件） | backend/src/routes/admin.js:104 | 有（不代表字段准确） | log.list |
| API-14 | DELETE /api/admin/logs/:id | JWT + super_admin | backend/src/routes/admin.js:135 | 有（不代表字段准确） | log.delete |
| API-15 | POST /api/admin/recycle-bin/purge | JWT + super_admin | backend/src/routes/admin.js:150 | 有（不代表字段准确） | recycle.purge |
| API-16 | GET /api/admin/bans | JWT + super_admin | backend/src/routes/admin.js:210 | 有（不代表字段准确） | ban.list |
| API-17 | POST /api/admin/bans | JWT + super_admin | backend/src/routes/admin.js:222 | 有（不代表字段准确） | ban.create |
| API-18 | DELETE /api/admin/bans/:ip | JWT + super_admin | backend/src/routes/admin.js:237 | 有（不代表字段准确） | 见下方消费者分组 |
| API-19 | GET /api/admin/backups/settings | JWT + super_admin | backend/src/routes/admin.js:253 | 有（不代表字段准确） | backup.settings |
| API-20 | POST /api/admin/backups/settings | JWT + super_admin | backend/src/routes/admin.js:270 | 有（不代表字段准确） | backup.configure |
| API-21 | GET /api/admin/backups | JWT + super_admin | backend/src/routes/admin.js:290 | 有（不代表字段准确） | backup.list |
| API-22 | GET /api/admin/backups/download | JWT + super_admin | backend/src/routes/admin.js:303 | 有（不代表字段准确） | 见下方消费者分组 |
| API-23 | DELETE /api/admin/backups | JWT + super_admin | backend/src/routes/admin.js:315 | 有（不代表字段准确） | backup.delete |
| API-24 | POST /api/admin/backups/run | JWT + super_admin | backend/src/routes/admin.js:330 | 有（不代表字段准确） | 见下方消费者分组 |
| API-25 | GET /api/admin/events/pending | JWT（无路由级角色中间件） | backend/src/routes/admin.js:343 | 有（不代表字段准确） | 见下方消费者分组 |
| API-26 | POST /api/admin/events/:id/review | JWT（无路由级角色中间件） | backend/src/routes/admin.js:366 | 有（不代表字段准确） | 见下方消费者分组 |
| API-27 | DELETE /api/admin/events/:id | JWT + super_admin | backend/src/routes/admin.js:391 | 有（不代表字段准确） | 见下方消费者分组 |
| API-28 | POST /api/auth/login | 匿名入口 | backend/src/routes/auth.js:49 | 有（不代表字段准确） | auth.login |
| API-29 | PUT /api/auth/profile | JWT（无路由级角色中间件） | backend/src/routes/auth.js:109 | 有（不代表字段准确） | profile.update |
| API-30 | GET /api/auth/me | JWT（无路由级角色中间件） | backend/src/routes/auth.js:176 | 有（不代表字段准确） | auth.me |
| API-31 | POST /api/auth/register | JWT + super_admin | backend/src/routes/auth.js:183 | 有（不代表字段准确） | user.create |
| API-32 | POST /api/bot/notify/activity | JWT（无路由级角色中间件） | backend/src/routes/bot.js:36 | 有（不代表字段准确） | 见下方消费者分组 |
| API-33 | POST /api/bot/notify/history | JWT（无路由级角色中间件） | backend/src/routes/bot.js:47 | 有（不代表字段准确） | 见下方消费者分组 |
| API-34 | POST /api/bot/notify/member | JWT（无路由级角色中间件） | backend/src/routes/bot.js:59 | 有（不代表字段准确） | 见下方消费者分组 |
| API-35 | GET /api/config | 可选 JWT（另有业务检查） | backend/src/routes/config.js:10 | 有（不代表字段准确） | config.read |
| API-36 | POST /api/config | JWT + admin/super_admin | backend/src/routes/config.js:41 | 有（不代表字段准确） | config.write |
| API-37 | POST /api/event/draft | 可选 JWT（另有业务检查） | backend/src/routes/event.js:100 | 有（不代表字段准确） | 见下方消费者分组 |
| API-38 | PUT /api/event/:id | 可选 JWT（另有业务检查） | backend/src/routes/event.js:117 | 有（不代表字段准确） | event.update |
| API-39 | GET /api/event | 可选 JWT（另有业务检查） | backend/src/routes/event.js:171 | 有（不代表字段准确） | 见下方消费者分组 |
| API-40 | GET /api/event/:id | 可选 JWT（另有业务检查） | backend/src/routes/event.js:208 | 有（不代表字段准确） | event.detail |
| API-41 | POST /api/event/:id/signup | 可选 JWT（另有业务检查） | backend/src/routes/event.js:232 | 缺失 | 见下方消费者分组 |
| API-42 | GET /api/event/:id/signup | 可选 JWT（另有业务检查） | backend/src/routes/event.js:301 | 缺失 | 见下方消费者分组 |
| API-43 | DELETE /api/event/:id/signup | 可选 JWT（另有业务检查） | backend/src/routes/event.js:317 | 缺失 | 见下方消费者分组 |
| API-44 | GET /api/event/:id/participants/public | 可选 JWT（另有业务检查） | backend/src/routes/event.js:335 | 缺失 | 见下方消费者分组 |
| API-45 | GET /api/event/admin/list | JWT + admin/super_admin | backend/src/routes/event.js:358 | 缺失 | event.list |
| API-46 | POST /api/event/admin | JWT + admin/super_admin | backend/src/routes/event.js:395 | 缺失 | event.create |
| API-47 | POST /api/event/:id/approve | JWT + admin/super_admin | backend/src/routes/event.js:424 | 缺失 | event.approve |
| API-48 | POST /api/event/:id/reject | JWT + admin/super_admin | backend/src/routes/event.js:440 | 缺失 | event.reject |
| API-49 | POST /api/event/:id/status | JWT + admin/super_admin | backend/src/routes/event.js:455 | 缺失 | event.status |
| API-50 | POST /api/event/:id/delete | JWT + admin/super_admin | backend/src/routes/event.js:473 | 缺失 | event.delete |
| API-51 | POST /api/event/:id/settle | JWT + admin/super_admin | backend/src/routes/event.js:488 | 缺失 | event.settle |
| API-52 | POST /api/event/:id/set_result | JWT + admin/super_admin | backend/src/routes/event.js:513 | 缺失 | event.results |
| API-53 | GET /api/event/:id/participants | JWT + admin/super_admin | backend/src/routes/event.js:538 | 缺失 | event.participants |
| API-54 | GET /api/history | 可选 JWT（另有业务检查） | backend/src/routes/history.js:11 | 有（不代表字段准确） | history.list |
| API-55 | POST /api/history | JWT（无路由级角色中间件） | backend/src/routes/history.js:19 | 有（不代表字段准确） | history.create |
| API-56 | PUT /api/history/:id | JWT（无路由级角色中间件） | backend/src/routes/history.js:43 | 有（不代表字段准确） | history.update |
| API-57 | DELETE /api/history/:id | JWT（无路由级角色中间件） | backend/src/routes/history.js:67 | 有（不代表字段准确） | history.delete |
| API-58 | POST /api/history/:id/restore | JWT + super_admin | backend/src/routes/history.js:78 | 有（不代表字段准确） | history.restore |
| API-59 | GET /api/logs | 匿名入口 | backend/src/routes/logs.js:130 | 有（不代表字段准确） | 见下方消费者分组 |
| API-60 | GET /api/logs/stats | 匿名入口 | backend/src/routes/logs.js:158 | 有（不代表字段准确） | 见下方消费者分组 |
| API-61 | GET /api/logs/umami | 匿名入口 | backend/src/routes/logs.js:191 | 缺失 | 见下方消费者分组 |
| API-62 | GET /api/members/stats/schools | 匿名入口 | backend/src/routes/members.js:58 | 有（不代表字段准确） | 见下方消费者分组 |
| API-63 | GET /api/members | 可选 JWT（另有业务检查） | backend/src/routes/members.js:75 | 有（不代表字段准确） | member.list |
| API-64 | POST /api/members | JWT（无路由级角色中间件） | backend/src/routes/members.js:120 | 有（不代表字段准确） | member.create |
| API-65 | PUT /api/members/:id | JWT（无路由级角色中间件） | backend/src/routes/members.js:143 | 有（不代表字段准确） | member.update |
| API-66 | DELETE /api/members/:id | JWT（无路由级角色中间件） | backend/src/routes/members.js:159 | 有（不代表字段准确） | member.delete |
| API-67 | POST /api/members/:id/restore | JWT + super_admin | backend/src/routes/members.js:170 | 有（不代表字段准确） | member.restore |
| API-68 | POST /api/upload | JWT（无路由级角色中间件） | backend/src/routes/upload.js:40 | 有（不代表字段准确） | upload.asset |
| API-69 | POST /api/upload/visitor | 匿名入口 | backend/src/routes/upload_visitor.js:64 | 有（不代表字段准确） | 见下方消费者分组 |
| API-70 | POST /api/upload/visitor/avatar | 匿名入口 | backend/src/routes/upload_visitor.js:148 | 缺失 | upload.eventAvatar |
| API-71 | GET /api/version | 匿名入口 | backend/src/routes/../app.js:85 | 有（不代表字段准确） | 运维/版本检查 |

## OpenAPI 缺口

- `POST /api/event/:id/signup`
- `GET /api/event/:id/signup`
- `DELETE /api/event/:id/signup`
- `GET /api/event/:id/participants/public`
- `GET /api/event/admin/list`
- `POST /api/event/admin`
- `POST /api/event/:id/approve`
- `POST /api/event/:id/reject`
- `POST /api/event/:id/status`
- `POST /api/event/:id/delete`
- `POST /api/event/:id/settle`
- `POST /api/event/:id/set_result`
- `GET /api/event/:id/participants`
- `GET /api/logs/umami`
- `POST /api/upload/visitor/avatar`

## 消费者分组与特殊映射

- 公开读取：web/server/utils/public-read.ts、public-data.ts 及 server/lib/public-read 使用 activities、members、学校统计、history、config、event、公开 participants、logs/stats/umami；不能用后台 DTO 替换公开投影。
- 游客：guest-bff.ts 的 draft/save/signupRead/signupSave/signupDelete/eventRead/uploadContent/uploadAvatar 对应 event/draft、event/:id、event/:id/signup、upload/visitor、upload/visitor/avatar。游客 proof/CSRF 是 BFF 边界，后端当前不具备同等保护。
- 管理：表内 operation 来自 bff-admin-upstream.ts；浏览器 event DELETE 实际转发 POST /api/event/:id/delete；浏览器 results PUT 转发 POST set_result；config PUT 转发 POST /api/config；注册使用 /api/auth/register。
- 备份运行在 bff-admin-workflows.ts 单独构造 POST /api/admin/backups/run，期限 300000ms；二进制下载和 bans/:ip 使用专用传输，不在固定 JSON 路由表里，必须单列验证。
- 旧接口：admin/events/pending、admin/events/:id/review、admin/events/:id DELETE 在当前管理 operation 表中没有直接映射，不能据此删除；Bot 三个 notify 入口也要保留独立调用契约。
- 文件：GET/HEAD /uploads/** 通过 Express static，Nuxt 在 server/routes/uploads/[...path].get.ts 代理；比较 URL、文件内容、MIME、安全头及取消。
- 非业务入口：GET /sitemap.xml、GET /api/docs/openapi.yaml、/api/docs Swagger、未知路由 404、错误中间件。旧 sitemap 使用 /activity/:id，不因新页面路径变化擅改。

## 契约补全格式

BM-00/02 为每个 API 编号补充：query/body/headers、匿名/admin/super_admin、正常/异常状态、响应字段类型与 null/缺省、分页排序、SQL/文件/审计/通知副作用、BFF/旧客户端、测试编号、EX 编号。静态表已完成；运行样本和兼容结果尚未完成。不得把 OpenAPI 的 bearer 默认安全声明当作实际路由权限。
