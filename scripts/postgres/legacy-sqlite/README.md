# SQLite 历史源验证归档

来源：纯 PostgreSQL 重构前的 `af9a9df` 提交，原 `backend/src/migrations`。SQL 与 manifest 内容原样保留，SHA-256 由现有 manifest 校验。

本目录只供 `export-sqlite.mjs` 核验历史恢复副本，以及隔离迁移回归创建合成历史源。生产 backend 不导入本目录；backend 镜像也不复制此目录。`engine.ts` 使用 Node 24 原生类型擦除执行，不再依赖已经删除的 `backend/dist/src/migrations/engine.js`。

`initialize.cjs` 只在调用者明确提供的临时路径创建测试历史库。它不是服务器初始化入口。生产应用、生命周期测试和事务契约均连接原生 PostgreSQL。

退休的 SQLite WAL/本地数据库启动测试由 `tests/postgres/lifecycle.test.mjs`、`tests/postgres/migration.test.mjs`、`tests/database` 的真实 PG 契约及 release 冷恢复测试替代。历史校验和另由 `backend/scripts/migration_baseline_test.py` 检查。
