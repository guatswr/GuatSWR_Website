# PostgreSQL 初始化与历史源迁移

当前应用只支持 PostgreSQL 18.6；本地开发也需显式配置 POSTGRES_URL。数据库、schema 和管理员均不由正常启动自动创建。

先由管理账号创建空目标数据库和非特权应用 LOGIN 角色。私有 POSTGRES_MIGRATION_URL 指向同一目标库后，运行：

```sh
node --env-file="$PG_MIGRATION_ENV_FILE" backend/dist/src/migrations/postgres/cli.js initialize guatswr_migration_dev guatswr_app
node --env-file=backend/.env backend/dist/src/migrations/postgres/cli.js check
node --env-file=backend/.env backend/dist/src/admin/bootstrap-cli.js --postgres-url-env POSTGRES_URL
```

bootstrap 需要私有 SUPER_ADMIN_USERNAME / SUPER_ADMIN_PASSWORD。应用不能使用 DDL 管理账号。已存在的数据不应通过 initialize 修补结构；结构漂移必须显式审查并修复。

历史 SQLite 源的 SQL、manifest 与校验引擎归档在 scripts/postgres/legacy-sqlite，保持原校验和。离线工具使用 Node 24 原生类型擦除读取 engine.ts，不依赖已删除的 dist 旧文件。它们不会恢复 SQLite 应用驱动。

完整备份先用已知 SHA-256 验证并恢复为冻结副本，再通过 prepare:postgres-source / migrate:postgres 导入另一个空 PG 库；具体参数见 [执行手册](../ops/POSTGRESQL-EXECUTION-GUIDE.md)。

实际测试、生产镜像冷恢复及剩余环境验收见 [PostgreSQL 测试与恢复](../ops/POSTGRESQL-TESTING.md)。历史 SQLite adopt/upgrade 的旧版本操作记录移至 [历史文档](MIGRATIONS-SQLITE-HISTORY.md)，不得复制到当前生产执行。
