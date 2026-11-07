# PG-00 依赖清单与目标契约

源码基线：`24e1ea17a93be05af76138d24d8c708b9a48943b`。由 `node scripts/postgres/inventory.mjs` 重建；仅读取仓库源码，在内存生成模式，未读取生产数据库。

2026-11-06 用户明确要求继续推进数据库迁移并保留未提交改动，授权本地 PG-00/01 实施。生产切换属于 PG-07，需另行验收。

## 固定目标

- PostgreSQL 18.6，测试镜像 postgres:18.6-bookworm@sha256:f1ea2a1a4fb7b68d4836be1fdcb8a6466a89b072158bf9d97663600538c294c5；pg 8.23.1 / @types/pg 8.23.1，Node 24.16.0。生产镜像沿用此候选前需通过 PG-06 资源和恢复演练。
- 网站独立 guatswr 数据库，main/audit/bff 模式；目标角色 guatswr_migrator（DDL）、guatswr_backend（main/audit DML）、guatswr_bff（bff DML）。运行角色无 CREATE。测试使用独立 guatswr_pg_contract_test 与合成角色，不接触 Umami。
- 默认 DATABASE_DRIVER=sqlite；显式 postgres 必须提供私有 POSTGRES_URL，配置值不写日志。当前应用仍拒绝 PG 启动；adapter factory 只供隔离验证，PG-02/03 完成前不做 SQL 自动翻译或运行时回退。
- 每进程默认 4 个连接、最多 128 个等待者、获取 1000ms、停机宽限 1000ms；超限/超时拒绝。每事务独占 client；取消只销毁自己的 client。
- 验证目标为 Linux PostgreSQL 18.6；每会话 client_connection_check_interval=100ms，确保取消长查询后服务端锁释放。原生 Windows PostgreSQL 未纳入此候选验证。
- 不自动重放任何事务；序列化/死锁错误标记可重试但由业务确认重放安全。COMMIT 响应丢失是 outcome_unknown，须按操作 ID 查询确认。

## 类型、时间与异常数据策略

| SQLite | PostgreSQL 初次映射 | 校验/兼容语义 |
| --- | --- | --- |
| INTEGER 主键/毫秒/计数 | BIGINT；自增仅对原 AUTOINCREMENT 使用 identity | 驱动按安全整数返回 number；越界拒绝；保留 ID 后校准序列 |
| INTEGER 布尔标志 | SMALLINT（0/1，保留 API number） | 导入发现其他值失败；有历史允许范围的字段保持原约束 |
| TEXT / DATETIME / JSON 文本 | TEXT | 字节/Unicode、空字符串、NULL、非法历史 JSON 保持原样；业务原本要求 JSON 时才校验，不转 jsonb 吞错 |
| BLOB | BYTEA | 逐字节摘要；BFF 密文继续 AES-GCM 与原 AAD |
| UTC CURRENT_TIMESTAMP 字符串 | TEXT + 显式 UTC 格式默认值 | 保留 YYYY-MM-DD HH:mm:ss；日志仍显式输出 +08:00，不在适配器统一加 8 小时 |
| 原生 PG timestamp/date/numeric | 驱动返回 text | 避免本地时区偏移和精度截断；业务 DTO 在 PG-02 显式格式化 |

唯一性、外键、CHECK、部分索引见下面每表和配套 JSON。缺失的旧外键不擅自添加；PG-04 报告孤立关系/类型漂移并停止导入。旧表字段排序/大小写、NULL 排序、LIKE、COALESCE 和隐式数值转换需逐查询对照测试；排序采用显式 NULLS FIRST/LAST 和必要的 COLLATE "C"，不依赖 PG 默认值。

## 文件与消费者

