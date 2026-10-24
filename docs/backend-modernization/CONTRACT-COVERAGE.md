# 71操作当前契约覆盖（BM-34）

历史源码/鉴权表保留在API-INVENTORY；本表是迁移后入口。当前HTTP行为继承a105011双平台全量通过，BM34只补文档与真实BFF测试；最终通过SHA由BM35候选固定。每行都由contracts/api.test.mjs的同名编号运行正常输入、鉴权边界及异常输入；openapi.test.mjs校验71操作/唯一编号/引用与guest安全声明。专项补业务副作用/竞态，不以一个200代表全部验收。

| 编号 | 操作 | 共同HTTP用例 | 补充专项/EX |
| --- | --- | --- | --- |
| API-01 | `GET /api/activities` | `api.test:: API-01` | activities-module/asset-publication；EX14/23 |
| API-02 | `GET /api/activities/:id` | `api.test:: API-02` | activities-module/asset-publication；EX14/23 |
| API-03 | `POST /api/activities/draft` | `api.test:: API-03` | activities-module/asset-publication；EX14/23 |
| API-04 | `POST /api/activities` | `api.test:: API-04` | activities-module/asset-publication；EX14/23 |
| API-05 | `PUT /api/activities/:id` | `api.test:: API-05` | activities-module/asset-publication；EX14/23 |
| API-06 | `DELETE /api/activities/:id` | `api.test:: API-06` | activities-module/asset-publication；EX14/23 |
| API-07 | `POST /api/activities/:id/restore` | `api.test:: API-07` | activities-module/asset-publication；EX14/23 |
| API-08 | `GET /api/admin/users` | `api.test:: API-08` | admin-module/security-revocation/event-state；EX04/11/19 |
| API-09 | `DELETE /api/admin/users/:id` | `api.test:: API-09` | admin-module/security-revocation/event-state；EX04/11/19 |
| API-10 | `PUT /api/admin/users/:id/password` | `api.test:: API-10` | admin-module/security-revocation/event-state；EX04/11/19 |
| API-11 | `PUT /api/admin/users/:id/twofa/reset` | `api.test:: API-11` | admin-module/security-revocation/event-state；EX04/11/19 |
| API-12 | `POST /api/admin/token-version/refresh` | `api.test:: API-12` | admin-module/security-revocation/event-state；EX04/11/19 |
| API-13 | `GET /api/admin/logs` | `api.test:: API-13` | admin-module/security-revocation/event-state；EX04/11/19 |
| API-14 | `DELETE /api/admin/logs/:id` | `api.test:: API-14` | admin-module/security-revocation/event-state；EX04/11/19 |
| API-15 | `POST /api/admin/recycle-bin/purge` | `api.test:: API-15` | asset-cleanup/real-bff；EX15/23 |
| API-16 | `GET /api/admin/bans` | `api.test:: API-16` | ban-module/ban-expiry；EX20 |
| API-17 | `POST /api/admin/bans` | `api.test:: API-17` | ban-module/ban-expiry；EX20 |
| API-18 | `DELETE /api/admin/bans/:ip` | `api.test:: API-18` | ban-module/ban-expiry；EX20 |
| API-19 | `GET /api/admin/backups/settings` | `api.test:: API-19` | backup-scheduler/retention/download/real-bff Linux实际脚本；EX08/09/18 |
| API-20 | `POST /api/admin/backups/settings` | `api.test:: API-20` | backup-scheduler/retention/download/real-bff Linux实际脚本；EX08/09/18 |
| API-21 | `GET /api/admin/backups` | `api.test:: API-21` | backup-scheduler/retention/download/real-bff Linux实际脚本；EX08/09/18 |
| API-22 | `GET /api/admin/backups/download` | `api.test:: API-22` | backup-scheduler/retention/download/real-bff Linux实际脚本；EX08/09/18 |
| API-23 | `DELETE /api/admin/backups` | `api.test:: API-23` | backup-scheduler/retention/download/real-bff Linux实际脚本；EX08/09/18 |
| API-24 | `POST /api/admin/backups/run` | `api.test:: API-24` | backup-scheduler/retention/download/real-bff Linux实际脚本；EX08/09/18 |
| API-25 | `GET /api/admin/events/pending` | `api.test:: API-25` | admin-module/security-revocation/event-state；EX04/11/19 |
| API-26 | `POST /api/admin/events/:id/review` | `api.test:: API-26` | admin-module/security-revocation/event-state；EX04/11/19 |
| API-27 | `DELETE /api/admin/events/:id` | `api.test:: API-27` | admin-module/security-revocation/event-state；EX04/11/19 |
| API-28 | `POST /api/auth/login` | `api.test:: API-28` | auth-security/security-revocation/real-bff；EX04/11/19 |
| API-29 | `PUT /api/auth/profile` | `api.test:: API-29` | auth-security/security-revocation/real-bff；EX04/11/19 |
| API-30 | `GET /api/auth/me` | `api.test:: API-30` | auth-security/security-revocation/real-bff；EX04/11/19 |
| API-31 | `POST /api/auth/register` | `api.test:: API-31` | auth-security/security-revocation/real-bff；EX04/11/19 |
| API-32 | `POST /api/bot/notify/activity` | `api.test:: API-32` | bot-transport本地接收器；EX16 |
| API-33 | `POST /api/bot/notify/history` | `api.test:: API-33` | bot-transport本地接收器；EX16 |
| API-34 | `POST /api/bot/notify/member` | `api.test:: API-34` | bot-transport本地接收器；EX16 |
| API-35 | `GET /api/config` | `api.test:: API-35` | config-module/public-boundaries/asset-publication/real-bff；EX05/23 |
| API-36 | `POST /api/config` | `api.test:: API-36` | config-module/public-boundaries/asset-publication/real-bff；EX05/23 |
| API-37 | `POST /api/event/draft` | `api.test:: API-37` | events-module/guest-proof/event-content-policy/event-save-concurrency/asset-publication/real-bff；EX02/05/23 |
| API-38 | `PUT /api/event/:id` | `api.test:: API-38` | events-module/guest-proof/event-content-policy/event-save-concurrency/asset-publication/real-bff；EX02/05/23 |
| API-39 | `GET /api/event` | `api.test:: API-39` | events-module/guest-proof/event-content-policy/event-save-concurrency/asset-publication/real-bff；EX02/05/23 |
| API-40 | `GET /api/event/:id` | `api.test:: API-40` | events-module/guest-proof/event-content-policy/event-save-concurrency/asset-publication/real-bff；EX02/05/23 |
| API-41 | `POST /api/event/:id/signup` | `api.test:: API-41` | signup/signup-transactions/real-bff；EX02/03 |
| API-42 | `GET /api/event/:id/signup` | `api.test:: API-42` | signup/signup-transactions/real-bff；EX02/03 |
| API-43 | `DELETE /api/event/:id/signup` | `api.test:: API-43` | signup/signup-transactions/real-bff；EX02/03 |
| API-44 | `GET /api/event/:id/participants/public` | `api.test:: API-44` | signup/signup-transactions/real-bff；EX02/03 |
| API-45 | `GET /api/event/admin/list` | `api.test:: API-45` | events-module/guest-proof/event-content-policy/event-save-concurrency/asset-publication/real-bff；EX02/05/23 |
| API-46 | `POST /api/event/admin` | `api.test:: API-46` | events-module/guest-proof/event-content-policy/event-save-concurrency/asset-publication/real-bff；EX02/05/23 |
| API-47 | `POST /api/event/:id/approve` | `api.test:: API-47` | event-state/event-save-concurrency/real-bff；EX23（BM26c并发补验） |
| API-48 | `POST /api/event/:id/reject` | `api.test:: API-48` | event-state/event-save-concurrency/real-bff；EX23（BM26c并发补验） |
| API-49 | `POST /api/event/:id/status` | `api.test:: API-49` | event-state/event-save-concurrency/real-bff；EX23（BM26c并发补验） |
| API-50 | `POST /api/event/:id/delete` | `api.test:: API-50` | event-state/event-save-concurrency/real-bff；EX23（BM26c并发补验） |
| API-51 | `POST /api/event/:id/settle` | `api.test:: API-51` | event-state/event-save-concurrency/real-bff；EX23（BM26c并发补验） |
| API-52 | `POST /api/event/:id/set_result` | `api.test:: API-52` | event-state/event-save-concurrency/real-bff；EX23（BM26c并发补验） |
| API-53 | `GET /api/event/:id/participants` | `api.test:: API-53` | signup/signup-transactions/real-bff；EX02/03 |
| API-54 | `GET /api/history` | `api.test:: API-54` | history-module/asset-publication/asset-cleanup/real-bff；EX06/15/23 |
| API-55 | `POST /api/history` | `api.test:: API-55` | history-module/asset-publication/asset-cleanup/real-bff；EX06/15/23 |
| API-56 | `PUT /api/history/:id` | `api.test:: API-56` | history-module/asset-publication/asset-cleanup/real-bff；EX06/15/23 |
| API-57 | `DELETE /api/history/:id` | `api.test:: API-57` | history-module/asset-publication/asset-cleanup/real-bff；EX06/15/23 |
| API-58 | `POST /api/history/:id/restore` | `api.test:: API-58` | history-module/asset-publication/asset-cleanup/real-bff；EX06/15/23 |
| API-59 | `GET /api/logs` | `api.test:: API-59` | logs-module/umami本地上游/real-bff；EX05/10/17 |
| API-60 | `GET /api/logs/stats` | `api.test:: API-60` | logs-module/umami本地上游/real-bff；EX05/10/17 |
| API-61 | `GET /api/logs/umami` | `api.test:: API-61` | logs-module/umami本地上游/real-bff；EX05/10/17 |
| API-62 | `GET /api/members/stats/schools` | `api.test:: API-62` | members-module/member-native-binding/asset-cleanup/real-bff；EX15/23 |
| API-63 | `GET /api/members` | `api.test:: API-63` | members-module/member-native-binding/asset-cleanup/real-bff；EX15/23 |
| API-64 | `POST /api/members` | `api.test:: API-64` | members-module/member-native-binding/asset-cleanup/real-bff；EX15/23 |
| API-65 | `PUT /api/members/:id` | `api.test:: API-65` | members-module/member-native-binding/asset-cleanup/real-bff；EX15/23 |
| API-66 | `DELETE /api/members/:id` | `api.test:: API-66` | members-module/member-native-binding/asset-cleanup/real-bff；EX15/23 |
| API-67 | `POST /api/members/:id/restore` | `api.test:: API-67` | members-module/member-native-binding/asset-cleanup/real-bff；EX15/23 |
| API-68 | `POST /api/upload` | `api.test:: API-68` | upload-private/storage-security/upload-directory-boundary/upload-work-ownership/real-bff；EX07/22/23 |
| API-69 | `POST /api/upload/visitor` | `api.test:: API-69` | upload-private/storage-security/upload-directory-boundary/upload-work-ownership/real-bff；EX07/22/23 |
| API-70 | `POST /api/upload/visitor/avatar` | `api.test:: API-70` | upload-private/storage-security/upload-directory-boundary/upload-work-ownership/real-bff；EX07/22/23 |
| API-71 | `GET /api/version` | `api.test:: API-71` | framework-compatibility/lifecycle |

BFF全链路：真实Nuxt产物/Express/双库，双会话登录及改密撤销、内容/缓存、同NAT不同游客/EID证明/上传/审核/结算、purge隔离、备份设置和原字节下载；Linux还执行真实备份、完整verify及最后已验证点409。真实重启后旧guest ownership404，DB与已上传字节不变；新intent不能接管旧EID。Windows未运行Linux bash完整备份，必须保留Linux原生门禁。

隐式HEAD/static/SVG/docs/空body/extended query/CORS/异步拒绝由framework-compatibility和100MiB下载用例覆盖，不混入71计数。Bot/Umami只用合成本地接收器，未发送实际外部消息。
