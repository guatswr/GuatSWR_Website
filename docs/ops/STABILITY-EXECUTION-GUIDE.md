# 稳定性更新：逐任务执行手册

版本：2026-11-05。本文是 STABILITY-AND-POSTGRESQL-PLAN.md 的执行细则；发生冲突时，先遵守用户最新指令，其次以本文明确的任务边界为准。此文没有启动任何实现任务。

## A. 给执行模型的启动指令

可将下面这段直接作为任务提示词：

> 阅读 docs/ops/STABILITY-AND-POSTGRESQL-PLAN.md、STABILITY-EXECUTION-GUIDE.md 和 STABILITY-TASKS.md。按状态表选择第一个依赖已满足且属于已授权阶段的任务；一次只实现一张任务卡。先核对当前源码和 Git 状态，再实现并执行该卡测试。不要以旧行号或文档描述代替源码。完成后写证据并更新状态，不提交、不推送、不部署。遇到依赖或行为决策缺失，记录具体阻塞；继续做没有依赖的已授权工作，不自行弱化测试或安全语义。恢复会话时从状态表和未提交 diff 接续，不重做已验证任务。

### 约束

- 当前用户只要求完善计划；执行模型收到实施指令后才修改业务代码。
- 保留用户改动，不执行 reset --hard、clean -xdf、删除卷、覆盖生产数据库、重建生产数据目录等操作。
- 生产默认只读。压测、强杀、故障注入、迁移、删除和恢复测试只能使用明确标识的隔离目录、端口、数据库或容器。
- 不读取/打印 .env 全文、docker inspect 全量 Env、私钥、令牌、原始用户记录。报告只记录必要的非敏感配置和聚合指标。
- 不同时引入 ORM、重构 API、替换鉴权框架或升级主要依赖；公共 API 成功/错误结构保持兼容，新增协议见对应任务卡。
- 任何缺失文件先 rg 查找移动后的实现，不能凭本计划新建第二套同名业务。
- 代码可验证但缺生产凭证时标记 CODE_VERIFIED，不能标记生产 ACCEPTED。迁移分支和生产切换不因上一阶段完成而自动授权。

## B. 工具、命令与证据

从仓库根目录运行，先确认 node --version、pnpm --version 与 package.json/packageManager 一致。当前要求 Node >=24.16.0 且 <25，pnpm 11.25.0。不得用 Node 22 的结果代替。

Windows 可用 .tools/node-24.16.0/node.exe；将该目录放入当前命令进程 PATH 前端，并重新核对 node 和 pnpm。工具调用之间的环境变量不保证保留，每次需要时重新设置。临时目录若无权限，可在 .tools 下创建专用子目录，将 TEMP/TMP 指向它；BACKUP_NODE_BIN 指向 Node 24 的绝对路径。

已有检查入口（执行前核对 package.json，若有变化记录实际命令）：

```sh
pnpm --filter @guatswr/shared build
pnpm --filter @guatswr/web exec vitest run tests/bff-session-core.test.ts tests/bff-session-race.test.ts tests/auth-session.test.ts tests/durable-records.test.ts tests/guest-drafts.test.ts
pnpm --filter guiair-backend build
pnpm --filter guiair-backend exec vitest run --configLoader native tests/integration/transactions.test.mjs
python scripts/test_ops.py
python backend/scripts/backup_bundle_test.py
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
pnpm check:artifacts
pnpm check:boundaries
pnpm check:routes
pnpm check:security
pnpm check:patches
pnpm test:ci
pnpm test:tooling
```

后端集成测试导入 dist，所以每次改后端先 build。Vitest 必须从对应包运行，禁止从根目录无配置扫描 .tools 内历史副本。业务专项验证通过后运行该工作包全套测试；阶段结束运行适用的根检查和现有 CI 要求。未运行项须说明原因，不写“全部通过”。

每张卡创建 docs/ops/evidence/stability/<ID>.md（实施时创建），记录：基线 revision、变更文件、原缺陷复现、实际命令和退出码、测试场景、结果、剩余风险、下一任务。性能结果保存在忽略目录，提交的报告仅包含脱敏摘要和复现命令。

## C. 固定设计规则

