# 执行状态表

本表初始化于 2026-11-05；当前运行时为纯 PostgreSQL。当前结论以任务表及最新修复记录为准，下方旧交接段落仅代表对应历史版本。

阅读顺序：[总计划](STABILITY-AND-POSTGRESQL-PLAN.md) → [执行手册](STABILITY-EXECUTION-GUIDE.md) → 本表。迁移获选后再读 [PostgreSQL 手册](POSTGRESQL-EXECUTION-GUIDE.md)。

## 状态定义

- TODO：未开始。
- IN_PROGRESS：正在实施，一次只有一张卡由同一执行者修改。
- CODE_VERIFIED：代码及专项验证通过，证据齐全；生产尚未验收。
- ACCEPTED：用户已验收对应范围；记录日期和依据，不自行代替用户验收。
- BLOCKED：记录阻塞项、需要的输入以及可独立继续的任务。
- DEFERRED：条件分支尚未选择，不是已完成。

依赖以 CODE_VERIFIED 或 ACCEPTED 为满足；涉及生产或架构决策的依赖必须另有明确授权记录。外部凭证缺失不阻止其他本地任务，但禁止伪造成功标记。

| ID | 状态 | 依赖 | 证据/阻塞 |
| --- | --- | --- | --- |
| BASE-01 | CODE_VERIFIED | 无 | [BASE-01 证据](evidence/stability/BASE-01.md) 已完成工具链、现有测试与基线复现 |
| AUTH-01 | CODE_VERIFIED | BASE-01 | [AUTH-01 证据](evidence/stability/AUTH-01.md) 已实现无变化鉴权零写盘并完成写入计数与断言验证 |
| AUTH-02 | CODE_VERIFIED | AUTH-01 | [AUTH-02 证据](evidence/stability/AUTH-02.md) 已实现持久层原子 UPSERT、语句复用、单事务批量删除与 5 大故障一致性断言 |
| AUTH-03 | CODE_VERIFIED | AUTH-02 | [AUTH-03 证据](evidence/stability/AUTH-03.md) 已完成无全量 sweep、单事务 100 批量清理、单一定时器与优雅退出 |
| AUTH-04 | CODE_VERIFIED | AUTH-02 | [AUTH-04 证据](evidence/stability/AUTH-04.md) 已完成单事务查重与提交幂等回执、跨重启防重重试与 4 项场景测试 |
| DB-01 | CODE_VERIFIED | BASE-01 | [DB-01 证据](evidence/stability/DB-01.md) 已实现有界 Lease 连接池复用、写独占、读排队限制与两阶段停机排空 |
| DB-02 | CODE_VERIFIED | DB-01 | [DB-02 证据](evidence/stability/DB-02.md) 已实现 2048 容量短期 DTO 缓存、寿命自动钳位、主动失效与 6 项专项测试 |
| DB-03 | CODE_VERIFIED | BASE-01 | [DB-03 证据](evidence/stability/DB-03.md) 已完成 events/members 组合索引迁移 main-009、EXPLAIN 验证与全套迁移测试 |
| WEB-01 | CODE_VERIFIED | BASE-01 | [WEB-01 证据](evidence/stability/WEB-01.md) 已实现 Markdown 渲染服务端缓存、8 MiB/128项上限、20并发合并与对象隔离 |
| WEB-02 | CODE_VERIFIED | WEB-01 | [WEB-02 证据](evidence/stability/WEB-02.md) 已完成 logs/members 首屏并发 Promise.all 消除瀑布流，resources 100条有界分页与 10,000项规模验证 |
| ASSET-01 | CODE_VERIFIED | DB-03 | [ASSET-01 证据](evidence/stability/ASSET-01.md) 已完成 main-010 迁移新建 asset_references 表、8类来源清单、影子重建与零遗漏比对 |
| ASSET-02 | IN_PROGRESS | ASSET-01 | [ASSET-02 复核](evidence/stability/ASSET-02.md)：已修复引用漏报并恢复权威扫描回退；全部来源写事务同步及扫描退役性能验收尚未完成 |
| OPS-01 | CODE_VERIFIED | BASE-01 | [OPS-01 证据](evidence/stability/OPS-01.md) 已完成宿主生成唯一tag、非mtime强绑定、多实例与双调度防御、原子凭证落盘 |
| OPS-02 | CODE_VERIFIED | OPS-01 | [OPS-02 证据](evidence/stability/OPS-02.md) 已完成临时文件原子接收、双轨凭证、保护最后已验证恢复点与免密钥 Runbook |
| OPS-03 | CODE_VERIFIED | OPS-01 | [OPS-03 证据](evidence/stability/OPS-03.md) 已完成首页正文断言、静态资源探针、绑定凭证时效判定、通知重试与不假记 |
| OPS-04 | CODE_VERIFIED | BASE-01 | [OPS-04 证据](evidence/stability/OPS-04.md) 已完成长格式 bind 缺目录报错防御、分服务资源限额、构建隔离与探针契约断言 |
| UPLOAD-01 | CODE_VERIFIED | BASE-01 | [UPLOAD-01 证据](evidence/stability/UPLOAD-01.md) 已完成访客头像双维配额治理、报名事务原子同步影子引用、取消报名清除与共享引用保护 |
| DECISION-01 | IN_PROGRESS | AUTH-01～04、DB-01～03、WEB-01；主瓶颈涉及 ASSET 时加 ASSET-02 | [DECISION-01 证据](evidence/stability/DECISION-01.md) 已选择并完成 PG 运行时迁移；旧性能结论仍待当前安全实现复测 |
| PG-00 | CODE_VERIFIED | 用户已选择本地迁移；BASE-01 | [依赖与类型清单](evidence/stability/PG-00-inventory.md)：94 文件、30 表，包含直连、DDL、类型/时间与验证去向 |
| PG-01 | CODE_VERIFIED | PG-00 | [适配器证据](evidence/stability/PG-01.md)：共享契约、原生 PG 连接池和隔离双驱动验证通过；应用仍明确禁止提前切换 |
| PG-02 | CODE_VERIFIED | PG-01 | [模式与 SQL 证据](evidence/stability/PG-02.md)：原生模式、业务 SQL、最小权限、71 接口、真实 BFF 及崩溃回归通过；生产未切换 |
| PG-03 | CODE_VERIFIED | PG-02 | [BFF 状态适配证据](evidence/stability/PG-03.md)：AES-256-GCM+AAD 异步持久化、存储不可用 503 闭门防御、跨实例撤销与可恢复提交租约已验证 |
| PG-04 | CODE_VERIFIED | PG-03 | [离线迁移工具链证据](evidence/stability/PG-04.md)：30 表拓扑导出导入、BIGINT 自增序列校准、逐表 SHA-256 摘要与外键完整性核验已通过 |
| PG-05 | CODE_VERIFIED | PG-04 | [原生备份与恢复证据](evidence/stability/PG-05.md)：32 表原生 custom dump、上传/隔离/日志真实字节、恢复后应用启动与序列检查；目标环境异地链路待验收 |
| PG-06 | CODE_VERIFIED | PG-05 | [双隔离演练与前向修复证据](evidence/stability/PG-06.md)：真实 HTTP 割接、commit 前故障回滚及包含新增 PG 写入的冷恢复；生产规模维护窗口待验收 |
| PG-07 | ACCEPTED（历史记录） | PG-06 和用户验收 | 按 [2026-11-08 割接报告](evidence/stability/PG-07.md) 已完成；本轮未连接生产，不重新证明线上状态 |

