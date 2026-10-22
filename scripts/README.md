# 脚本职责与备份入口

备份/隔离恢复的当前操作说明见 [BACKUP-RUNBOOK](../docs/backend-modernization/BACKUP-RUNBOOK.md)。本文不会自动执行定时任务或部署。

| 位置 | 用途 | 数据源 | 备份输出 |
| --- | --- | --- | --- |
| 根目录 `scripts/db_backup.sh` | 仓库布局下的数据库备份 | `<仓库>/backend/data` | `<仓库>/backups/db` |
| 根目录 `scripts/uploads_backup.sh` | 仓库布局下的上传备份 | `<仓库>/backend/data/public` | `<仓库>/backups/uploads` |
| 根目录 `scripts/backup_all.sh` | 调用上述两项并打包 | 同上 | `<仓库>/backups/full` |
| `backend/scripts/*.sh` | 独立 backend 布局及其容器中的备份 | `<backend 根>/data`、`data/public` | `<backend 根>/backups/{db,uploads,full}` |
| 根目录 `scripts/restore.sh` | 验包后恢复到新目录 | 完整包、可信hash，历史包显式选择 | 必填 `--target`，不覆盖原data |
| `scripts/revamp/` | 新版代码边界、预算、SEO、产物与容器验证 | 构建产物/源码/内存测试 | 命令指定的验收输出 |
| `web/scripts/` | 新版应用专属 E2E 与性能测试 | 隔离测试应用 | Playwright/性能报告 |

根目录备份入口现在显式指定仓库路径后调用backend实现：它们根据脚本所在位置确定根目录，
根目录脚本包含 `backend/data` 这一层，backend 内的脚本没有。
`backend/Dockerfile` 的构建上下文与源码布局决定容器内可用哪一组。

当前 `backend/src/utils/backup.js` 从自身目录向上查找同时包含三项备份脚本
的目录，使用**首先找到的那一组**作为自动备份入口；由于 `backend/scripts/`
存在，通常先命中 backend 层。根目录的 `cron.example` 指向仓库层脚本。
因此手动 cron 和应用自动备份可能写往不同的 backups 根目录，排查时必须
确认实际调用路径与挂载目录，不能仅凭文件名判断。

BM-10已统一备份实现并移除cp降级/单库伪成功，恢复只写新目标；实际调度、
下载/删除与保留策略仍由BM-30收口。没有安装新的cron或对真实业务数据运行恢复。

## 依赖安全验收

在根目录执行 `pnpm check:security`。它先验证 `patches/` 中补丁的 SHA-256、
实际安装的对应源码和漏洞行为，再调用锁定的 pnpm 在线审计整个前端工作区（含开发依赖）。
`backend/` 使用独立 npm 生命周期，不纳入此命令。

两项尚无已发布修复版本的依赖使用 `pnpm-workspace.yaml` 的 `patchedDependencies`；
校验策略在 `scripts/revamp/security-patches.json`。仅允许确切 GHSA、包名、版本和
受影响范围匹配且验证通过的本地修复。新增告警、未知版本、漏打补丁、源码被改、
网络失败或异常审计结果均会使命令失败，没有全局忽略列表。

原始审计仍按上游版本报告告警；命令将它们明确列为 `mitigated`，不改写原始数量。
完整机器报告保存在 `.tools/dependency-security.json`，CI 保留 7 天。
更换或删除补丁时必须重新审查策略并运行 `pnpm test:tooling` 和 `pnpm check:security`。
修复范围、兼容性边界与复验证据见 [依赖安全报告](../docs/revamp/logs/28-dependency-security/README.md)。
