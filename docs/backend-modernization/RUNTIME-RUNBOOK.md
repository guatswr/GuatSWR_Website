# 生产产物与状态目录（BM-33）

本文件是待发布操作说明；未授权或执行生产部署。精确候选SHA/image ID/digest由BM35固定，不能用可变tag代替。

镜像为锁定Node24.16.0 bookworm-slim digest、多阶段pnpm11.25.0 frozen安装/strict编译/prod deploy；原生sqlite3、sharp在Linux环境安装。应用以node:node（UID/GID1000）运行，/app代码归root，仅/app/data和/app/backups预建且归node，权限0700。没有源码bind mount、运行时安装、隐式建库或启动提权。

| 内容 | 容器路径/边界 |
| --- | --- |
| 主库/日志库、WAL/SHM | /app/data，显式迁移后才能启动；默认main3/audit2 |
| 公开资源 | /app/data/public，由Express提供；不把整个data暴露为静态根 |
| 未验证请求文件 | /app/data/private-upload，不公开 |
| 可恢复隔离/发布日志 | /app/data/asset-quarantine、asset-publications，不公开；隔离默认keep-all |
| 备份及验证标记 | /app/backups，独立私有挂载，默认keep-all |
| 原./uploads挂载 | 原路径不被当前应用使用，Compose移除该挂载；宿主旧目录不删除、不自动搬迁 |

Compose仍只发布127.0.0.1:8088，实际反向代理/BFF CIDR和旧直连消费者需BM36现场核对。Compose固定容器内data/public/backups及0.0.0.0监听，init转发信号、无额外capabilities、no-new-privileges；不因此宣称生产网络已验收。

新named volumes首次由镜像的node目录初始化归属。Linux现有bind目录必须事先按实际UID/GID及ACL核验主库、WAL目录、public和backups的读写能力；不会在entrypoint递归chown既有卷。若沿用旧root属主文件，在停写/已有恢复点后由操作员针对核准的绝对状态目录调整归属，禁止对/app代码或宽泛宿主路径递归授权。Windows Docker Desktop文件共享权限行为不能替代Linux宿主实际核验。缺权限应失败退出，不回退root/世界可写。

启动前检查公开根与双库/备份/私有目录在词法和existing-ancestor realpath上分离；拒绝symlink/junction别名暴露私有根、双库同路径/同inode。保留公共目录位于DATA/public和外部绝对路径的合法配置。此检查不是对具备宿主文件写权限的恶意操作者提供TOCTOU防护；运行期间仍按既有上传/清理身份边界检查。

HEALTHCHECK只GET本容器loopback /api/version，1.5秒请求期限/3秒执行期限，不建库、不迁移、不备份。它是HTTP存活检查；迁移完整性在启动校验，探针200不能替代业务故障指标。停止使用Docker stop/SIGTERM，等待请求/任务/子进程释放，超时退出非0；不得自动删除卷来重建服务。

本地安全演练命令：`pwsh -File backend/scripts/test-runtime-volumes.ps1 -Image EXACT_TEST_IMAGE`。脚本只创建带随机guatswr-bm33前缀的合成Docker资源；测试两次真实进程重建、上传/备份和已建有效双库后的权限不足，退出仅清理本次资源。不能将其卷名替换成正式卷。恢复流程继续见BACKUP-RUNBOOK/MIGRATIONS；已写入后的只读回退须禁写、禁旧后台清理，不能直接覆盖快照。