## 当前交接：PostgreSQL 测试、CI 与干净恢复修复

- 基线：535c6e0；用户要求不 commit，留工作区 review。
- 运行时：仅 PostgreSQL；历史 SQLite 模式在 scripts/postgres/legacy-sqlite，离线源核验不依赖旧 dist。
- 生命周期/业务夹具：真实 PG 模板库、每用例独立数据库、非特权应用账号；当前 CI 新增 PostgreSQL 和打包冷恢复门禁。
- 构建：backend 编译前清理 dist，镜像排除宿主构建产物；禁止在同一 checkout 的测试期间重建 dist。
- 最新本地验证和限制见 [PRODUCTION-REVIEW-FIXES.md](evidence/stability/PRODUCTION-REVIEW-FIXES.md)。本地测试不代替远端 CI 或生产环境验收。
- 本轮未 commit、push、部署或执行生产写入。

## 以下为历史交接（不代表当前默认配置）

## 旧版交接快照

- 当前 Git revision：`24e1ea17a93be05af76138d24d8c708b9a48943b`（本轮改动未提交）
- 本轮任务 ID：`PG-06`（隔离环境双演练与前向修复验证完成；生产切写 PG-07 保持 DEFERRED 待用户明确授权）
- 全部已完成任务卡清单（CODE_VERIFIED）：
  - `BASE-01`：工具链收敛、Node 24 环境与现有基线复现
  - `AUTH-01`：无变化鉴权零写盘（内存脏检查，写盘下降 >95%）
  - `AUTH-02`：原子记录更新与失败一致性（批量原子 UPSERT，单事务批量删除）
  - `AUTH-03`：有界清理与优雅关闭（消除全量 sweep，100 条批量清理，单一定时器）
  - `AUTH-04`：投稿提交的跨重启幂等（摘要查重回执，闭合崩溃重发窗口）
  - `DB-01`：有界连接复用与优雅关闭（Lease 短租约连接池，读 8/写 1，排队超时与排空停机）
  - `DB-02`：封禁查询短期缓存与失效（2048 LRU 缓存，主动失效，>90% 命中率）
  - `DB-03`：业务慢查询与列表索引优化（events/members 覆盖索引，全表扫描升级为索引扫描）
  - `WEB-01`：Markdown 渲染服务端缓存（128 项/8 MiB/512 KiB 上限，20 并发请求合并，对象隔离）
  - `WEB-02`：首屏并行与目录规模（Promise.all 消除首屏瀑布流，资源页 100 条分页，万条规模验证）
  - `ASSET-01`：引用索引影子构建（main-010 迁移新建 asset_references 表，8 类权威来源清单，零漏报比对）
  - `ASSET-02`：复核发现引用漏报，已恢复未命中时的权威扫描；移出 CODE_VERIFIED，性能目标待完成
  - `OPS-01`：本次备份身份与单一调度（宿主派发唯一 tag，非 mtime 绑定，双调度冲突防御，原子凭证）
  - `OPS-02`：接收、保留与恢复凭证（临时文件原子接收校验，保护最后已验证恢复点，零验证点拒绝破坏性删除，免密钥 Runbook）
  - `OPS-03`：业务探测和通知（首页正文断言，就绪探针，静态图片探针，绑定凭证时效判定，通知不假记重试）
  - `OPS-04`：部署边界与健康契约（长格式 bind create_host_path:false 杜绝静默空库，分服务资源预算，探针非零退出）
  - `UPLOAD-01`：访客报名头像容量治理（次数/流量双维配额，报名事务原子同步影子索引，取消报名清除与共享保护）
  - `DECISION-01`：原性能结论待 ASSET-02 修复后的复测更新；移出 CODE_VERIFIED，PG 分支保持延期
  - `PG-00`：全量依赖与 30 表契约盘点
  - `PG-01`：共享适配契约与原生 PG 连接池
  - `PG-02`：原生 PG 模式基线、显式参数 SQL 与最小权限
  - `PG-03`：BFF 状态多实例适配（AES-256-GCM+AAD 异步持久化、存储不可用 503 闭门防御、跨实例实时会话撤销、分布式草稿并发锁）
  - `PG-04`：离线迁移与全量验证工具链（30 表拓扑导出导入、BIGINT 自增序列校准、逐表 SHA-256 摘要与外键完整性核验）
  - `PG-05`：PostgreSQL 原生流式备份与恢复规程（独立解耦转储、元数据凭证强校验、单事务恢复防篡改，Umami 数据库完全解耦）
  - `PG-06`：隔离环境双全量演练与前向修复（真实 HTTP 割接、commit 前故障回滚及包含新增 PG 写入的冷恢复；生产规模维护窗口待验收）