| 文件 | 消费者 | 读/写/DDL | 数据库归属 | SQLite 语义 | PG 替代方案 | 测试入口 | 状态 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| backend/Dockerfile | 备份、恢复、调度与容器 | 写/读 | main | sqlite3 | PG-05 网站独立 pg_dump/恢复；冻结数据库与文件；Umami 不变更 | backup_bundle_test / test_ops / test_deployment_boundaries | PG-05 待迁移；SQLite 基线保留 |
| backend/scripts/_backup_common.sh | 备份、恢复、调度与容器 | 读 | main / audit（见命中明细） | SQLITE3_BIN, sqlite3, .db | PG-05 网站独立 pg_dump/恢复；冻结数据库与文件；Umami 不变更 | backup_bundle_test / test_ops / test_deployment_boundaries | PG-05 待迁移；SQLite 基线保留 |
| backend/scripts/backup_all.sh | 备份、恢复、调度与容器 | DDL/元数据/读 | main / audit（见命中明细） | SQLite, SQLITE3_BIN, PRAGMA, BEGIN IMMEDIATE | PG-05 网站独立 pg_dump/恢复；冻结数据库与文件；Umami 不变更 | backup_bundle_test / test_ops / test_deployment_boundaries | PG-05 待迁移；SQLite 基线保留 |
| backend/scripts/backup_bundle_test.py | 隔离测试/演练夹具 | DDL/元数据/写/读 | main / audit（见命中明细） | sqlite3, .db, SQL 参数/存储契约, sqlite | 保留 SQLite 基线；添加 PG 等价验证；禁止接入生产 | 现有同名脚本及 test:database | PG-02/04/05 验证入口 |
| backend/scripts/backup_bundle.py | 备份、恢复、调度与容器 | DDL/元数据/写/读 | main | sqlite3, .db, sqlite_master, sqlite, PRAGMA | PG-05 网站独立 pg_dump/恢复；冻结数据库与文件；Umami 不变更 | backup_bundle_test / test_ops / test_deployment_boundaries | PG-05 待迁移；SQLite 基线保留 |
| backend/scripts/candidate-data-check.cjs | 隔离测试/演练夹具 | DDL/元数据/写/读 | main / audit（见命中明细） | sqlite, sqlite3, db.all, db.run, sqlite_master, sqlite_, PRAGMA, .db, sqliteCode, SQLITE_READONLY | 保留 SQLite 基线；添加 PG 等价验证；禁止接入生产 | 现有同名脚本及 test:database | PG-02/04/05 验证入口 |
| backend/scripts/candidate-performance.cjs | 隔离测试/演练夹具 | 写/读 | main | .db | 保留 SQLite 基线；添加 PG 等价验证；禁止接入生产 | 现有同名脚本及 test:database | PG-02/04/05 验证入口 |
| backend/scripts/candidate-recovery-timing.cjs | 隔离测试/演练夹具 | 读 | main | .db, sqlite, SqliteStore | 保留 SQLite 基线；添加 PG 等价验证；禁止接入生产 | 现有同名脚本及 test:database | PG-02/04/05 验证入口 |
| backend/scripts/create_observed_fixture.py | 隔离测试/演练夹具 | DDL/元数据/写/读 | main | sqlite3, .db, db.exec | 保留 SQLite 基线；添加 PG 等价验证；禁止接入生产 | 现有同名脚本及 test:database | PG-02/04/05 验证入口 |
| backend/scripts/db_backup.sh | 备份、恢复、调度与容器 | DDL/元数据/读 | main / audit（见命中明细） | SQLITE3_BIN, PRAGMA, .db, sqlite_master | PG-05 网站独立 pg_dump/恢复；冻结数据库与文件；Umami 不变更 | backup_bundle_test / test_ops / test_deployment_boundaries | PG-05 待迁移；SQLite 基线保留 |
| backend/scripts/initialize-databases.cjs | 管理员/离线迁移/数据核验 CLI | 读 | main / audit（见命中明细） | sqlite, sqlite3 | 只读 SQLite 源副本；PG 专用目标、全量校验及序列校准 | PG-04 导入验证 + 当前脚本用例 | PG-04 待实现 |
| backend/scripts/inspect_data_test.py | 隔离测试/演练夹具 | DDL/元数据/写/读 | main / audit（见命中明细） | sqlite3, .db, db.exec, PRAGMA, SQL 参数/存储契约, sqlite_master | 保留 SQLite 基线；添加 PG 等价验证；禁止接入生产 | 现有同名脚本及 test:database | PG-02/04/05 验证入口 |
| backend/scripts/inspect_data.py | 管理员/离线迁移/数据核验 CLI | DDL/元数据/写/读 | main / audit（见命中明细） | SQLite, sqlite3, PRAGMA, db.exec, sqlite_master, sqlite_, pragma, sqlite_errorname, SQLITE_ERROR, sqliteVersion, sqlite_version, .db, sqliteCode | 只读 SQLite 源副本；PG 专用目标、全量校验及序列校准 | PG-04 导入验证 + 当前脚本用例 | PG-04 待实现 |
| backend/scripts/migration_baseline_test.py | 隔离测试/演练夹具 | DDL/元数据/写/读 | main | sqlite3, db.exec, pragma, PRAGMA, BEGIN IMMEDIATE, sqlite_master | 保留 SQLite 基线；添加 PG 等价验证；禁止接入生产 | 现有同名脚本及 test:database | PG-02/04/05 验证入口 |
| backend/scripts/read-only-server.cjs | 管理员/离线迁移/数据核验 CLI | DDL/元数据/读 | main | SQLite, sqlite, sqlite3, PRAGMA | 只读 SQLite 源副本；PG 专用目标、全量校验及序列校准 | PG-04 导入验证 + 当前脚本用例 | PG-04 待实现 |
| backend/scripts/runtime-smoke.cjs | 隔离测试/演练夹具 | 写/读 | main / audit（见命中明细） | .db, sqlite_version, lastID, sqlite, sqliteCli, sqlite3 | 保留 SQLite 基线；添加 PG 等价验证；禁止接入生产 | 现有同名脚本及 test:database | PG-02/04/05 验证入口 |
| backend/scripts/test-backup-restore.cjs | 隔离测试/演练夹具 | 写/读 | main | .db | 保留 SQLite 基线；添加 PG 等价验证；禁止接入生产 | 现有同名脚本及 test:database | PG-02/04/05 验证入口 |
| backend/scripts/test-backup-snapshot.cjs | 隔离测试/演练夹具 | DDL/元数据/写/读 | main / audit（见命中明细） | .db, sqlite3, PRAGMA, SQLITE3_BIN, sqlite | 保留 SQLite 基线；添加 PG 等价验证；禁止接入生产 | 现有同名脚本及 test:database | PG-02/04/05 验证入口 |
| backend/scripts/test-lifecycle-signals.cjs | 隔离测试/演练夹具 | DDL/元数据/读 | main | sqlite, sqlite3, .db, db.get, PRAGMA | 保留 SQLite 基线；添加 PG 等价验证；禁止接入生产 | 现有同名脚本及 test:database | PG-02/04/05 验证入口 |
| backend/scripts/test-publication-cross-device.cjs | 隔离测试/演练夹具 | 写/读 | main | .db, lastID | 保留 SQLite 基线；添加 PG 等价验证；禁止接入生产 | 现有同名脚本及 test:database | PG-02/04/05 验证入口 |
| backend/scripts/test-read-only-launcher.cjs | 隔离测试/演练夹具 | 写/读 | main | sqlite, SqliteStore, .db, sqliteCode, SQLITE_READONLY | 保留 SQLite 基线；添加 PG 等价验证；禁止接入生产 | 现有同名脚本及 test:database | PG-02/04/05 验证入口 |
| backend/scripts/test-security-bridge.cjs | 隔离测试/演练夹具 | 写/读 | main | sqlite, sqlite3, SqliteStore, .db | 保留 SQLite 基线；添加 PG 等价验证；禁止接入生产 | 现有同名脚本及 test:database | PG-02/04/05 验证入口 |
| backend/scripts/test-volume-fixture.cjs | 隔离测试/演练夹具 | 写/读 | main | sqlite, SqliteStore, .db | 保留 SQLite 基线；添加 PG 等价验证；禁止接入生产 | 现有同名脚本及 test:database | PG-02/04/05 验证入口 |
| backend/src/admin/bootstrap-cli.ts | HTTP health / 仓储 | 读 | main | sqlite, sqlite3, SqliteStore | PG-02 原生参数/RETURNING/ON CONFLICT；日期显式格式化；竞态用条件更新/行锁；保留 DTO | backend/tests/integration/health 相关测试 + contracts / real-bff | PG-02 待逐语句适配与业务回归 |
| backend/src/admin/bootstrap.ts | HTTP health / 仓储 | 写/读 | main | SqliteStore, sqlite | PG-02 原生参数/RETURNING/ON CONFLICT；日期显式格式化；竞态用条件更新/行锁；保留 DTO | backend/tests/integration/health 相关测试 + contracts / real-bff | PG-02 待逐语句适配与业务回归 |
| backend/src/admin/service.ts | HTTP health / 仓储 | 写/读 | main / audit（见命中明细） | SqliteStore, sqlite | PG-02 原生参数/RETURNING/ON CONFLICT；日期显式格式化；竞态用条件更新/行锁；保留 DTO | backend/tests/integration/health 相关测试 + contracts / real-bff | PG-02 待逐语句适配与业务回归 |
| backend/src/backup/scheduler.ts | 备份、恢复、调度与容器 | 写/读 | main | SqliteStore, sqlite, INSERT OR REPLACE | PG-05 网站独立 pg_dump/恢复；冻结数据库与文件；Umami 不变更 | backup_bundle_test / test_ops / test_deployment_boundaries | PG-05 待迁移；SQLite 基线保留 |
| backend/src/config/storage-layout.ts | 上传发布/引用/清理事务 | 读 | main / audit（见命中明细） | .db | PG-02 原生参数/RETURNING/ON CONFLICT；日期显式格式化；竞态用条件更新/行锁；保留 DTO | backend/tests/integration/asset-publication / asset-inventory 相关测试 + contracts / real-bff | PG-02 待逐语句适配与业务回归 |
| backend/src/database/config.ts | 仓储与数据库工厂 | 读 | main | sqlite | 原生 $n、RETURNING、显式冲突策略；兼容导出保留旧消费者 | tests/database + unit/database-config | PG-01 已验证 |
| backend/src/database/contracts.ts | 仓储与数据库工厂 | 读 | main | lastID, sqliteCode | 原生 $n、RETURNING、显式冲突策略；兼容导出保留旧消费者 | tests/database + unit/database-config | PG-01 已验证 |
| backend/src/database/factory.ts | 仓储与数据库工厂 | 读 | main | SqliteStore, sqlite, sqliteFilename | 原生 $n、RETURNING、显式冲突策略；兼容导出保留旧消费者 | tests/database + unit/database-config | PG-01 已验证 |
| backend/src/database/legacy-json-binding.ts | 仓储与数据库工厂 | 读 | main | sqlite, sqlite3 | 原生 $n、RETURNING、显式冲突策略；兼容导出保留旧消费者 | tests/database + unit/database-config | PG-02 待逐语句适配 |
| backend/src/database/postgres.ts | 仓储与数据库工厂 | 写/读 | main | lastID | 原生 $n、RETURNING、显式冲突策略；兼容导出保留旧消费者 | tests/database + unit/database-config | PG-01 已验证 |
| backend/src/database/sqlite.ts | 默认后端及旧库回退 | DDL/元数据/写/读 | main | sqlite, sqlite3, SqliteError, SQLITE_, SQLITE_CONSTRAINT, SQLITE_BUSY, SQLITE_LOCKED, SQLITE_INTERRUPT, SQLITE_CANTOPEN, SQLITE_IOERR, SQLITE_FULL, SQLITE_CORRUPT, SQLITE_NOTADB, SQLITE_READONLY, SQLite, db.exec, SqliteStoreOptions, SqliteStore, PRAGMA, db.get, db.all, db.run, lastID, BEGIN IMMEDIATE | 保留 SQLite 适配器；共享契约由 contracts.ts 导出 | tests/database/store-contract + integration/transactions | PG-01 已验证 |
| backend/src/diagnostics.ts | 脱敏诊断错误码白名单 | 写/读 | 不执行 SQL | SQLITE_BUSY, SQLITE_LOCKED, SQLITE_ERROR, SQLITE_CANTOPEN, SQLITE_CONSTRAINT, SQLITE_READONLY, SQLITE_FULL, SQLITE_CORRUPT, SQLITE_MISUSE | 保留 SQLite 错误码并新增 PG 通用错误分类 | unit/diagnostics.test.mjs + unit/database-config.test.mjs | PG-01 已适配 |
| backend/src/health.ts | HTTP health / 仓储 | 读 | main | sqlite | PG-02 原生参数/RETURNING/ON CONFLICT；日期显式格式化；竞态用条件更新/行锁；保留 DTO | backend/tests/integration/health 相关测试 + contracts / real-bff | PG-02 待逐语句适配与业务回归 |
| backend/src/integrations/bot/api.ts | Bot HTTP/通知任务/成员同步 | 写/读 | main / audit（见命中明细） | SqliteStore, sqlite | PG-02 原生参数/RETURNING/ON CONFLICT；日期显式格式化；竞态用条件更新/行锁；保留 DTO | backend/tests/integration/bot-platform / member-sync 相关测试 + contracts / real-bff | PG-02 待逐语句适配与业务回归 |
| backend/src/integrations/bot/identity.ts | Bot HTTP/通知任务/成员同步 | 写/读 | main / audit（见命中明细） | SqliteStore, sqlite | PG-02 原生参数/RETURNING/ON CONFLICT；日期显式格式化；竞态用条件更新/行锁；保留 DTO | backend/tests/integration/bot-platform / member-sync 相关测试 + contracts / real-bff | PG-02 待逐语句适配与业务回归 |
| backend/src/integrations/bot/member-sync-api.ts | Bot HTTP/通知任务/成员同步 | 写/读 | main | SqliteStore, sqlite | PG-02 原生参数/RETURNING/ON CONFLICT；日期显式格式化；竞态用条件更新/行锁；保留 DTO | backend/tests/integration/bot-platform / member-sync 相关测试 + contracts / real-bff | PG-02 待逐语句适配与业务回归 |
| backend/src/integrations/bot/member-sync.ts | Bot HTTP/通知任务/成员同步 | 写/读 | main / audit（见命中明细） | SqliteStore, sqlite, INSERT OR IGNORE, lastID | PG-02 原生参数/RETURNING/ON CONFLICT；日期显式格式化；竞态用条件更新/行锁；保留 DTO | backend/tests/integration/bot-platform / member-sync 相关测试 + contracts / real-bff | PG-02 待逐语句适配与业务回归 |
| backend/src/integrations/bot/on-this-day.ts | Bot HTTP/通知任务/成员同步 | 写/读 | main | sqlite, SQLite, db.all | PG-02 原生参数/RETURNING/ON CONFLICT；日期显式格式化；竞态用条件更新/行锁；保留 DTO | backend/tests/integration/bot-platform / member-sync 相关测试 + contracts / real-bff | PG-02 待逐语句适配与业务回归 |
| backend/src/integrations/bot/platform.ts | Bot HTTP/通知任务/成员同步 | 写/读 | main / audit（见命中明细） | SqliteStore, sqlite, INSERT OR IGNORE | PG-02 原生参数/RETURNING/ON CONFLICT；日期显式格式化；竞态用条件更新/行锁；保留 DTO | backend/tests/integration/bot-platform / member-sync 相关测试 + contracts / real-bff | PG-02 待逐语句适配与业务回归 |
| backend/src/integrations/bot/queries.ts | Bot HTTP/通知任务/成员同步 | 写/读 | main | sqlite, db.get, db.all | PG-02 原生参数/RETURNING/ON CONFLICT；日期显式格式化；竞态用条件更新/行锁；保留 DTO | backend/tests/integration/bot-platform / member-sync 相关测试 + contracts / real-bff | PG-02 待逐语句适配与业务回归 |
| backend/src/migrations/audit-001.sql | 显式迁移/旧库结构验证 | DDL/元数据/读 | main / audit（见命中明细） | AUTOINCREMENT, SQL 参数/存储契约 | SQLite 迁移不可改；独立 PG schema_version、DDL 与迁移角色 | integration/migrations / startup-version | PG-02 待独立 PG DDL |
| backend/src/migrations/audit-002-source.sql | 显式迁移/旧库结构验证 | DDL/元数据/读 | main / audit（见命中明细） | SQL 参数/存储契约 | SQLite 迁移不可改；独立 PG schema_version、DDL 与迁移角色 | integration/migrations / startup-version | PG-02 待独立 PG DDL |
| backend/src/migrations/cli.ts | 显式迁移/旧库结构验证 | DDL/元数据/读 | main / audit（见命中明细） | sqlite, sqlite3, .db, db.exec, PRAGMA | SQLite 迁移不可改；独立 PG schema_version、DDL 与迁移角色 | integration/migrations / startup-version | PG-02 待独立 PG DDL |
| backend/src/migrations/engine.ts | 显式迁移/旧库结构验证 | DDL/元数据/写/读 | main | db.all, db.exec, db.run, sqlite_master, sqlite_, pragma, PRAGMA, BEGIN IMMEDIATE, SQL 参数/存储契约 | SQLite 迁移不可改；独立 PG schema_version、DDL 与迁移角色 | integration/migrations / startup-version | PG-02 待独立 PG DDL |
| backend/src/migrations/main-001.sql | 显式迁移/旧库结构验证 | DDL/元数据/写/读 | main | SQL 参数/存储契约, AUTOINCREMENT | SQLite 迁移不可改；独立 PG schema_version、DDL 与迁移角色 | integration/migrations / startup-version | PG-02 待独立 PG DDL |
| backend/src/migrations/main-002-assets.sql | 显式迁移/旧库结构验证 | DDL/元数据/写/读 | main | SQL 参数/存储契约 | SQLite 迁移不可改；独立 PG schema_version、DDL 与迁移角色 | integration/migrations / startup-version | PG-02 待独立 PG DDL |
| backend/src/migrations/main-003-security.sql | 显式迁移/旧库结构验证 | DDL/元数据/读 | main | SQL 参数/存储契约 | SQLite 迁移不可改；独立 PG schema_version、DDL 与迁移角色 | integration/migrations / startup-version | PG-02 待独立 PG DDL |
| backend/src/migrations/main-004-bot.sql | 显式迁移/旧库结构验证 | DDL/元数据/写/读 | main | SQL 参数/存储契约 | SQLite 迁移不可改；独立 PG schema_version、DDL 与迁移角色 | integration/migrations / startup-version | PG-02 待独立 PG DDL |
| backend/src/migrations/main-005-member-sync.sql | 显式迁移/旧库结构验证 | DDL/元数据/写/读 | main | SQL 参数/存储契约 | SQLite 迁移不可改；独立 PG schema_version、DDL 与迁移角色 | integration/migrations / startup-version | PG-02 待独立 PG DDL |
| backend/src/migrations/main-006-bot-secret-vault.sql | 显式迁移/旧库结构验证 | DDL/元数据/读 | main | SQLite, SQL 参数/存储契约 | SQLite 迁移不可改；独立 PG schema_version、DDL 与迁移角色 | integration/migrations / startup-version | PG-02 待独立 PG DDL |
| backend/src/migrations/main-007-article-revisions.sql | 显式迁移/旧库结构验证 | DDL/元数据/写/读 | main | SQL 参数/存储契约, AUTOINCREMENT, strftime | SQLite 迁移不可改；独立 PG schema_version、DDL 与迁移角色 | integration/migrations / startup-version | PG-02 待独立 PG DDL |
| backend/src/migrations/main-008-event-submissions.sql | 显式迁移/旧库结构验证 | DDL/元数据/写/读 | main | SQL 参数/存储契约 | SQLite 迁移不可改；独立 PG schema_version、DDL 与迁移角色 | integration/migrations / startup-version | PG-02 待独立 PG DDL |
| backend/src/migrations/main-009-query-indexes.sql | 显式迁移/旧库结构验证 | DDL/元数据/写/读 | main | SQL 参数/存储契约 | SQLite 迁移不可改；独立 PG schema_version、DDL 与迁移角色 | integration/migrations / startup-version | PG-02 待独立 PG DDL |
| backend/src/migrations/main-010-asset-references.sql | 显式迁移/旧库结构验证 | DDL/元数据/读 | main | SQL 参数/存储契约, AUTOINCREMENT | SQLite 迁移不可改；独立 PG schema_version、DDL 与迁移角色 | integration/migrations / startup-version | PG-02 待独立 PG DDL |
| backend/src/models/db.js | lifecycle / addLog / 安全兼容桥 | DDL/元数据/写/读 | main / audit（见命中明细） | .db, db.run, sqlite, SQLite, sqlite3, SqliteStore, pragma, PRAGMA, logDb.run | 移除原生 sqlite3 回调连接；addLog 改异步 audit store；启动校验 PG 模式版本 | lifecycle / auth-security / security-bridge / startup-version | PG-02 待迁移；显式 PG 启动拒绝回退 |
| backend/src/models/legacy-schema.json | 显式迁移/旧库结构验证 | DDL/元数据/写/读 | main | AUTOINCREMENT, SQL 参数/存储契约 | SQLite 迁移不可改；独立 PG schema_version、DDL 与迁移角色 | integration/migrations / startup-version | PG-02 待独立 PG DDL |
| backend/src/models/security.js | lifecycle / addLog / 安全兼容桥 | 读 | main | .db | 移除原生 sqlite3 回调连接；addLog 改异步 audit store；启动校验 PG 模式版本 | lifecycle / auth-security / security-bridge / startup-version | PG-02 待迁移；显式 PG 启动拒绝回退 |
| backend/src/modules/activities/repository.ts | HTTP activities / 仓储 | 写/读 | main | sqlite, db.get, db.all, lastID, db.run | PG-02 原生参数/RETURNING/ON CONFLICT；日期显式格式化；竞态用条件更新/行锁；保留 DTO | backend/tests/integration/activities 相关测试 + contracts / real-bff | PG-02 待逐语句适配与业务回归 |
| backend/src/modules/activities/revisions.ts | HTTP activities / 仓储 | 写/读 | main / audit（见命中明细） | SqliteStore, sqlite, lastID | PG-02 原生参数/RETURNING/ON CONFLICT；日期显式格式化；竞态用条件更新/行锁；保留 DTO | backend/tests/integration/activities 相关测试 + contracts / real-bff | PG-02 待逐语句适配与业务回归 |
| backend/src/modules/activities/service.ts | HTTP activities / 仓储 | 写/读 | main | sqlite | PG-02 原生参数/RETURNING/ON CONFLICT；日期显式格式化；竞态用条件更新/行锁；保留 DTO | backend/tests/integration/activities 相关测试 + contracts / real-bff | PG-02 待逐语句适配与业务回归 |
| backend/src/modules/config/repository.ts | HTTP config / 仓储 | 写/读 | main | sqlite, db.all, INSERT OR REPLACE | PG-02 原生参数/RETURNING/ON CONFLICT；日期显式格式化；竞态用条件更新/行锁；保留 DTO | backend/tests/integration/config 相关测试 + contracts / real-bff | PG-02 待逐语句适配与业务回归 |
| backend/src/modules/events/repository.ts | HTTP events / 仓储 | 写/读 | main | SqliteStore, sqlite, sqlite3 | PG-02 原生参数/RETURNING/ON CONFLICT；日期显式格式化；竞态用条件更新/行锁；保留 DTO | backend/tests/integration/events 相关测试 + contracts / real-bff | PG-02 待逐语句适配与业务回归 |
| backend/src/modules/events/service.ts | HTTP events / 仓储 | 写/读 | main | sqlite, lastID | PG-02 原生参数/RETURNING/ON CONFLICT；日期显式格式化；竞态用条件更新/行锁；保留 DTO | backend/tests/integration/events 相关测试 + contracts / real-bff | PG-02 待逐语句适配与业务回归 |
| backend/src/modules/events/signup/repository.ts | HTTP events / 仓储 | 写/读 | main | SqliteStore, sqlite, db.get, db.run, db.all | PG-02 原生参数/RETURNING/ON CONFLICT；日期显式格式化；竞态用条件更新/行锁；保留 DTO | backend/tests/integration/events 相关测试 + contracts / real-bff | PG-02 待逐语句适配与业务回归 |
| backend/src/modules/events/signup/service.ts | HTTP events / 仓储 | 写/读 | main | sqlite | PG-02 原生参数/RETURNING/ON CONFLICT；日期显式格式化；竞态用条件更新/行锁；保留 DTO | backend/tests/integration/events 相关测试 + contracts / real-bff | PG-02 待逐语句适配与业务回归 |
| backend/src/modules/events/state/repository.ts | HTTP events / 仓储 | 写/读 | main | SqliteStore, sqlite, db.get, db.run | PG-02 原生参数/RETURNING/ON CONFLICT；日期显式格式化；竞态用条件更新/行锁；保留 DTO | backend/tests/integration/events 相关测试 + contracts / real-bff | PG-02 待逐语句适配与业务回归 |
| backend/src/modules/history/repository.ts | HTTP history / 仓储 | 写/读 | main | sqlite, db.all, lastID, db.get, db.run | PG-02 原生参数/RETURNING/ON CONFLICT；日期显式格式化；竞态用条件更新/行锁；保留 DTO | backend/tests/integration/history 相关测试 + contracts / real-bff | PG-02 待逐语句适配与业务回归 |
| backend/src/modules/logs/repository.ts | HTTP logs / 仓储 | 写/读 | main / audit（见命中明细） | sqlite, strftime | PG-02 原生参数/RETURNING/ON CONFLICT；日期显式格式化；竞态用条件更新/行锁；保留 DTO | backend/tests/integration/logs 相关测试 + contracts / real-bff | PG-02 待逐语句适配与业务回归 |
| backend/src/modules/members/projection.ts | HTTP members / 仓储 | 写/读 | main | sqlite | PG-02 原生参数/RETURNING/ON CONFLICT；日期显式格式化；竞态用条件更新/行锁；保留 DTO | backend/tests/integration/members 相关测试 + contracts / real-bff | PG-02 待逐语句适配与业务回归 |
| backend/src/modules/members/repository.ts | HTTP members / 仓储 | 写/读 | main | sqlite, db.all, lastID, db.get, db.run | PG-02 原生参数/RETURNING/ON CONFLICT；日期显式格式化；竞态用条件更新/行锁；保留 DTO | backend/tests/integration/members 相关测试 + contracts / real-bff | PG-02 待逐语句适配与业务回归 |
| backend/src/modules/recycle/service.ts | HTTP recycle / 仓储 | 写/读 | main | SqliteStore, sqlite | PG-02 原生参数/RETURNING/ON CONFLICT；日期显式格式化；竞态用条件更新/行锁；保留 DTO | backend/tests/integration/recycle 相关测试 + contracts / real-bff | PG-02 待逐语句适配与业务回归 |
| backend/src/modules/sitemap.ts | HTTP sitemap / 仓储 | DDL/元数据/写/读 | main | sqlite, Pragma | PG-02 原生参数/RETURNING/ON CONFLICT；日期显式格式化；竞态用条件更新/行锁；保留 DTO | backend/tests/integration/sitemap 相关测试 + contracts / real-bff | PG-02 待逐语句适配与业务回归 |
| backend/src/security/audit-outbox.ts | 鉴权/封禁/撤销/审计 outbox | 写/读 | main / audit（见命中明细） | SqliteStore, sqlite, INSERT OR IGNORE | PG-02 原生参数/RETURNING/ON CONFLICT；日期显式格式化；竞态用条件更新/行锁；保留 DTO | backend/tests/integration/auth-security / security-revocation 相关测试 + contracts / real-bff | PG-02 待逐语句适配与业务回归 |
| backend/src/security/auth-service.ts | 鉴权/封禁/撤销/审计 outbox | 写/读 | main / audit（见命中明细） | SqliteStore, sqlite | PG-02 原生参数/RETURNING/ON CONFLICT；日期显式格式化；竞态用条件更新/行锁；保留 DTO | backend/tests/integration/auth-security / security-revocation 相关测试 + contracts / real-bff | PG-02 待逐语句适配与业务回归 |
| backend/src/security/authorize.ts | 鉴权/封禁/撤销/审计 outbox | 写/读 | main | sqlite | PG-02 原生参数/RETURNING/ON CONFLICT；日期显式格式化；竞态用条件更新/行锁；保留 DTO | backend/tests/integration/auth-security / security-revocation 相关测试 + contracts / real-bff | PG-02 待逐语句适配与业务回归 |
| backend/src/security/bans.ts | 鉴权/封禁/撤销/审计 outbox | 写/读 | main / audit（见命中明细） | SqliteStore, sqlite, INSERT OR REPLACE | PG-02 原生参数/RETURNING/ON CONFLICT；日期显式格式化；竞态用条件更新/行锁；保留 DTO | backend/tests/integration/auth-security / security-revocation 相关测试 + contracts / real-bff | PG-02 待逐语句适配与业务回归 |
| backend/src/security/identity.ts | 鉴权/封禁/撤销/审计 outbox | 读 | main | SqliteStore, sqlite | PG-02 原生参数/RETURNING/ON CONFLICT；日期显式格式化；竞态用条件更新/行锁；保留 DTO | backend/tests/integration/auth-security / security-revocation 相关测试 + contracts / real-bff | PG-02 待逐语句适配与业务回归 |
| backend/src/security/service.ts | 鉴权/封禁/撤销/审计 outbox | 写/读 | main | sqlite | PG-02 原生参数/RETURNING/ON CONFLICT；日期显式格式化；竞态用条件更新/行锁；保留 DTO | backend/tests/integration/auth-security / security-revocation 相关测试 + contracts / real-bff | PG-02 待逐语句适配与业务回归 |
| backend/src/storage/cleanup-cli.ts | 上传发布/引用/清理事务 | 读 | main | sqlite, sqlite3, SqliteStore, db.all | PG-02 原生参数/RETURNING/ON CONFLICT；日期显式格式化；竞态用条件更新/行锁；保留 DTO | backend/tests/integration/asset-publication / asset-inventory 相关测试 + contracts / real-bff | PG-02 待逐语句适配与业务回归 |
| backend/src/storage/cleanup.ts | 上传发布/引用/清理事务 | 写/读 | main | SqliteStore, sqlite, SQLite | PG-02 原生参数/RETURNING/ON CONFLICT；日期显式格式化；竞态用条件更新/行锁；保留 DTO | backend/tests/integration/asset-publication / asset-inventory 相关测试 + contracts / real-bff | PG-02 待逐语句适配与业务回归 |
| backend/src/storage/publication.ts | 上传发布/引用/清理事务 | 写/读 | main | SqliteStore, sqlite, sqlite_master, INSERT OR IGNORE | PG-02 原生参数/RETURNING/ON CONFLICT；日期显式格式化；竞态用条件更新/行锁；保留 DTO | backend/tests/integration/asset-publication / asset-inventory 相关测试 + contracts / real-bff | PG-02 待逐语句适配与业务回归 |
| backend/src/storage/reference-inventory.ts | 上传发布/引用/清理事务 | 写/读 | main | sqlite, db.get, sqlite_master, db.all, INSERT OR IGNORE | PG-02 原生参数/RETURNING/ON CONFLICT；日期显式格式化；竞态用条件更新/行锁；保留 DTO | backend/tests/integration/asset-publication / asset-inventory 相关测试 + contracts / real-bff | PG-02 待逐语句适配与业务回归 |
| backend/src/storage/retention.ts | 备份、恢复、调度与容器 | 写/读 | main | SqliteStore, sqlite | PG-05 网站独立 pg_dump/恢复；冻结数据库与文件；Umami 不变更 | backup_bundle_test / test_ops / test_deployment_boundaries | PG-05 待迁移；SQLite 基线保留 |
| backend/src/storage/upload-controller.ts | 上传发布/引用/清理事务 | 写/读 | main | sqlite | PG-02 原生参数/RETURNING/ON CONFLICT；日期显式格式化；竞态用条件更新/行锁；保留 DTO | backend/tests/integration/asset-publication / asset-inventory 相关测试 + contracts / real-bff | PG-02 待逐语句适配与业务回归 |
| scripts/googlebot_simulator.py | 爬虫测试报告时间 | 写/读 | 无 | strftime | 保留 Python time.strftime；不是 SQLite 日期 SQL | scripts/googlebot_simulator_test.py | 已核对：无需迁移 |
| scripts/ops_backup.py | 备份、恢复、调度与容器 | 写/读 | main | sqlite3, .db, strftime | PG-05 网站独立 pg_dump/恢复；冻结数据库与文件；Umami 不变更 | backup_bundle_test / test_ops / test_deployment_boundaries | PG-05 待迁移；SQLite 基线保留 |
| scripts/postgres/inventory.mjs | 迁移盘点/隔离验证工具 | DDL/元数据/写/读 | 内存 SQLite / 独立测试 PG | sqlite, PRAGMA, sqlite_master, sqlite_schema, strftime, lastID, AUTOINCREMENT, BEGIN IMMEDIATE, SqliteStore, .db, SQLite, Pragma, sqlite3, db.exec, db.prepare, sqlite_, pragma | 保留内存模式盘点；只连接隔离测试库 | pnpm test:database | PG-00/01 验证工具 |
| scripts/postgres/test-adapters.mjs | 迁移盘点/隔离验证工具 | DDL/元数据/写/读 | 内存 SQLite / 独立测试 PG | SQL 参数/存储契约 | 保留内存模式盘点；只连接隔离测试库 | pnpm test:database | PG-00/01 验证工具 |
| web/server/utils/bff-admin-resources.ts | 登录会话、访客草稿与资源管理 | 写/读 | bff（独立加密记录） | lastID | PG-03 显式异步存储、AAD 密文、版本条件撤销；资源管理中的 .db 文件规则保留 | web/tests/durable-records / auth-session / guest-drafts / real-bff | PG-03 待迁移（本轮未切换 BFF） |
| web/server/utils/bff-auth-context.ts | HTTP 响应缓存头 | DDL/元数据/写/读 | 无 | Pragma | 保留 Pragma: no-cache；不是 SQL PRAGMA | web/tests/auth-api-integration.test.ts | 已核对：无需迁移 |
| web/server/utils/durable-records.ts | 登录会话、访客草稿与资源管理 | DDL/元数据/写/读 | bff（独立加密记录） | sqlite, db.exec, PRAGMA, db.prepare, INSERT OR REPLACE, BEGIN IMMEDIATE | PG-03 显式异步存储、AAD 密文、版本条件撤销；资源管理中的 .db 文件规则保留 | web/tests/durable-records / auth-session / guest-drafts / real-bff | PG-03 待迁移（本轮未切换 BFF） |

