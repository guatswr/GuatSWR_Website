# PostgreSQL 迁移：条件执行手册

日期：2026-11-05；2026-11-06 用户已明确要求继续推进数据库迁移并保留未提交改动供 review，已授权本地代码迁移及隔离验证。2026-11-08 已修复生产准入 review 问题并以真实隔离演练替换模拟报告；最新结果与边界见 evidence/stability/PRODUCTION-REVIEW-FIXES.md。本文件不是生产切换授权。

## 固定目标和禁止项

- 独立的网站数据库及应用角色，Umami 不迁移、不复用其账号。
- 默认新建独立 PostgreSQL 18 测试实例；生产主版本由 PG-00 验证兼容性和运维要求后固定，不自动升级现有 PostgreSQL。镜像固定具体版本及 digest，不使用 latest。
- 使用 pg 异步驱动及连接池，不引入 ORM。安装前核对官方 Node 24 支持与版本说明，固定具体版本并更新锁文件，遵守仓库 minimumReleaseAge 和依赖检查。
- 初次只支持单后端/单 BFF 生产实例；数据库共享不代表资产存储、定时任务、限流和缓存已经具备多实例能力。
- 不做生产双写，不自动同步两端，不直接在线修改 SQLite 源库。采用维护窗口停写导入。
- 导入保留已有业务 ID、关系和业务语义；不趁迁移进行数据美化或字段改名。
- 不把 SQL 占位符用全局字符串替换转换，字符串、注释、JSON 文本中的问号不是参数。
- 不把 INSERT OR REPLACE 直接替换成 ON CONFLICT DO NOTHING；逐个语句明确原来的覆盖行为。

## PG-00 全量依赖清单与目标契约

依赖：DECISION-01 选择迁移，BASE-01。

先读：backend/src/database、models/db.js、migrations、modules、security、integrations、storage、health.ts、web/server/utils/durable-records.ts、备份与恢复脚本、Dockerfile 和测试夹具。

用 rg 搜索 sqlite、PRAGMA、sqlite_master、strftime、last_insert_rowid、lastID、INSERT OR、AUTOINCREMENT、BEGIN IMMEDIATE、.db、createSqliteStore；覆盖源码、脚本、测试和部署目录，排除 node_modules/.tools/dist/历史证据。然后逐个读取命中，区分正在运行的路径和历史材料。

输出 docs/ops/evidence/stability/PG-00-inventory.md，表格每行必须有：文件、消费者、读/写/DDL、数据库归属、SQLite 特有语义、PG 替代方案、测试入口、迁移状态。还需列出不通过 SqliteStore 的直接连接（如 addLog 和迁移器）；不能仅替换适配器就宣称迁移完成。

为每个表列出来源、主键、序列、外键、约束、索引、时间语义、布尔/JSON 表示以及数据异常处理。时间先用既有测试样例确认 UTC/北京时间转换，避免统一加减 8 小时。

新增/确认文档契约：DATABASE_DRIVER 默认 sqlite；PG URL 由私有环境配置注入；数据库不可达时启动或 readiness 失败，不回退到空 SQLite。

完成条件：所有运行时命中都有去向；SQLite->PG 类型映射表可检查；目标实例/账号/版本/驱动版本明确；未知项为阻塞，不能填“待实现后决定”。

## PG-01 数据库接口和 PostgreSQL 适配器

依赖：PG-00。

1. 将 SqlValue/SqlExecutor/Store 契约提取到独立文件，SQLite 适配器继续通过原测试。需要改名时保留兼容导出，避免大范围无关变化。
2. 新增 postgres 适配器与配置工厂。Pool 初始每进程最多 4 个连接、等待操作最多 128、连接获取超时 1 秒；通过隔离压测调整并记录。
3. 每个事务使用同一个 client，BEGIN/工作/COMMIT 或 ROLLBACK 后 release；失败 client 不复用。请求取消不得取消别人的操作。
4. 明确 23505/23503 等约束错误、40001 序列化失败、40P01 死锁和连接异常到现有 HTTP 错误契约的映射。不要将所有 PG 错误归为 500 或 busy。
5. 自动重试仅用于没有外部副作用、明确允许重放的整个事务；上限 2 次并有抖动。提交响应丢失属于未知结果，必须凭操作 ID 查询，不盲目重试。
6. 识别 text/timestamp/bigint/bytea 的返回类型；API ID 不允许因精度或驱动默认字符串行为改变。超出安全整数时拒绝并记录，不强转 Number 截断。
7. close 停止新 lease，有限等待后取消残余；ready 验证实际业务表访问，而不只 SELECT 1。