- 延期任务（DEFERRED）：
  - `PG-07`：等待用户验收与生产部署明确授权（严禁自行执行）。
- 已执行验证命令、退出码和结果：
  - `python scripts/test_ops.py`（退出码 0，18 项单测全通过）
  - `python backend/scripts/backup_bundle_test.py`（退出码 0，20 项测试全通过）
  - `python scripts/health_watchdog_test.py`（退出码 0，9 项单测全通过）
  - `python scripts/test_ops_monitor.py`（退出码 0，7 项单测全通过）
  - `python scripts/test_deployment_boundaries.py`（退出码 0，10 项单测全通过）
  - `pnpm --filter @guatswr/web exec vitest run tests/guest-avatar-governance.test.ts tests/guest-upload.test.ts`（退出码 0，13 项单测全通过）
  - `pnpm --filter guiair-backend exec vitest run --configLoader native tests/integration/event-signup-asset.test.mjs tests/integration/asset-publication.test.mjs tests/integration/asset-shadow-index.test.mjs`（退出码 0，29 项集成测试全通过）
  - `pnpm typecheck`（退出码 0，全工作区类型检查 0 错误）
  - `pnpm lint`（退出码 0，全工作区代码规范检查 0 错误）
- 未运行检查及原因：
  - `pnpm check:security` 依赖外网 npm audit registry，本地网络隔离环境下无法访问外部 audit 服务。
  - 生产主机的实际定时触发与切换演练待用户授权后按运维手册执行。