## 表级映射

下面列出每表来源、主键/序列、字段表示、外键和索引。完整列属性、默认值、CHECK 原文、索引顺序/唯一性/部分条件及源码行号见 [机器清单](PG-00-inventory.json)。SQLite 自身迁移账本不复制；PG-02 使用独立 schema_version。

### main.activities

来源：main-001.sql。主键：id。序列：BIGINT GENERATED BY DEFAULT AS IDENTITY；导入后 setval；拒绝超 JS 安全整数。

字段：id(INTEGER)；title(TEXT)；tag(TEXT)；date(TEXT)；description(TEXT)；content(TEXT)；cover_image(TEXT)；images(TEXT)；created_at(DATETIME,default=CURRENT_TIMESTAMP)；created_by(INTEGER)；updated_by(INTEGER)；status(TEXT,default='published')；deleted_at(DATETIME)；deleted_by(INTEGER)。

外键：无；保持原语义。

约束/索引：idx_activities_deleted_at(deleted_at)；idx_activities_date(date)；idx_activities_created_at(created_at)。CHECK 保持原表 SQL 中定义；导入任何不兼容数据均失败并输出脱敏诊断，不跳过行。

### main.activity_revisions

来源：main-007-article-revisions.sql。主键：id。序列：BIGINT GENERATED BY DEFAULT AS IDENTITY；导入后 setval；拒绝超 JS 安全整数。

