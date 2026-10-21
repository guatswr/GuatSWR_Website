# 脚本职责与备份入口

本文只说明用途；不执行备份、恢复、定时任务或部署。

| 位置 | 用途 | 数据源 | 备份输出 |
| --- | --- | --- | --- |
| 根目录 `scripts/db_backup.sh` | 仓库布局下的数据库备份 | `<仓库>/backend/data` | `<仓库>/backups/db` |
| 根目录 `scripts/uploads_backup.sh` | 仓库布局下的上传备份 | `<仓库>/backend/data/public` | `<仓库>/backups/uploads` |
| 根目录 `scripts/backup_all.sh` | 调用上述两项并打包 | 同上 | `<仓库>/backups/full` |
| `backend/scripts/*.sh` | 独立 backend 布局及其容器中的备份 | `<backend 根>/data`、`data/public` | `<backend 根>/backups/{db,uploads,full}` |
| 根目录 `scripts/restore.sh` | 仓库布局下的恢复工具 | 指定的备份文件 | 具体覆盖目标以脚本和现有运维流程为准 |
| `scripts/revamp/` | 新版代码边界、预算、SEO、产物与容器验证 | 构建产物/源码/内存测试 | 命令指定的验收输出 |
| `web/scripts/` | 新版应用专属 E2E 与性能测试 | 隔离测试应用 | Playwright/性能报告 |

两组备份脚本不是可直接互换的副本：它们根据脚本所在位置确定根目录，
根目录脚本包含 `backend/data` 这一层，backend 内的脚本没有。
`backend/Dockerfile` 的构建上下文与源码布局决定容器内可用哪一组。

当前 `backend/src/utils/backup.js` 从自身目录向上查找同时包含三项备份脚本
的目录，使用**首先找到的那一组**作为自动备份入口；由于 `backend/scripts/`
存在，通常先命中 backend 层。根目录的 `cron.example` 指向仓库层脚本。
因此手动 cron 和应用自动备份可能写往不同的 backups 根目录，排查时必须
确认实际调用路径与挂载目录，不能仅凭文件名判断。

迁移阶段保留两组脚本及现有后端行为。将来统一时，需同时验证：容器挂载、
自动备份下载/删除、cron、归档内容及恢复目标。本轮不修改后端脚本、不增加
计划任务，也不实际运行可能写入业务数据的脚本。