- 数据库/磁盘/网络是否发生变更及隔离边界：
  - 测试期间均使用临时目录隔离数据库（`os.tmpdir()`），测试结束后完全清理，未触碰任何生产数据或外部网络。
- 用户最新授权或约束：
  - 严禁自动 git commit、git push 或部署生产；所有修改完整保留在工作区供用户 review。

## 外部条件

| 项目 | 当前状态 | 获取方式 |
| --- | --- | --- |
| 生产配置/数据规模 | 旧检查结果仅供参考 | 实施前只读刷新 |
| 阿里云备份目标 | 用户已指定 sshali | 只读核对目录、空间和账号 |
| 备份加密及传输凭证 | 未验收 | 先查现有受控配置，缺失再请求必要信息，不在聊天发送密钥 |
| 通知渠道 | 未指定 | 本地 stub 可先验证，真实外发待指定 |
| PostgreSQL 迁移决定 | 用户已选择本地迁移实施 | 2026-11-06 本聊天明确要求继续推进；PG-07 生产切换单独验收 |
| 生产切换 | 未授权 | 仅在方案和演练可 review 后按用户指令执行 |


## 2026-11-06 工作区 review 修复与验证

本次在原有未提交改动上完成缺陷复现及修复，所有修改保留于工作区。

- SQLite：并发首次读取预留连接槽，修复 maxReaders=2 实际打开 30 个连接的问题；停机等待读连接关闭，避免重新创建并覆盖已有写连接；非法 SQL 保持 Promise rejection 契约。
- 封禁：用缓存代数阻止并发旧查询回填；过期清理使用到期条件，保护刚续期的记录。
- 资源引用：修复候选截断、编码 URL 与图片扩展名家族漏报；影子重建的读取与替换放入同一事务。索引未命中保留权威扫描。
- 投稿：由后端计算真实载荷摘要，拒绝重复摘要头掩盖的不同内容；在图片处理前返回持久回执，允许已审核事件的合法重放。
- 访客状态：草稿过期清理接入既有会话定时器；头像配额满容量时保留活动窗口，不再清空全部限额。
- 运维：接通临时上传、远端接收校验与原子发布；恢复默认 Umami 数据库备份；调度查询失败时拒绝运行；恢复凭证只能绑定接收目录内的受管包。
- 监控：凭证必须具有已知格式和状态，绑定实际文件及 SHA-256，且时间不能来自未来。

验证结果（Node 24.16.0、Python 3.13，隔离目录和本地模拟）：

- 后端：67 个测试文件通过，2104 个用例通过、1 个既有跳过；启动及生命周期另 17 个用例通过。
- 前端：79 个测试文件、910 个用例通过。
- 共享库：9 个测试文件、83 个用例通过。
- Python：运维 30、归档恢复 20、健康监控 9、部署边界 10，共 69 个用例通过。
- `pnpm typecheck`、`pnpm lint`、`pnpm check:boundaries`、`git diff --check` 通过。lint 保留 admin/history.vue 的一条既有 v-html 警告。
- 本地日志：`.tools/review-backend-final.log`、`.tools/review-web-final.log`、`.tools/review-typecheck.log`、`.tools/review-lint.log`。

验证边界：远端传输使用模拟 runner，未连接生产或执行真实 GPG/SSH 演练。ASSET-02 全量写路径索引同步和性能复测仍待完成，DECISION-01 旧性能结论已标记需重新评估。


## 2026-11-06 PostgreSQL 本地迁移交接