字段：id(INTEGER)；activity_id(INTEGER,NOT NULL)；version(INTEGER,NOT NULL)；action(TEXT,NOT NULL)；actor_id(INTEGER)；actor_name(TEXT,NOT NULL)；created_at(INTEGER,NOT NULL)；restored_from(INTEGER)；title(TEXT)；tag(TEXT)；date(TEXT)；description(TEXT)；content(TEXT)；cover_image(TEXT)；images(TEXT)；source_status(TEXT)；changed_fields(TEXT,NOT NULL,default='[]')。

外键：activity_id→main.activities.id ON DELETE CASCADE。

约束/索引：sqlite_autoindex_activity_revisions_1[UNIQUE](activity_id,version)。CHECK 保持原表 SQL 中定义；导入任何不兼容数据均失败并输出脱敏诊断，不跳过行。

### main.asset_cleanup_jobs

来源：main-002-assets.sql。主键：id。序列：保留现有主键；不新增序列。

字段：id(TEXT,NOT NULL)；url(TEXT,NOT NULL)；identity(TEXT,NOT NULL)；state(TEXT,NOT NULL,default='pending')；attempts(INTEGER,NOT NULL,default=0)；last_error(TEXT)；created_at(TEXT,NOT NULL,default=CURRENT_TIMESTAMP)；updated_at(TEXT,NOT NULL,default=CURRENT_TIMESTAMP)。

