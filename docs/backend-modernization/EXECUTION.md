# 后端迭代执行表

更新：2026-10-24。源码基线、事实与 ADR 见 [PLAN](PLAN.md)，测试组见 [ACCEPTANCE](ACCEPTANCE.md)。当前进度以 [STATUS.md](STATUS.md) 为入口：BM-00～25已有本地交付证据，BM-26审查后重新开放补验，后续按本次质量复核补充顺序推进；生产门禁仍独立开放。规划文档的生成不代表任务验收完成。

每行是一个任务包；涉及多个风险维度时按 a/b 子 PR 拆分。前置编号具有传递性。正常状态依次更新为 TODO → DOING → REVIEW → DONE；验收后发现遗漏可退回REVIEW并保留历史证据；BLOCKED 必须写明缺少的事实和解除条件。BM-36 是条件发布任务，BM-37～39 是可延期分支。

## 执行与验收表

| ID / 优先级 | 前置 | 源码入口与实施步骤 | 必交产物与验收 | 回退/边界 |
| --- | --- | --- | --- | --- |
| BM-00 / P0 基线冻结（DONE，首批基线） | 无 | 核对 HEAD、锁文件、app 挂载、全部路由、BFF 固定路由；补充每接口正常/异常响应与消费者；登记安全例外 | API 台账、EX 差异登记、环境事实清单；71 操作逐项有归属；A01 | 仅文档；不把源码统计当运行结果 |
| BM-01 / P0 隔离启动（DONE） | 00a（运行部分 00b 随 02） | db.js/app.js/auth.js/event.js：最小化提取路径与连接工厂；可等待初始化；测试禁用 scheduler/cleanup/Webhook；显式关闭连接和 timer | 临时双库/public/backups fixture，测试 app factory；两实例互不污染、失败退出无监听；L01 | 保留 server.js 生产入口兼容；不能先大规模改业务 |
| BM-02 / P0 行为测试（DONE） | 01 | backend/tests：Vitest+Supertest；真实 SQLite；迁入现有 node:test 的有价值断言；从路由而非内存模拟验证 | A01～A08、D01、F01、B01、I01 首批基线；缺陷单独复现；建立真实 BFF 接入脚手架 | 不运行原数据；旧缺陷不得变成永久正确断言 |
| BM-03 / P0 后端 CI（DONE） | 02 | 新增后端 workflow；backend/shared/部署/脚本变更触发；Linux 原生模块与 Windows 文件路径检查 | npm ci、测试、后续类型/lint/build、容器 smoke；单改 backend 的 PR 确实触发；保留前端门禁 | 未引入的命令不得伪造通过；根 pnpm test 暂不覆盖后端 |
| BM-04 / P0 Node 24（DONE） | 03 | backend/Dockerfile/package：只升级运行时和可复现安装，npm install 改 npm ci 单独审查；核验 sqlite3/sharp 原生构建 | 精确 Node、镜像 digest、SQLite CLI/嵌入引擎版本、锁审计结果；A/L/N 测试 | 不合并 Express/驱动升级；旧镜像+原挂载可回退 |
| BM-05 / P0 代理网络（本地DONE，生产待核） | 04 | app trust proxy、Compose、Nuxt IP 配置：列实际链路；按 CIDR 信任；覆盖 XFF；关闭公网直连或明确 loopback | 代理拓扑、各入口 req.ip 结果；伪造/短链/IPv6、登录/封禁/报名回显测试 N01 | 无生产事实仅能本地验收；不能把所有请求变成 BFF IP |
| BM-06 / P0 上传路径安全（本地DONE） | 04 | storage/upload/visitor：正整数选择器、路径分隔符边界和真实路径检查；Multer 安全升级独立子 PR；私有验证区、资源上限、失败清理 | F01～F04；SVG 服务策略和兼容例外；每个上传入口真实 multipart | 保留 URL 和 50MiB 兼容；防同前缀目录、symlink、半成品公开；不批量搬历史文件 |
| BM-07 / P0 最小认证修复（本地DONE） | 04 | auth middleware/admin/auth：有效 JWT 后查当前用户/角色；版本库错误 fail closed；原子递增全局版本；删除管理员保护；修复二步密码错误计数和解密异常 | EX 登记；A02/A03/A04；删用户旧 token、降权、DB 故障、并发删除负例 | 不换密钥/哈希/声明；错误状态调整单列；用户级撤销 schema 留 BM-31 |
| BM-08 / P0 游客入口边界（本地DONE） | 05、02 | guest-bff/event/upload_visitor：盘点旧直连客户端，形成 ADR-11；封闭绕过 BFF 的入口；复核 BFF 草稿 ownership 和上传归属 | 同 IP 两游客、异 IP、猜 EID、重放的直连/BFF 双层测试；明确暂未解决的后端证明 | 不能声称 IP 即个人身份；需要旧客户端适配时先产出迁移方案；证明实现归 BM-24 |
| BM-09 / P0 投影与配置权限（本地DONE） | 07、02 | config/logs/event：公开字段白名单；普通 admin 禁写 token_version/backup_* 等内部键；原始 SQL 错误不出公网 | A05、A08；EX 字段差异、BFF 消费验证；敏感种子不能进入公开缓存 | 不能直接套 BFF DTO 删除所有历史字段；批准例外后更新契约 |
| BM-10 / P0 恢复基础（本地DONE） | 02、04 | 两套 db_backup 和 restore：缺 sqlite3/缺库失败；双库完整；预检归档路径/hash/格式；恢复到新目录；停写与数据一致点方案 | B01/B02；隔离恢复报告、旧镜像可读验证、明确绝对输入输出 | 不执行旧 restore 覆盖现有 data；不宣称在线双库+文件天然同一时点 |
| BM-11 / P1 TS 基础（本地DONE） | 04 | backend tsconfig/build：CJS 混合迁移；先纯函数/env/errors；新 TS strict；显式路径配置 | typecheck/lint/build 脚本；dist 启动；源码与产物都不写 dist/data | 不机械改名，不同时切 ESM；遗留 JS 预算登记 |
| BM-12 / P1 完整生命周期（本地DONE） | 11、01 | app/server/config/db：显式装配依赖、环境验证、ready 顺序、SIGTERM、连接关闭、timer disposer | L01/L02；缺密钥/DB/目录权限失败，启动重试不重复任务 | 不再依赖 require 顺序；健康接口另登记；迁移尚未完成时兼容初始化器显式调用 |
| BM-13 / P1 诊断日志（本地DONE） | 12 | shared logger/request middleware：Pino、request ID、路由耗时、脱敏、任务关联 | O01；密码/token/二步密文不出现；诊断日志和审计分开 | 不把整个请求体/headers 写入；异常消息脱敏 |
| BM-14 / P1 shared 消费（本地DONE） | 11 | packages/shared exports/build：增加独立 CJS 产物与声明；保留 ESM；独立消费样例 | 打包后 clean install；require/import 都工作；前端边界和产物检查 | 不用 require TS、不偷偷把 backend 改 ESM |
| BM-15 / P1 Workspace（本地DONE） | 14、03 | 根 workspace/锁/Docker/CI：纳入 backend；保留包名或显式登记改名；原生依赖构建 allowlist | frozen install、干净容器、全工作区检查；移除后端重复锁仅在切换完成时 | 整包恢复旧 npm 锁和构建配置；不能两套安装器同时管理 backend |
| BM-16 / P1 Zod 4 | 15、02 | controllers/schemas 与 shared：逐 schema 比较默认/空值/coerce/错误消息；分 wire input/output 与 UI form | Z01；原有效输入和异常行为差分；独立路由 adapters | 不直接替换为更窄 BFF schema；general/未知历史 content 需兼容 |
| BM-17 / P0 数据实测 | 10、12 | 在获准来源的一致隔离副本上导出 sqlite_master/PRAGMA/index/FK；检查 JSON、NULL、时间、重复 | D01；双库 schema 指纹、计数、异常报告、脱敏 fixture；原数据不进 Git | 不直接运行 app 初始化原库；未知列/表保留并登记 |
| BM-18 / P1 版本迁移 | 17、11 | db/migrations main/audit 分开；SQL+checksum 账本；空库初始化与旧库 adopt 分开；Drizzle schema 内省仅副本 | D02/D03；空库/旧库/部分迁移/漂移/二次执行；移除 import DDL；启动只校验版本 | 禁止 push；禁止盲目 adopt；旧应用须可读新增结构；双库部分完成须可恢复 |
| BM-19 / P1 事务接口 | 18 | sqlite3 参数化 get/all/run、连接作用域 transaction；避免共享连接请求插入别人事务；错误分类与 busy 策略 | D04；双连接锁竞争、回滚、中断、FK；ADR-14 审计策略 | 文件/HTTP 不放进 DB 事务；SQLite busy 不能无界重试 |
| BM-20 / P1 config 模块 | 16、19、09 | controller/service/repository：公开/内部键与搬图规则；保留响应 | A05、F02、I01；管理写后 config/logs 缓存失效 | SQL 路径可整体回退；不变更 key/默认值 |
| BM-21 / P1 history 模块 | 20 | 修复箭头 callback lastID 单独子 PR；再提取查询、排序、搬图、通知 | A06；ID 返回、ASC 日期、NULL、缺图、DB 失败；群史通知 payload | 旧错误空数组与 ID 缺失列 EX；不得无记录修快照 |
| BM-22 / P1 members 模块 | 20 | tags 去重/JSON、school stats、缩略图存在检测、original 模式、软删恢复 | A06、F02；sort_order/id 稳定、学校空值、bio 不公开 | 不改默认排序；共享头像不误删 |
| BM-23 / P1 activities 模块 | 21、22、06 | 列表与详情投影分开；草稿/发布/软删恢复；文件与持久化失败路径 | A07、F02、I01；NULL status 公开、详情作者名、分页；通知只在原触发点 | 不把编辑自动增加发布通知；正式文件迁移需补偿 |
| BM-24 / P0 Event 草稿与内容 | 08、16、19、23 | event/admin 双入口：落实 ADR-11 草稿证明（BFF 服务端传递，绑定 EID/操作/期限）；先兼容扩展再启用；提取 content 持久化 | E01/E02；猜 ID、同 NAT 不同草稿、超期/篡改证明、未知管理字段；旧客户端过渡证据 | 新身份协议单独子 PR；不得靠 IP equality 关闭问题；旧数据不能直接失去访问 |
| BM-25 / P1 报名并发 | 24 | 保留两 UNIQUE 与 UPSERT；明确定义登录/匿名切换冲突；deadline 修复独立；读取和取消身份一致 | E03/E04；并发报名/取消、同 IP 多用户、NULL、截止边界、公众名单投影 | 不新增 common_id 唯一假设；截止采用北京时间，time 不能作截止 |
| BM-26 / P1 状态与结算 | 25 | approve/reject/status/settle/set_result 与 admin/review 共用规则；结果合并防丢更新；状态收紧单列 | E05；逐转换矩阵、并发结果与结算、删除恢复、旧审核 URL | 当前接口允许宽泛跳转，禁止未批准强制线性状态机 |
| BM-27 / P1 文件一致性 | 23、26、19 | upload/storage/recycle/admin purge：先 DB 提交、后可重试清理任务；引用检查；补偿移动失败与进程崩溃 | F03/F04；共享资源、孤儿扫描 dry-run、重试不删新文件、EXDEV | 不在事务中等网络/大文件；失败保留待清理记录；清理不可逆须备份 |
| BM-28 / P1 Bot 集成 | 13、19、23 | 提取 AstrBot transport；3 个真实事件格式兼容；响应体/超时上限；失败可观测；持久任务如启用独立 PR | X01；本地接收器验证 payload/header；timeout/非2xx/未配置/重发 | Event hook 默认不激活；没有接收端幂等不能承诺 exactly-once |
| BM-29 / P1 logs/Umami | 09、13、19 | 审计查询与公开投影分开；Umami envType 纳入缓存键；缓存容量/响应体/并发/超时限额 | A08/X02；时区、筛选、统计、token refresh 一次、坏 JSON、同范围不同 envType | 不改公众统计字段；外部凭据只用测试值 |
| BM-30 / P1 备份调度 | 10、12、19 | backup/Scheduler/admin：显式路径、Asia/Shanghai、互斥、子进程期限、manifest、保留策略；cron 与应用排他 | B03；手动+定时并发、重启、磁盘满、失败状态；100MiB 下载取消与 HEAD | 同步接口保持，不擅改 202；五分钟 BFF deadline 联测；保留已知恢复点 |
| BM-31 / P1 auth/admin 类型化 | 07、16、19、26、30 | 纯重构先行；用户级撤销另做 Expand 迁移/兼容声明；最后管理员事务；保留 CBC/bcrypt；bootstrap 从常规启动分离 | A02～04/I02；旧 JWT、版本缺省、密码变化、BFF revoke、bootstrap 不重提权 | 不自动全员退出；若增加用户版本，明确旧 token 兼容窗口与安全修复回退限制 |
| BM-32 / P1 Express 5 | 20～31 | 单独升级 express/types；检查 query/body/params/static/async/listen；旧 callback 内异常仍须显式处理 | 全 A/E/F/L；全部 71 操作；OpenAPI 与 BFF；未处理 rejection 为零 | 仅回退框架 PR；不同时变模块系统/驱动 |
| BM-33 / P1 生产镜像 | 32、15 | 多阶段 root context；修正 .dockerignore backend 排除；非 root；仅挂 data/public/backups；运行产物带 docs/scripts | N02/L02；干净安装、无源码 bind mount、权限/重建/停机；镜像 digest | 数据卷不随镜像删除；健康探针不触发迁移/备份 |
| BM-34 / P0 真实集成闭环 | 33 | 使用 BM-02 脚手架，真实 Nuxt 输出+Express+双库；替换上游 fixture 仅针对新套件；固定临时端口 | I01～03；登录、内容、游客、上传、审核、备份、缓存与退出；远程 CI 精确 SHA | 原 fixture E2E 保留；不能把模拟上游通过当真实通过 |
| BM-35 / P0 候选验收 | 34、17、30 | 双环境独立副本差分；恢复/回滚演练；性能；汇总 EX、ADR 和前端独立门禁 | R01～03；版本/digest、schema、RPO/RTO、运行手册、发布检查表 | 不切生产；有写入后不能简单覆盖旧快照 |
| BM-36 / 条件 生产发布 | 35＋明确授权 | 在批准窗口执行备份、停写、迁移、启动、冒烟、观察；依据批准判据回退 | 变更记录、实际观察指标、批准信息、恢复点；生产 DONE 与工程 DONE 分开 | 未授权保持待发布；不改 DNS/主站流量越过范围 |
| BM-37 / 可选 驱动 POC | 19、35 | 对 better-sqlite3 等稳定支持方案做原生构建、WAL/锁/同步阻塞/备份兼容评估 | ADR：采用或延期；相同负载 p95/事件循环/内存数据 | 默认延期；POC 不连原库、不改变应用主路径 |
| BM-38 / 可选 Drizzle 查询 | 37 采用结论 | 先单独驱动 PR；再 config→history→members→activities→events→auth；复用一套迁移账本 | 每模块原 SQL/新查询差分；D/A/I 全通过；SQL NULL/排序/事务一致 | 禁止两个驱动无设计混用共享写事务；允许保留参数化 SQL |
| BM-39 / 可选 凭据格式 | 31、35 | CBC 双读与版本化 GCM 新写；key-id/轮换/损坏处理；先部署双读兼容版本再新写 | 旧密文、新密文、错误 key、恢复、回滚；不得静默关闭二步密码 | 新密文不可被旧镜像读取时，旧镜像不能作为回退版本；TOTP 另立项 |