1. **会话第一阶段仍为单进程。** 不增加 Worker，不降低关键写入 synchronous 保证，不改变 cookie/HKDF/加密格式、expiresAt 或每次向后端核验身份的规则。
2. lastSeenAt 不作为滑动过期依据。先搜索全部消费者；如果只有当前存储使用它，停止在无变化 verify 中持久化它。若存在业务依赖则保留内存更新，并最多每 60 秒持久化一次，在证据中列出依赖。
3. 内存记录不可在持久化前原地修改；从旧记录复制候选值，提交成功后发布候选值。撤销失败时阻止该进程继续使用该会话并返回失败；重启后的保证以最后成功提交为准，不宣称失败撤销已持久化。
4. **封禁第一阶段保留既有语义。** 不移动 banGuard；缓存 TTL 初始 5 秒、最多 10,000 项，使用注入时钟测试；ban/unban 成功后失效。错误不缓存成“未封禁”，保留原 fail-open 行为并计数告警。改成 fail-closed 必须单独提出行为变更。
5. 连接复用初始每数据库 1 个写连接、最多 2 个读连接，等待队列上限 128，继承现有 1 秒等待预算；以基线测量调参。写事务独占连接，读连接不能在写事务中被不受控调用。
6. 资产引用优化分为“影子构建”和“读切换”。引用索引未证明完整前，不得用于放行物理删除；保留现有隔离区 keep-all 行为。
7. Markdown 缓存初始上限 128 项、8 MiB、单项 512 KiB、TTL 5 分钟；超大项允许渲染但不缓存。缓存键包含内容摘要、渲染器/脱敏版本及影响输出的配置；禁止缓存错误。
8. 保留策略继续采用 30 天且至少保留最新 7 份；文件年龄不能单独证明备份有效。生产清理必须先有真实恢复证据。
9. D1 前只完成 SQLite 优化。D1 决定迁移后，使用 PostgreSQL 异步驱动，不再建设 SQLite Worker。

## D. 任务卡：基线与会话

### BASE-01 环境与复现基线

依赖：无。入口：package.json、backend/package.json、web/package.json、docker-compose.yml、当前测试夹具和 .github/workflows/backend.yml。

步骤：记录干净/已有 diff → 核对工具链 → 在隔离环境运行现有鉴权/草稿/事务/备份测试 → 记录已有失败 → 建立测试数据与 HTTP 请求组合。数据包含少量会话及 10,000 会话两档；后者是压力数据，不代表当前生产规模。另记录实际业务表数量的只读聚合结果，无法访问时明确缺失。

性能脚本新建于 scripts/performance/（不得与现有脚本重名），支持固定 seed、并发、持续时间和输出路径。预热 30 秒、测量 60 秒、每组至少 3 次；正常负载和 3 倍峰值分开。没有实测峰值时先以 1/5/20 并发探索，不能把探索档位称为生产峰值。

输出：baseline.json（机器/限制/revision/数据规模/请求数/失败数/P50/P95/P99/事件循环延迟/RSS）、BASE-01.md。等待基线测试完成再修改实现。

完成：命令可重跑，固定实验参数；无敏感数据。没有生产副本时允许合成基线，但生产容量验收仍待完成。

### AUTH-01 无变化鉴权零写盘

依赖：BASE-01。入口：web/server/utils/bff-auth-service.ts、bff-session.ts、bff-runtime.ts、bff-protected.ts；测试 auth-session、bff-session-core、bff-session-race、bff-runtime。

步骤：追踪 lastSeenAt 全部读取者 → 区分身份变化和活动时间 → 无变化 verify 不调用持久化 set → 保留 requestMe、recordId 再检查、到期检查和权限判断 → 身份变化仍先可靠保存再返回。

新增断言：连续 100 次无变化鉴权持久化 set 次数为 0；登录创建一次；角色/头像变化按实际变更保存；撤销与慢 requestMe 竞争不恢复会话；expiresAt 不因访问延长。

禁止：为了少写盘缓存后端权限结果、取消撤销检查。完成：专项测试通过并提交写入计数对比。

### AUTH-02 原子记录更新与失败一致性

依赖：AUTH-01。入口：durable-records.ts、guest-drafts.ts、guest-bff.ts、bff-session.ts、server/api/bff/guest/events/[id]/index.put.ts。

步骤：先列出 Map 的 set/delete/clear/get/迭代使用方式 → 给持久层增加显式原子更新/批量删除能力，保留现有文件和加密兼容 → prepare 语句复用 → 草稿 put 使用一次 UPSERT，内存重排不得调用持久化 delete → 将数组和嵌套 receipt 复制后修改 → 提交成功后更新内存。不要通过外部调用 Map.prototype 绕过存储语义。