外键：无；保持原语义。

约束/索引：idx_asset_cleanup_queue(state,updated_at,id)；sqlite_autoindex_asset_cleanup_jobs_1[UNIQUE](id)。CHECK 保持原表 SQL 中定义；导入任何不兼容数据均失败并输出脱敏诊断，不跳过行。

### main.asset_references

来源：main-010-asset-references.sql。主键：id。序列：BIGINT GENERATED BY DEFAULT AS IDENTITY；导入后 setval；拒绝超 JS 安全整数。

字段：id(INTEGER)；source_type(TEXT,NOT NULL)；source_id(TEXT,NOT NULL)；source_field(TEXT,NOT NULL)；source_version(INTEGER,NOT NULL,default=1)；asset_path(TEXT,NOT NULL)；family_key(TEXT,NOT NULL)；incomplete(INTEGER,NOT NULL,default=0)；created_at(TEXT,NOT NULL,default=datetime('now'))。

外键：无；保持原语义。

约束/索引：idx_asset_references_source(source_type,source_id,source_field)；idx_asset_references_family(family_key)；idx_asset_references_path(asset_path)；idx_asset_references_unique[UNIQUE](source_type,source_id,source_field,asset_path)。CHECK 保持原表 SQL 中定义；导入任何不兼容数据均失败并输出脱敏诊断，不跳过行。