## 每项任务的交接模板

每任务建立 `docs/backend-modernization/evidence/BM-xx.md`，大日志保留 CI artifact 并记录有效期。不得把密码、JWT、数据库原件、私人信息上传为证据。

```text
任务 / 状态 / 负责人：
输入 HEAD / 输出 HEAD / PR：
前置任务及通过证据：
本次文件范围 / 未改范围：
实现结论：
契约变化：无，或 EX-编号（旧行为→新行为→消费者→批准依据）
数据变化：无，或迁移编号、checksum、旧版本兼容性
验证：命令、工作目录、Node/OS、fixture、退出码、通过/失败数
失败与未运行项：
回退步骤与已验证范围：
剩余风险 / 下一任务入口：
```

执行命令必须与当前阶段匹配：接入 Workspace 前使用 `npm --prefix backend ci` 和该目录实际存在的 scripts；接入后使用 `pnpm --filter guiair-backend <script>`（包名若批准改变须同步更新）。BM-03 创建 `test:unit`、`test:integration`、`test:contracts`，BM-11 增加 `typecheck/lint/build`，BM-18 增加 `db:check/db:migrate`，BM-34 增加真实集成命令。上述尚未存在的命令是交付要求，不能直接标记已执行。

跨任务共享文件（锁文件、workspace、shared exports、CI、app 装配、迁移账本）必须串行合并。后续如获准多 agent 协作，可独立处理模块，但不能共享测试库/备份目录或并发修改同一基础文件。Nuxt prepare/typecheck/build 及性能采集按现有规则串行运行。