测试：共用契约测试分别跑 SQLite 和隔离 PG；事务竞争、回滚、取消、连接耗尽、服务重启、断连后归还、关闭幂等。每种错误验证 HTTP 状态和公开消息。

完成：同一个契约测试集合在两个驱动通过；不允许维护两套逐渐分叉的业务规则。

## PG-02 模式和 SQL 迁移

依赖：PG-01。

- 新建 PG 版本化迁移目录和明确的 schema_version；SQLite 已发布迁移保持不动。
- 网站数据库内可用 main/audit/bff 模式隔离，查询使用明确 schema；角色 search_path 固定，迁移角色与运行角色分开，运行角色不授予任意 DDL。
- 按 PG-00 清单逐语句适配占位符、RETURNING、冲突更新、聚合、LIKE、日期函数和排序。保留 API 格式，在序列化边界输出原有时间契约。
- JSON 初次可保持经校验的 text 表示，只有明确测试覆盖后才转 jsonb；不能靠转换吞掉历史非 JSON 值。
- 检查 NULL 排序、大小写比较、空字符串与隐式类型转换差异；同一 SQL 在边界数据下返回相同列表顺序和分页结果。
- 业务并发保护使用唯一约束、条件 UPDATE 和必要的 FOR UPDATE；对报名名额、审核状态转换、机器人租约、凭据撤销、备份配置更新分别证明正确性。
- 审计 outbox 保持 ID 去重，不删除既有协议。资产发布日志与引用关系随事务语义一起验证。

测试入口：backend/tests/integration 下 activities/events/signup/auth-security/security-revocation/bot-platform/member-sync/article-revisions/asset-publication/logs 等；执行 contracts 和 real-bff。PG-00 每一行必须关联至少一条验证或说明不涉及运行路径。

完成：每个生产路由都经过 PG 集成测试；无遗漏的 SQLite 直连路径；SQL 序列化和公开 DTO 不变。

## PG-03 BFF 状态适配与切换策略

依赖：PG-02、AUTH-02、AUTH-04。

目标：让 BFF 持久化使用异步存储，但不改变后端每次鉴权校验。保留应用层加密和 AAD，数据库账号仅能访问所需 bff 表。

步骤：将存储接口及所有调用者显式改为 Promise → 数据库提交确认后响应 → 登出/撤销与鉴权用 recordId/版本条件检查 → 不可达时受保护操作 503，不能继续信任过期内存快照 → TTL 在读取时判断并后台批量清理。不得保留一个只有进程本地可见的 clear/deleteByUserId 作为跨实例撤销机制。

初次部署允许管理员重新登录，必须写入维护说明。访客草稿默认走排空策略：暂停新建草稿，让既有草稿在现有有效期内完成，最终停写时确认无仍有效的未提交授权；否则本任务阻塞，或另做能保留密钥、授权、过期时间和提交回执的迁移工具。不能简单缩短 TTL 或删除未提交草稿。

测试：两个测试实例读取相同会话，A 注销后 B 拒绝；旧记录不能覆盖新版本；凭据密文不出现在日志；未知写结果可查；草稿回执跨实例、跨重启不重复提交。两个实例的测试通过不自动授权生产扩容。

## PG-04 离线导入与完整校验

依赖：PG-02。

建议工具入口：scripts/postgres/export-sqlite.*、import-postgres.*、verify-migration.*（实施时确定语言并保持一致）。接口至少提供 source/target/run-id/report-dir 和 dry-run；目标库必须匹配隔离库/迁移专用标识，导入到非空目标默认拒绝。

源必须是已验证的冻结恢复副本；不得复制运行中的单个 .db 文件假装完整备份。读取只读，不修改原数据。按外键拓扑导入，保留 ID 后校准每个序列；序列校准测试下一次插入不会覆盖历史 ID。