### main.banned_ips

来源：main-001.sql。主键：ip。序列：保留现有主键；不新增序列。

字段：ip(TEXT)；reason(TEXT)；created_at(INTEGER)；expires_at(INTEGER)；created_by(TEXT)。

外键：无；保持原语义。

约束/索引：idx_banned_ips_expires(expires_at)；sqlite_autoindex_banned_ips_1[UNIQUE](ip)。CHECK 保持原表 SQL 中定义；导入任何不兼容数据均失败并输出脱敏诊断，不跳过行。

### main.bot_credential_secrets

来源：main-006-bot-secret-vault.sql。主键：credential_id。序列：保留现有主键；不新增序列。

字段：credential_id(TEXT,NOT NULL)；encrypted_token(TEXT,NOT NULL)。

外键：credential_id→main.bot_credentials.id ON DELETE NO ACTION。

约束/索引：sqlite_autoindex_bot_credential_secrets_1[UNIQUE](credential_id)。CHECK 保持原表 SQL 中定义；导入任何不兼容数据均失败并输出脱敏诊断，不跳过行。

### main.bot_credentials

来源：main-004-bot.sql。主键：id。序列：保留现有主键；不新增序列。

字段：id(TEXT,NOT NULL)；name(TEXT,NOT NULL)；secret_hash(TEXT,NOT NULL)；scopes(TEXT,NOT NULL)；groups_json(TEXT,NOT NULL)；created_by(INTEGER,NOT NULL)；created_at(INTEGER,NOT NULL)；revoked_at(INTEGER)。

外键：无；保持原语义。

约束/索引：sqlite_autoindex_bot_credentials_2[UNIQUE](secret_hash)；sqlite_autoindex_bot_credentials_1[UNIQUE](id)。CHECK 保持原表 SQL 中定义；导入任何不兼容数据均失败并输出脱敏诊断，不跳过行。

### main.bot_deliveries

来源：main-004-bot.sql, main-005-member-sync.sql。主键：id。序列：保留现有主键；不新增序列。

字段：id(TEXT,NOT NULL)；notification_id(TEXT,NOT NULL)；credential_id(TEXT)；subscription_id(TEXT)；group_id(TEXT,NOT NULL,default='')；status(TEXT,NOT NULL,default='pending')；attempts(INTEGER,NOT NULL,default=0)；next_attempt_at(INTEGER,NOT NULL)；lease_until(INTEGER,NOT NULL,default=0)；lease_token(TEXT)；last_error(TEXT)；delivered_at(INTEGER)；target_type(TEXT,NOT NULL,default='group')；target_id(TEXT)；recipient_user_id(INTEGER)；message_status(TEXT)；receipt_error(TEXT)。

外键：credential_id→main.bot_credentials.id ON DELETE NO ACTION；notification_id→main.bot_notifications.id ON DELETE NO ACTION。

约束/索引：idx_bot_delivery_due(status,next_attempt_at,lease_until)；sqlite_autoindex_bot_deliveries_2[UNIQUE](notification_id,credential_id,group_id)；sqlite_autoindex_bot_deliveries_1[UNIQUE](id)。CHECK 保持原表 SQL 中定义；导入任何不兼容数据均失败并输出脱敏诊断，不跳过行。

### main.bot_identities

来源：main-004-bot.sql。主键：id。序列：保留现有主键；不新增序列。

字段：id(TEXT,NOT NULL)；owner_hash(TEXT)；user_id(INTEGER)；credential_id(TEXT)；qq(TEXT)；created_at(INTEGER,NOT NULL)。

外键：credential_id→main.bot_credentials.id ON DELETE NO ACTION；user_id→main.users.id ON DELETE SET NULL。

约束/索引：sqlite_autoindex_bot_identities_4[UNIQUE](credential_id,qq)；sqlite_autoindex_bot_identities_3[UNIQUE](user_id)；sqlite_autoindex_bot_identities_2[UNIQUE](owner_hash)；sqlite_autoindex_bot_identities_1[UNIQUE](id)。CHECK 保持原表 SQL 中定义；导入任何不兼容数据均失败并输出脱敏诊断，不跳过行。

### main.bot_link_codes

来源：main-004-bot.sql。主键：code_hash。序列：保留现有主键；不新增序列。

字段：code_hash(TEXT,NOT NULL)；identity_id(TEXT,NOT NULL)；expires_at(INTEGER,NOT NULL)。

外键：identity_id→main.bot_identities.id ON DELETE NO ACTION。

约束/索引：idx_bot_link_expiry(expires_at)；sqlite_autoindex_bot_link_codes_1[UNIQUE](code_hash)。CHECK 保持原表 SQL 中定义；导入任何不兼容数据均失败并输出脱敏诊断，不跳过行。