## 2026-10-24审查补充任务（优先于原行的粗粒度顺序）

| 子节点 | 前置 | 验收与边界 |
| --- | --- | --- |
| BM-26c / P1 游客保存与审核并发 | 26a/b | 最终写入重新核验状态；屏障测试证明已发布后旧游客请求不能覆盖/退回pending，删除后不假成功；不在事务内搬图，不擅自收紧其他原有状态 |
| BM-31a / P1 bootstrap分离（前移） | 12、18 | 显式初始化命令；降权后重启不重提权、空库、幂等、错误输入；其他31子项仍依赖26/30 |
| BM-27a / P1 引用与只读盘点 | 26c、19 | 跨表共享路径、原图/缩略图、软删恢复引用；孤儿扫描默认dry-run；先固定误删复现 |
| BM-27b / P1 持久清理 | 27a | 业务删除与任务同事务；Expand迁移/旧应用兼容；重启重试、引用复核、同路径新文件不删；实际清理有恢复点 |
| BM-27c / P1 搬图补偿 | 27b | config/history/members/activities/event/upload全路径；rename/EXDEV/DB失败和提交前后崩溃；可回收孤儿且无断链引用 |
| BM-31d / P1 剩余JS业务收口 | 27～31其余 | 每项legacy JS明确归属；event剩余CRUD等业务严格TS，允许薄装配例外；作为BM-32新增前置 |

测试数量分层报告，精确SHA远程完成状态必须单列。重开节点保留历史通过证据并写明新发现；详见[PLAN 2.1](PLAN.md)和[复核证据](evidence/REVIEW-2026-10-24.md)。