输入校验：表结构版本支持范围、摘要、行数、主键重复、孤立外键、日期/JSON/整数合法性、Unicode 和 BLOB。任一不兼容数据进入诊断报告并失败；不得跳过行继续报告成功。

失败恢复：整次导入在空的专用目标中进行；失败记录 run-id 和阶段，重试使用新的空目标。不能用“部分表已有就跳过”的方式恢复。禁止自动 DROP 名称不匹配的库。

校验输出：逐表 row count、按主键规范排序后的规范化摘要、主键集合、外键违规数、序列下一值、关键聚合、状态分布、时间样例、文件引用存在性。明确哪些字段需要规范化、哪些必须逐字节相同。

完成：同一冻结副本重复导入两个空目标结果相同；构造异常数据会被准确拒绝；导入中断不会污染源库。

## PG-05 PostgreSQL 备份、恢复与故障处理

依赖：PG-04、OPS-01～03。

为网站数据库新增独立备份项，不能把 Umami dump 当成网站备份。备份凭证记录数据库模式版本、应用 revision、数据摘要、资源包及加密包关联。

数据库和文件跨资源一致性仍需写入冻结或现有发布协议保证；单次 pg_dump 不会同时冻结磁盘图片。提供一次静态资源恢复验证及业务启动验证。

若目标仅为定时逻辑备份，文档必须明确 RPO 受备份间隔限制。若目标包含 PITR，必须记录 base backup、WAL 归档位置、归档失败告警、保留策略，实际恢复到一个指定时刻并检查业务记录和资源关系。

测试：断连、数据库满、备份截断、错误密钥、空实例恢复、运行用户权限、探针与告警。测试禁止接入真实机器人/外发渠道。

完成：实际从备份启动隔离网站；仅运行 pg_restore 返回 0 不够。

## PG-06 两次完整演练

依赖：PG-03～05。

在隔离环境演练两次：一次正常切换；一次在放写前故意注入失败，按回滚文档返回 SQLite。两次均使用新的目标库，禁止第二次复用已修改副本。

记录每步开始/结束、行数和摘要结果、总耗时、磁盘峰值、应用探针、核心写入流程、幂等和撤销结果。用这些实测值确定维护窗口和备份空间，不预先承诺分钟数。

再模拟“PG 已有新写入后故障”：验证 PG 备份/前向修复路径；若没有反向迁移工具，必须明确不可无损切回旧 SQLite。不要用只读阶段的回滚成功替代这个场景。

完成：演练报告含命令、角色、端口、路径、超时及每步停止条件；没有秘密值，也没有生产破坏命令可被误复制执行。

## PG-07 生产切换 Runbook（待部署授权）

依赖：PG-06 和用户验收。

实施前将以下清单填成具体命令；任何占位符、未知数据路径或未确认凭证都阻止切换。通知用户必须由用户授权的渠道发送。

| 步骤 | 操作与证据 | 失败动作 |
| --- | --- | --- |
| 1 | 确认镜像/源码/模式/配置 revision、备份空间、已验证恢复点 | 保持旧服务 |
| 2 | 暂停所有写入来源和后台任务，等待在途为零 | 未排空不导入 |
| 3 | 创建最终冻结数据库及资源恢复点，校验 | 不切换 |
| 4 | 导入全新 PG 目标并完成 PG-04 校验 | 保持停写，修复或恢复旧服务 |
| 5 | 切换候选应用，后台仍暂停，检查只读路由/权限/探针 | 停候选，恢复旧配置 |
| 6 | 记录放写决策，开放写入并逐项恢复任务 | 已产生 PG 写入后禁止直接切旧库 |
| 7 | 连续检查指标及完整业务流程，完成真实备份恢复 | 按 PG 故障方案处理 |

初始观察期至少 48 小时并覆盖一次完整业务高峰和备份周期；未覆盖则延长。旧库和旧镜像保留至少 7 天且直到用户验收完成，之后另行安排退役。