### main.bot_notifications

来源：main-004-bot.sql。主键：id。序列：保留现有主键；不新增序列。

字段：id(TEXT,NOT NULL)；dedupe_key(TEXT,NOT NULL)；event_name(TEXT,NOT NULL)；payload(TEXT,NOT NULL)；created_at(INTEGER,NOT NULL)。

外键：无；保持原语义。

约束/索引：sqlite_autoindex_bot_notifications_2[UNIQUE](dedupe_key)；sqlite_autoindex_bot_notifications_1[UNIQUE](id)。CHECK 保持原表 SQL 中定义；导入任何不兼容数据均失败并输出脱敏诊断，不跳过行。

### main.bot_subscriptions

来源：main-004-bot.sql。主键：id。序列：保留现有主键；不新增序列。

字段：id(TEXT,NOT NULL)；credential_id(TEXT,NOT NULL)；group_id(TEXT,NOT NULL)；event_name(TEXT,NOT NULL)；event_id(INTEGER,NOT NULL,default=0)；lead_minutes(INTEGER,NOT NULL,default=60)。

外键：credential_id→main.bot_credentials.id ON DELETE NO ACTION。

约束/索引：sqlite_autoindex_bot_subscriptions_2[UNIQUE](credential_id,group_id,event_name,event_id)；sqlite_autoindex_bot_subscriptions_1[UNIQUE](id)。CHECK 保持原表 SQL 中定义；导入任何不兼容数据均失败并输出脱敏诊断，不跳过行。

### main.event_participants

来源：main-001.sql, main-004-bot.sql。主键：id。序列：BIGINT GENERATED BY DEFAULT AS IDENTITY；导入后 setval；拒绝超 JS 安全整数。

字段：id(INTEGER)；event_id(INTEGER,NOT NULL)；user_id(INTEGER)；visitor_ip(TEXT)；common_id(TEXT)；machine_sign(TEXT)；pilot_source(TEXT)；qq(TEXT)；avatar(TEXT)；created_at(DATETIME,default=CURRENT_TIMESTAMP)；updated_at(DATETIME,default=CURRENT_TIMESTAMP)；bot_identity_id(TEXT)。

外键：event_id→main.events.id ON DELETE CASCADE。

约束/索引：idx_participant_bot_identity[UNIQUE](event_id,bot_identity_id)；idx_event_participants_user(user_id)；idx_event_participants_ip(visitor_ip)；idx_event_participants_event(event_id)；sqlite_autoindex_event_participants_2[UNIQUE](event_id,visitor_ip)；sqlite_autoindex_event_participants_1[UNIQUE](event_id,user_id)。CHECK 保持原表 SQL 中定义；导入任何不兼容数据均失败并输出脱敏诊断，不跳过行。

### main.event_submissions

来源：main-008-event-submissions.sql。主键：event_id。序列：保留现有主键；不新增序列。

字段：event_id(INTEGER)；capability_key(TEXT,NOT NULL)；digest(TEXT,NOT NULL)；response(TEXT,NOT NULL,default='{}')；created_at(INTEGER,NOT NULL)。

外键：event_id→main.events.id ON DELETE CASCADE。

约束/索引：idx_event_submissions_capability(capability_key)。CHECK 保持原表 SQL 中定义；导入任何不兼容数据均失败并输出脱敏诊断，不跳过行。

### main.events

来源：main-001.sql, main-009-query-indexes.sql。主键：id。序列：BIGINT GENERATED BY DEFAULT AS IDENTITY；导入后 setval；拒绝超 JS 安全整数。

字段：id(INTEGER)；type(TEXT,NOT NULL,default='general')；title(TEXT)；content(TEXT,default='{}')；status(TEXT,default='draft')；created_by(INTEGER)；visitor_ip(TEXT)；created_at(DATETIME,default=CURRENT_TIMESTAMP)；updated_at(DATETIME,default=CURRENT_TIMESTAMP)。

外键：无；保持原语义。

约束/索引：idx_events_type_status_created(type,status,created_at DESC)；idx_events_status_created(status,created_at DESC)。CHECK 保持原表 SQL 中定义；导入任何不兼容数据均失败并输出脱敏诊断，不跳过行。

### main.history

来源：main-001.sql。主键：id。序列：BIGINT GENERATED BY DEFAULT AS IDENTITY；导入后 setval；拒绝超 JS 安全整数。

字段：id(INTEGER)；date(TEXT)；title(TEXT)；description(TEXT)；image(TEXT)；sort_order(INTEGER,default=0)；deleted_at(DATETIME)；deleted_by(INTEGER)。

外键：无；保持原语义。

约束/索引：idx_history_sort(sort_order)；idx_history_deleted_at(deleted_at)；idx_history_date(date)。CHECK 保持原表 SQL 中定义；导入任何不兼容数据均失败并输出脱敏诊断，不跳过行。

### main.login_attempts

来源：main-001.sql。主键：ip。序列：保留现有主键；不新增序列。

字段：ip(TEXT)；count(INTEGER,NOT NULL,default=0)；lock_until(INTEGER,NOT NULL,default=0)；updated_at(INTEGER,NOT NULL,default=0)。

外键：无；保持原语义。

约束/索引：sqlite_autoindex_login_attempts_1[UNIQUE](ip)。CHECK 保持原表 SQL 中定义；导入任何不兼容数据均失败并输出脱敏诊断，不跳过行。

### main.member_group_memberships

来源：main-005-member-sync.sql。主键：qq, group_id。序列：保留现有主键；不新增序列。

字段：qq(TEXT,NOT NULL)；group_id(TEXT,NOT NULL)；group_card(TEXT,NOT NULL)；nickname(TEXT,NOT NULL)；group_role(TEXT,NOT NULL)；active(INTEGER,NOT NULL,default=1)；misses(INTEGER,NOT NULL,default=0)；last_seen_generation(INTEGER,NOT NULL)；avatar_checksum(TEXT)。

外键：group_id→main.member_sync_groups.group_id ON DELETE NO ACTION。

约束/索引：sqlite_autoindex_member_group_memberships_1[UNIQUE](qq,group_id)。CHECK 保持原表 SQL 中定义；导入任何不兼容数据均失败并输出脱敏诊断，不跳过行。

### main.member_profile_tasks

来源：main-005-member-sync.sql。主键：member_id。序列：保留现有主键；不新增序列。

字段：member_id(INTEGER)；created_at(INTEGER,NOT NULL)；completed_at(INTEGER)；notified_at(INTEGER)；notification_id(TEXT)。

外键：notification_id→main.bot_notifications.id ON DELETE NO ACTION；member_id→main.members.id ON DELETE CASCADE。

约束/索引：见主键。CHECK 保持原表 SQL 中定义；导入任何不兼容数据均失败并输出脱敏诊断，不跳过行。

### main.member_sync_avatars

来源：main-005-member-sync.sql。主键：id。序列：保留现有主键；不新增序列。

字段：id(TEXT,NOT NULL)；request_id(TEXT,NOT NULL)；qq(TEXT,NOT NULL)；url(TEXT,NOT NULL)；checksum(TEXT,NOT NULL)；status(TEXT,NOT NULL,default='pending')。

外键：request_id→main.member_sync_requests.id ON DELETE NO ACTION。

约束/索引：sqlite_autoindex_member_sync_avatars_2[UNIQUE](request_id,qq)；sqlite_autoindex_member_sync_avatars_1[UNIQUE](id)。CHECK 保持原表 SQL 中定义；导入任何不兼容数据均失败并输出脱敏诊断，不跳过行。

### main.member_sync_batches

来源：main-005-member-sync.sql。主键：request_id, batch_no。序列：保留现有主键；不新增序列。

字段：request_id(TEXT,NOT NULL)；batch_no(INTEGER,NOT NULL)；checksum(TEXT,NOT NULL)；members_json(TEXT,NOT NULL)；member_count(INTEGER,NOT NULL)。