新增故障测试：数据库提交前抛错，内存/磁盘仍为旧记录；提交成功后新进程读取新记录；更新不出现“先删除再创建”的恢复空窗；相同 key 加密 AAD 和错误密钥拒绝行为保持；撤销失败返回非成功且当前进程拒绝继续授权。

完成：durable-records、guest-drafts、auth-session 全通过；旧格式文件可读。测试使用独立进程关闭 SQLite 句柄后再清理测试目录。

### AUTH-03 有界清理与关闭

依赖：AUTH-02。入口：bff-session.ts、guest-drafts.ts、bff-runtime.ts、web/server/plugins/bff-session-hooks.ts。

步骤：每 set 不再全量 sweep → 读取时拒绝已过期目标 → 建立每批最多 100 项的过期处理，单批数据库删除使用一个事务 → 定时器只由一个 runtime owner 注册且可关闭/unref → 保留最大条目数和原淘汰策略 → 为旧存储实例提供关闭路径，避免配置变化累积句柄。

新增测试：10,000 条过期数据不会在一次普通鉴权中全部删除；后台最终清理完成；容量始终有界；重复获取 runtime 不增加定时器；关闭可重复调用；运行中的关键写入不被静默丢弃。

完成：热路径计数和延迟改善、存储重启回归通过。若单批同步 I/O 仍造成明显阻塞，记录 Worker 候选，不在本卡扩大范围。

### AUTH-04 投稿提交的跨重启幂等

依赖：AUTH-02。入口：guest-drafts.ts、guest-bff.ts、guest events PUT、backend/src/modules/events/service.ts、repository.ts、security/guest-draft-proof.ts 和机器人 outbox 入队实现。

步骤：画出后端提交/BFF 确认回执的时间线 → 在后端引入与事件更新同事务写入的提交回执，键绑定 event id、已验证访客能力及规范化 payload digest → 同键同 digest 返回原结果，同键不同 digest 返回 409 → 事件更新、回执及通知入队在同一事务 → BFF 不确定结果重试复用相同键，不生成新操作。复用既有桥接校验，不允许匿名枚举回执。

先写协议和新增迁移设计，再实现。待确认的后端回执必须限制保留范围；未确认操作不能按短 TTL 自动重开。协议不改旧客户端成功字段。

必测：后端 COMMIT 后、BFF 回执前强杀；重试只产生一次事件提交与通知；并发相同提交、不同内容、错误能力、过期能力均符合约定。

完成：真实 BFF 集成测试证明崩溃窗口闭合。仅本地 Map 测试不算完成。

## E. 任务卡：SQLite 与页面

### DB-01 有界连接复用

依赖：BASE-01。入口：backend/src/database/sqlite.ts、models/db.js、health.ts；测试 transactions、lifecycle-boundaries、health、event-save-concurrency、signup-transactions。

步骤：保留 SqliteStore 外部契约 → 每次操作取得独占 lease，finally 归还 → 事务从 BEGIN 到 COMMIT/ROLLBACK 独占写 lease → 读 lease 同时只执行一个所属操作 → 取消只能 interrupt 自己持有的连接，取消完成前不能归还 → 异常连接销毁并有限重建 → close 阻止新请求、取消等待者、等待已借出连接退出再关闭。

不得移除 AsyncLocalStorage 作用域检查或把数据库错误变成空结果。READ/WITH 的分类不能误把写入 CTE 当读连接。

必测：两个事务不串线；取消 A 不影响 B；BEGIN 失败无泄漏；队列满和超时沿用错误映射；停机无等待者悬挂；读压力下 readiness 不错误恢复业务。

完成：目标负载连接数不超预算，连接创建数不再与 SQL 数量线性增长；全后端事务/生命周期测试通过。

### DB-02 封禁查询缓存

依赖：DB-01。入口：security/bans.ts、ban-controller.ts、middlewares/ban.js；测试 ban-module、ban-expiry、proxy、public-boundaries。

按规则 C4 实施；缓存保存有界 DTO，不缓存 Promise 失败；到期封禁不能因缓存延长，缓存寿命取 TTL 与封禁到期时间的较小值。ban/unban 提交后主动失效，清理任务同样失效。

测试：命中减少 SQL；到期立刻放行；新增封禁/解封不等待 TTL；失败不污染缓存；大量不同 IP 不超上限；静态资源与 BFF 共享地址规则保持。

### DB-03 查询索引

依赖：BASE-01。入口：modules/events/repository.ts、modules/members/repository.ts、modules/logs/repository.ts、src/migrations；测试 migrations、events-module、members-module、logs-module。