退出：记录 PostgreSQL 第一笔生产写入时刻，备份和告警真实验证通过，无持续错误/队列增长/超过约定的延迟退化。代码迁移完成但生产未切换时，状态只能是 CODE_VERIFIED，不能写 ACCEPTED。


## 2026-11-08 可执行工具入口与上线门槛

先在 Node 24.16 / pnpm 11.25 环境构建 shared 和 backend。连接串由私有环境文件/秘密注入提供，不放 CLI 参数或工单。

冻结源必须来自已校验的完整备份。示例仅用于已经准备好的隔离副本，变量必须由操作人填写；不得对在线 SQLite 目录运行：

```sh
pnpm prepare:postgres-source --bundle "$SOURCE_FULL_BUNDLE" --sha256 "$SOURCE_BUNDLE_SHA256" --target-dir "$NEW_VERIFIED_COPY"
pnpm migrate:postgres --source "$NEW_VERIFIED_COPY/data" --target-database "$ISOLATED_NEW_DATABASE" --run-id "$REVIEW_RUN_ID" --dry-run
pnpm migrate:postgres --source "$NEW_VERIFIED_COPY/data" --target-database "$ISOLATED_NEW_DATABASE" --run-id "$REVIEW_RUN_ID"
```

私有 POSTGRES_MIGRATION_URL 指向与 --target-database 精确一致的新隔离库；名称必须以 guatswr_migration_/guatswr_restore_ 等认可前缀开头（或 _test 结尾），不允许任意生产库名。dry-run 不初始化、不写数据；成功后也要使用全量校验结果和资源报告决定是否进入下一步。

部署镜像内的原生备份入口：

```sh
node /app/scripts/postgres/cli.mjs create --tag "$BACKUP_TAG" --output-dir /app/backups/postgres
node /app/scripts/postgres/cli.mjs verify --bundle "$PRIVATE_NATIVE_BUNDLE"
node /app/scripts/postgres/cli.mjs restore --bundle "$PRIVATE_NATIVE_BUNDLE" --target-database "$ISOLATED_NEW_DATABASE" --target-dir "$NEW_RECOVERY_ROOT" --runtime-role guatswr_app
```

create 使用私有 POSTGRES_BACKUP_URL，restore 使用私有 POSTGRES_RESTORE_URL。备份账号需要 CONNECT、三个 schema 的 USAGE、全部表和序列的 SELECT（包括 bff.records 和 schema ledger）；不授予写入/DDL/角色管理。普通运行账号的 sequence USAGE 不足以 pg_dump，必须单独配置备份账号并做一次实际演练。恢复账号仅用于隔离新库的 DDL，应用不使用它。

恢复后的路径为 NEW_RECOVERY_ROOT/data（DATA_DIR）、该目录的 public（PUBLIC_DIR）、asset-quarantine 和 asset-publications。候选失败时不切流量，保留诊断并新建空目标重试；数据库与目录发布不是跨资源事务。

上线前必须记录并核对：

- 审核后的源码与镜像 digest、模式校验和、Node/PG/client 版本、角色及 TLS、真实持久卷挂载。当前未提交镜像只用于 review。
- 暂停所有写入口和定时任务；停止新访客草稿发行，排空在途及迁移前未完成访客草稿。SQLite BFF cookie/草稿状态不会自动导入 PG；切换需明确使旧状态失效，不能让用户继续向旧状态写入。
- 生产数据规模的全链路耗时、资源与数据库磁盘峰值、维护窗口及停止条件。合成数据报告不用于容量承诺。
- 单一宿主调度 owner；实际 timer 触发、GPG 加密、异地接收校验、远端取回解密、空实例恢复并启动网站、通知/告警真实到达。仅 mock SSH 或 pg_restore 返回 0 不构成验收。
- PG 本地包与异地包的磁盘预算和保留规则；只有经过独立恢复验证的点可授权删除旧点。逻辑定时备份 RPO 受间隔限制，未实现 PITR。
- 在放写前可回到冻结 SQLite；记录第一笔 PG 生产写入后，禁止直接切回旧 SQLite，走 PG 恢复/前向修复。至少覆盖一次业务高峰和完整备份周期。

当前不 commit、不 push、不切生产流量，PG-07 仍等待 review 和单独部署授权。