外键：request_id→main.member_sync_requests.id ON DELETE NO ACTION。

约束/索引：sqlite_autoindex_member_sync_batches_1[UNIQUE](request_id,batch_no)。CHECK 保持原表 SQL 中定义；导入任何不兼容数据均失败并输出脱敏诊断，不跳过行。

### main.member_sync_groups

来源：main-005-member-sync.sql。主键：group_id。序列：保留现有主键；不新增序列。

字段：group_id(TEXT,NOT NULL)；generation(INTEGER,NOT NULL,default=0)；last_applied_generation(INTEGER,NOT NULL,default=0)；initialized(INTEGER,NOT NULL,default=0)；next_due_at(INTEGER,NOT NULL,default=0)；last_count(INTEGER,NOT NULL,default=0)。

外键：无；保持原语义。

约束/索引：sqlite_autoindex_member_sync_groups_1[UNIQUE](group_id)。CHECK 保持原表 SQL 中定义；导入任何不兼容数据均失败并输出脱敏诊断，不跳过行。

### main.member_sync_meta

来源：main-005-member-sync.sql。主键：id。序列：保留现有主键；不新增序列。

字段：id(INTEGER)；revision(INTEGER,NOT NULL,default=0)。

外键：无；保持原语义。

约束/索引：见主键。CHECK 保持原表 SQL 中定义；导入任何不兼容数据均失败并输出脱敏诊断，不跳过行。

### main.member_sync_requests

来源：main-005-member-sync.sql。主键：id。序列：保留现有主键；不新增序列。

字段：id(TEXT,NOT NULL)；group_id(TEXT,NOT NULL)；credential_id(TEXT,NOT NULL)；config_revision(INTEGER,NOT NULL)；generation(INTEGER,NOT NULL)；status(TEXT,NOT NULL)；created_at(INTEGER,NOT NULL)；expires_at(INTEGER,NOT NULL)；batch_count(INTEGER)；member_count(INTEGER)；summary(TEXT)；error_code(TEXT)。

外键：credential_id→main.bot_credentials.id ON DELETE NO ACTION；group_id→main.member_sync_groups.group_id ON DELETE NO ACTION。

约束/索引：idx_member_sync_active[UNIQUE][PARTIAL](group_id)；sqlite_autoindex_member_sync_requests_2[UNIQUE](group_id,generation)；sqlite_autoindex_member_sync_requests_1[UNIQUE](id)。CHECK 保持原表 SQL 中定义；导入任何不兼容数据均失败并输出脱敏诊断，不跳过行。

### main.member_sync_settings

来源：main-005-member-sync.sql。主键：id。序列：保留现有主键；不新增序列。

字段：id(INTEGER)；revision(INTEGER,NOT NULL)；value(TEXT,NOT NULL)。

外键：无；保持原语义。

约束/索引：见主键。CHECK 保持原表 SQL 中定义；导入任何不兼容数据均失败并输出脱敏诊断，不跳过行。

### main.members

来源：main-001.sql, main-005-member-sync.sql, main-009-query-indexes.sql。主键：id。序列：BIGINT GENERATED BY DEFAULT AS IDENTITY；导入后 setval；拒绝超 JS 安全整数。

字段：id(INTEGER)；name(TEXT)；role(TEXT)；avatar(TEXT)；school(TEXT)；tags(TEXT)；sort_order(INTEGER,default=0)；deleted_at(DATETIME)；deleted_by(INTEGER)；qq(TEXT)；profile_status(TEXT,NOT NULL,default='complete')；sync_managed(INTEGER,NOT NULL,default=0)；sync_hidden(INTEGER,NOT NULL,default=0)；sync_protected(INTEGER,NOT NULL,default=0)；follow_group_name(INTEGER,NOT NULL,default=0)；follow_group_avatar(INTEGER,NOT NULL,default=0)。

外键：无；保持原语义。

约束/索引：idx_members_active_sort(deleted_at,sort_order,id)；idx_members_qq[UNIQUE][PARTIAL](qq)；idx_members_name(name)；idx_members_deleted_at(deleted_at)。CHECK 保持原表 SQL 中定义；导入任何不兼容数据均失败并输出脱敏诊断，不跳过行。

### main.security_audit_outbox

来源：main-003-security.sql。主键：id。序列：保留现有主键；不新增序列。

字段：id(TEXT,NOT NULL)；username(TEXT,NOT NULL)；action(TEXT,NOT NULL)；details(TEXT,NOT NULL)；created_at(TEXT,NOT NULL,default=CURRENT_TIMESTAMP)；delivered_at(TEXT)；attempts(INTEGER,NOT NULL,default=0)；last_error(TEXT)。

外键：无；保持原语义。

约束/索引：idx_security_audit_pending(delivered_at,attempts,created_at,id)；sqlite_autoindex_security_audit_outbox_1[UNIQUE](id)。CHECK 保持原表 SQL 中定义；导入任何不兼容数据均失败并输出脱敏诊断，不跳过行。

### main.site_config

来源：main-001.sql。主键：key。序列：保留现有主键；不新增序列。

字段：key(TEXT)；value(TEXT)。

外键：无；保持原语义。

约束/索引：sqlite_autoindex_site_config_1[UNIQUE](key)。CHECK 保持原表 SQL 中定义；导入任何不兼容数据均失败并输出脱敏诊断，不跳过行。

### main.users

来源：main-001.sql, main-003-security.sql。主键：id。序列：BIGINT GENERATED BY DEFAULT AS IDENTITY；导入后 setval；拒绝超 JS 安全整数。

字段：id(INTEGER)；username(TEXT)；password(TEXT)；role(TEXT,default='admin')；avatar(TEXT)；twofa_secret(TEXT)；twofa_enabled(INTEGER,default=0)；auth_version(INTEGER,NOT NULL,default=0)。

外键：无；保持原语义。

约束/索引：sqlite_autoindex_users_1[UNIQUE](username)。CHECK 保持原表 SQL 中定义；导入任何不兼容数据均失败并输出脱敏诊断，不跳过行。

### audit.audit_logs

来源：audit-001.sql, audit-002-source.sql。主键：id。序列：BIGINT GENERATED BY DEFAULT AS IDENTITY；导入后 setval；拒绝超 JS 安全整数。

字段：id(INTEGER)；username(TEXT)；action(TEXT)；details(TEXT)；created_at(DATETIME,default=CURRENT_TIMESTAMP)；source_id(TEXT)。

外键：无；保持原语义。

约束/索引：idx_audit_source_id[UNIQUE](source_id)；idx_logs_username(username)；idx_logs_created_at(created_at)。CHECK 保持原表 SQL 中定义；导入任何不兼容数据均失败并输出脱敏诊断，不跳过行。

## 必须继续迁移的直连与边界

- models/db.js 同时打开 main/audit 原生 sqlite3、运行 PRAGMA、执行模式检查及回调 addLog；models/security.js 尚有 context.db 兼容后备。须在 PG-02 去除，不能仅替换 sql.main。
- web/server/utils/durable-records.ts 使用 node:sqlite DatabaseSync、同步 Map 和 AES-GCM；全部会话/草稿调用者需在 PG-03 改为 Promise 与数据库条件撤销。
- migrations/engine.ts、迁移/初始化/管理员/只读启动 CLI、Python inspect_data.py、备份脚本直接打开 SQLite；保留为源导出/旧库验证路径，新增 PG 入口。
- asset_references 仅报名头像同步完整；PG-02 迁移时必须保留当前权威扫描回退，索引未命中不得授权删除。
- PG-04 冻结副本导入、PG-05 网站独立备份恢复、PG-06 两次演练、PG-07 生产切换尚未执行。无反向迁移时，PG 放写后不能无损切回旧 SQLite。

参考：[pg Node 24 兼容性](https://node-postgres.com/)、[事务独占 client](https://node-postgres.com/features/transactions)、[PostgreSQL SQLSTATE](https://www.postgresql.org/docs/18/errcodes-appendix.html)。