为每个 SQL 列出 WHERE/ORDER/LIMIT 和基线计划。候选索引须在合成大表上 EXPLAIN 验证；例如 events 的 status/type/created_at 组合要分别验证有无 type、多个 status 的情况，不能仅凭字段名固定一个万能索引。迁移编号读取当前最大编号后分配，不覆盖已有文件。

前导通配符搜索不会因普通 B-tree 索引自动加速；本卡保持搜索语义，不擅自改成前缀搜索。验收包括排序、分页、空字段和迁移前后输出一致。

### WEB-01 渲染缓存

依赖：BASE-01。入口：web/server/api/content/activity/[id].get.ts、utils/markdown.ts、public-data.ts、public-cache.ts；测试 public-markdown-*、public-data-cache、public-cache-limits。

按规则 C7 增加独立渲染缓存，不替换原始数据可见性检查。先取得当前可公开内容，再按摘要命中缓存；并发同摘要合并。失败必须移除进行中项。渲染树不能被某个请求原地污染。

必测：20 个并发相同内容仅渲染一次；内容或渲染版本变化重渲染；取消发布仍返回 404；缓存满/超大项/失败重试；修改返回值不能污染其他请求；脱敏、数学和高亮结果一致。

### WEB-02 首屏并行与目录规模

依赖：WEB-01。入口：app/pages/logs.vue、members.vue、resources.vue；测试 public-pages、resources、resource-browser 及对应 E2E。

先只并行独立首屏请求，保持查询 key、watch、useState 窗口和错误处理，不改 activity 历史弹窗的惰性加载。不同页面变更分开验收。

资源页先以 100/1,000/10,000 合成条目测量；默认选每页 100 条的可访问分页，避免同时增加虚拟列表依赖。保留排序/过滤的全体结果语义、目录切换页码重置和键盘焦点；全局搜索不能只搜当前页。选择虚拟化需另记设计理由。

完成：SSR 无重复请求或 hydration 警告，筛选无闪动回归，DOM 量不随全部累计条目无限增长。

### ASSET-01 引用索引影子构建

依赖：DB-03。入口：storage/reference-inventory.ts、publication.ts、cleanup.ts、retention.ts、所有包含资源引用的业务写入口；测试 asset-inventory、asset-publication、asset-cleanup、article-revisions。

输出引用来源清单，必须包含 users/members/history/activities/events/event_participants/site_config/activity_revisions 以及新增实际来源。索引设计至少包含来源类型、稳定来源 ID、字段、规范化资源路径、来源版本；原图/缩略图 family 规则与旧实现一致。

新迁移建表，重建工具默认 dry-run；合成或隔离库 apply 才写入。所有业务写入、软删、还原、版本保留清理、成员同步、机器人操作均维护引用。未知字段或无法解析路径记录 incomplete，绝不能视为无引用。

完成：新旧扫描集合逐项一致，崩溃和重建可重复；此卡不切换删除判断。

### ASSET-02 引用读切换

依赖：ASSET-01。先在隔离副本影子比对零漏报，再使发布事务按目标路径查引用，避免全站全文解析。迁移状态或重建覆盖版本不完整时回退旧扫描并保留资源。改写期间发生的变更必须通过事务/版本检测纳入重建，不能混合不同快照。

必测：共享图片、历史版本、软删除、并发发布/删除、无引用暂存、非法 URL、备份恢复后重建。失败时默认保留，不能试图“清干净”。完成：既有故障注入通过，写事务耗时随目标引用数量而非全部正文增长。

## F. 任务卡：运维

### OPS-01 本次备份身份与单一调度

依赖：BASE-01。入口：scripts/ops_backup.py、backend/scripts/backup_all.sh、backup_guard.py、utils/backupScheduler.js、deploy/operations。

宿主生成唯一合法 tag，通过 docker exec 的单独参数传入 BACKUP_DATE_TAG；只接受 full_<tag>.tar.gz，检查规范路径、非符号链接、非预存冲突，验证失败不上传/清理/写成功记录。Docker 服务通过 compose project/service label 查找唯一运行实例，不用猜容器名。

apply 前检查应用 backup_enabled 和 scheduler owner，以及已启用的外部调度；冲突或无法判定拒绝执行。dry-run 输出检测结果及计划，不更改开关。创建备份凭证，包含 run id、源 revision、明文包摘要、密文摘要和接收状态；记录成功使用原子写及可靠落盘。

测试：未来 mtime 的旧包不会选中；脚本 0 退出但缺新包仍失败；复制/校验/加密/传输任一步失败不清理；并发执行只有一个；改容器实例名仍能定位；两个实例或两个 owner 拒绝。