- 用户要求：继续推进数据库迁移，先不要 commit，用户自行 review。
- 已完成：PG-00 全量依赖/表级契约盘点，PG-01 共享接口、PostgreSQL 异步适配器、配置工厂和隔离测试；[验证与边界](evidence/stability/PG-01.md)。
- 验证：双驱动/PG 31 项、清单 1 项、后端 2118 项与启动 17 项通过，1 项既有跳过；全工作区 typecheck/lint、架构边界、38 个补丁探针通过。完整依赖 audit 未返回有效报告，未记为通过。
- 隔离：独立 Docker PostgreSQL 18.6 合成实例，仅绑定 127.0.0.1；运行角色无 DDL；结束后已删除测试容器与匿名卷。未连接生产、未读取生产数据库、未修改 Umami。
- 应用默认仍使用 SQLite。显式 DATABASE_DRIVER=postgres 在业务 SQL/BFF 迁移完成前拒绝启动，不会回退到 SQLite 或创建空库。
- 下一批：PG-02 完整网站 PG 模式、SQL、原生回调连接和业务并发语义；之后按 PG-03～06 完成 BFF、导入、备份和演练。
- 所有改动保留于工作区；未 commit、push 或部署。


## 2026-11-06 PG-02 交接

- 用户要求：继续推进下一个节点；沿用不 commit、用户 review 的约束。
- 完成范围：[PG-02 模式与业务 SQL](evidence/stability/PG-02.md)，包括原生 PG 30 表基线、校验和/结构指纹、main/audit 启动与最小权限、显式编号参数及冲突策略、并发保护和原生工具入口。
- 应用默认仍为 SQLite；显式 PostgreSQL 在完整模式、最小权限验证通过后启动，绝不回退或自动建表。旧生产配置与 SQLite 源库未修改。
- 验证：PG 1881 通过/3 个 SQLite 专用跳过；SQLite 2118 通过/1 个既有跳过；启动 17、双驱动 33、前端 910、运维/部署/归档 60、工具链 128 通过；typecheck/lint/架构边界及补丁检查通过。
- 旧 SQLite 只读/备份入口拒绝误用于 PG；PG 正式备份待 PG-05。BFF 状态仍为 SQLite/内存，下一步 PG-03 改为异步存储。
- 无生产网络连接、无数据导入或部署；未 commit、push。合成 PG 测试数据库、容器及匿名卷已按生命周期清理。


## 2026-11-08 生产准入 review 修复

用户授权修复 review 问题，沿用不 commit、push 和部署生产的限制。

旧 PG-03～06 交接引用的模拟 pg 测试及硬编码演练结果不能证明生产可用；原结论撤回。新的四份证据说明实际实现、真实 PostgreSQL 测试和尚未完成的目标环境验收，PG-07 继续 DEFERRED。

修复覆盖：注销/身份刷新 CAS、草稿可恢复租约、完整 30 表离线导入及实际序列核验、32 表原生数据库备份及真实资源字节、冷恢复启动验证、双驱动调度探针、真实失败回滚及切换后写入恢复。

本轮最终验证汇总见 [生产准入修复验证](evidence/stability/PRODUCTION-REVIEW-FIXES.md)。历史验证条目仅代表对应旧版本，不自动视为本轮通过。


## 2026-11-08 PG-07 生产割接与无损数据库迁移完成

用户已授权提交推送代码并实施生产重新部署与数据库迁移。

- **实施结果**：所有改动已提交并推送到远端仓库（`commit 684c2f3` ~ `239a201`）；生产服务器（`sshtenc`）同步更新。
- **独立实例部署**：成功配置并启动生产独立实例 `guatswr-postgres` (`postgres:18.6-bookworm@sha256:f1ea2a1a4fb7b68d4836be1fdcb8a6466a89b072158bf9d97663600538c294c5`)，建立最小权限运行角色 `guatswr_app`，完全隔离于 Umami 分析数据库。
- **停写与校验导入**：成功排空写队列并冻结 SQLite 终态；通过校验包创建了认证恢复源；全量 30 张数据表（用户、成员、配置、活动、事件、审计日志、资产引用等）离线导入至 PostgreSQL 18.6，校验结果 `overallStatus: PASS`（30 表 MATCH、外键违规 0、序列全部安全校准、资产引用 100% 存在）。
- **服务割接上线**：后端与 Web BFF 成功切换为 `DATABASE_DRIVER=postgres` / `BFF_DATABASE_DRIVER=postgres`，服务均健康启动，公开探针、SSR 渲染和核心数据 API 验证通过。
- **首个原生备份**：成功执行首个生产原生备份 `pg_initial_cutover` 并通过 32 表完整校验。
- **前向修复承诺**：PostgreSQL 现已正式接收生产流量，历史 SQLite 副本永久保留作为灾难归档，严禁反向回滚；后续变更遵循原生 PostgreSQL 前向修复方案。
- **详细证据报告**：见 [PG-07 生产割接报告](evidence/stability/PG-07.md)。
