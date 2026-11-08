# 脚本职责与备份入口

当前应用仅使用 PostgreSQL。准确的运行和恢复步骤见 [PostgreSQL 手册](../docs/ops/POSTGRESQL-EXECUTION-GUIDE.md)，测试与打包冷恢复见 [POSTGRESQL-TESTING](../docs/ops/POSTGRESQL-TESTING.md)。本文不会自动执行定时任务或部署。

| 位置 | 用途 | 当前边界 |
| --- | --- | --- |
| `backend/scripts/postgres/cli.mjs` | 原生 PG create / verify / restore | 私有目录包 `pg_<TAG>`，含 dump、receipt 和真实资源；目标空库恢复 |
| `scripts/ops_backup.py` | 宿主调度、加密与异地接收 | 默认 PG；应用/宿主二选一 owner，账号由私有配置提供 |
| `scripts/postgres/test-adapters.mjs` | 真实 PG store、业务和恢复回归 | 临时 loopback Docker 和每用例数据库，按标签清理 |
| `scripts/postgres/legacy-sqlite/` | 历史 SQLite SQL/manifest/校验引擎 | 仅离线冻结源核验和测试，不是应用驱动，也不进入生产镜像 |
| `scripts/postgres/migrate.mjs` | 历史冻结源导入全新 PG 目标 | 已知备份摘要、完整模式检查、30 表摘要与序列校验 |
| `scripts/revamp/`、`web/scripts/` | 边界、预算、UI 及前端交付检查 | 合成上游夹具不代替真实 PG 集成 |

根目录和 backend 下的旧 `db_backup.sh` / `uploads_backup.sh` / `backup_all.sh`、SQLite `read-only-server.cjs` 只对应历史布局，不能当作当前 PG 应用的恢复或应急入口。历史格式细节保留在 [旧归档约定](../docs/backend-modernization/BACKUP-RUNBOOK.md)，执行前必须确认版本和数据格式。

## 依赖安全验收

在根目录执行 `pnpm check:security`。它先验证 `patches/` 中补丁的 SHA-256、
实际安装的对应源码和漏洞行为，再调用锁定的 pnpm 在线审计整个工作区（含后端与开发依赖）。
`pnpm check:patches` 只执行补丁完整性与行为校验，不联网查询公告。

braces、deepmerge 与需要保留旧 API 的 minimatch 使用 `pnpm-workspace.yaml` 的 `patchedDependencies`；
校验策略在 `scripts/revamp/security-patches.json`。仅允许确切 GHSA、包名、版本和
受影响范围匹配且验证通过的本地修复。新增告警、未知版本、漏打补丁、源码被改、
网络失败或异常审计结果均会使命令失败，没有全局忽略列表。

原始审计仍按上游版本报告告警；命令将它们明确列为 `mitigated`，不改写原始数量。
完整机器报告保存在 `.tools/dependency-security.json`，CI 保留 14 天。
在线审计独立运行，并阻断依赖更新与发布；普通质量检查仍会收集完整结果。
指标、触发范围和分支保护设置见 [CI 设计](../docs/CI.md)。
更换或删除补丁时必须重新审查策略并运行 `pnpm test:tooling` 和 `pnpm check:security`。
当前修复与兼容性边界见 [2026-11 依赖安全说明](../docs/security/dependencies-2026-11.md)；
旧版本的补丁记录保留在 [历史依赖安全报告](../docs/revamp/logs/28-dependency-security/README.md)。