### OPS-02 接收、保留与恢复凭证

依赖：OPS-01。入口：ops_backup_receiver.py、backup_prune.py、backup_bundle.py、scripts/test_ops.py。

接收端先传临时名称，核对密文摘要，再原子发布正式包及绑定凭证。传输成功与解密恢复验证分开记录；mtime 不能冒充成功时间。发送端和独立 prune timer 使用同一接收端互斥协议。保留默认 30 天/7 份，并额外保留最后一个确实成功解密恢复的副本；找不到有效恢复点时禁止破坏性清理并告警。

实际验证私钥在受控位置使用，不上传到业务服务器。为故障恢复生成可直接执行、但不含密钥的命令清单。

测试：篡改、截断、错密钥、错误凭证、并发上传与清理、未知文件、软链接、只有一个恢复点、磁盘满、强杀后临时文件处理。无凭证时只交付代码及合成测试，生产状态保持待验收。

### OPS-03 业务探测和通知

依赖：OPS-01。入口：scripts/ops_monitor.py、health_watchdog.py、deploy/operations/monitor.example.json、对应 units。

为首页设置正文断言，为 readiness 校验 service/status，增加已确认存在的静态图片探测；禁止用任意 200 作为成功。使用绑定凭证判断备份时间，并显示通知未配置状态。按 3 次失败触发、持续 1 小时提醒、恢复一次通知实现，通知失败应重试且不假记已发送；状态写入原子化，定时任务禁止重叠。

告警渠道未给出时记录 BLOCKED_EXTERNAL，但继续完成本地 HTTP stub 测试；不擅自向真实联系人发送测试消息。真实渠道经用户指定后验证。

### OPS-04 部署边界与健康契约

依赖：BASE-01。入口：docker-compose.yml、.dockerignore、两个 Dockerfile、.github/workflows/backend.yml、scripts/ci。

修改默认生产目录时不移动现有数据；读取实际 Mounts，保持已有生产路径。长格式 bind 且 create_host_path:false，缺目录明确失败；新装初始化另有步骤。补充忽略 deploy 中真实数据/geo 文件，不能把构建必需材料整体排除。

增加镜像 inspect Healthcheck 的 CI 断言，再运行真实探针 HTTP 测试；不仅匹配 Dockerfile 文本。资源上限先依据 S0 峰值制定并记录，Umami/PG/Komari 分别预算，不机械使用同一数值。

验收：隔离部署缺目录不初始化空库；运行用户可读写正确目录；故障探针退出非零；健康/恢复设计保持；压力下无 OOM/资源挤兑。

### UPLOAD-01 报名头像容量治理

依赖：BASE-01。入口：web/server/api/bff/guest/upload/avatar.post.ts、guest-upload.ts、backend/src/storage/upload-controller.ts、multipart.ts、报名提交与参与者仓储。

先确定真实调用时序并记录兼容协议：建议申请短期、绑定活动及访客的上传凭据；每凭据限制文件数/字节，消费状态可靠保存。未引用头像先置私有暂存，报名保存事务确认归属后发布；失败和过期只回收确认为未引用的文件。不得要求访客拥有投稿草稿。

初始文件上限是否从 50 MiB 下调属于产品行为，先在协议中列出建议与现有前端限制，未确定前保持现有限制并增加累计配额。历史文件先仅盘点，不自动删除。

测试：重复/跨活动/跨访客凭据、上传成功未报名、并发消费、报名失败、共享引用、过期、重启和配额耗尽；禁止仅根据路径年龄删除已引用头像。

## G. 选型和阶段结束

DECISION-01 依赖 AUTH-01～04、DB-01～03、WEB-01 的实测结果；ASSET-02 若明确为主瓶颈也必须先完成。对比固定参数的基线，写出瓶颈是否仍来自 SQLite 写串行化。

默认继续 SQLite。只有用户明确选择迁移或已授权的架构目标要求迁移才进入 PostgreSQL 分支；不能以“测试通过”代替该决策。若选择继续 SQLite，PG 任务状态为 DEFERRED 而非 DONE。

Worker、PITR、多实例和高可用不是默认同时实施事项。每个额外目标必须有独立验收；不得在汇报中把“具备实现条件”写成“已经支持”。

阶段退出：适用检查全通过；性能至少三次重复且无持续超过 10% 退化；权限、草稿、资产引用和备份保护无回归。无法解释的失败必须修复或记录阻塞，不能删掉失败用例。
