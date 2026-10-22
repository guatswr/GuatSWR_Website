# 备份与隔离恢复约定

适用 BM-10 的 v2 归档及明确选择的历史 full 包。不是生产发布授权，也不自动停止/切换现有服务。

## 备份

运行环境需要 Bash、SQLite CLI、Python3、tar、sha256sum。缺工具或任一数据库失败即退出非0。仓库入口 `scripts/backup_all.sh` 默认读 backend/data、写根backups；独立后端入口 `backend/scripts/backup_all.sh` 默认读自己的data、写自己的backups。明确指定DATA_DIR、PUBLIC_DIR、BACKUP_ROOT可避免cwd歧义，均使用绝对路径。DB_PATH/LOG_DB_PATH的相对值仍以DATA_DIR解析。

```bash
DATA_DIR=/srv/guatswr/data PUBLIC_DIR=/srv/guatswr/data/public \
BACKUP_ROOT=/srv/guatswr/backups bash backend/scripts/backup_all.sh
```

默认 manifest 标记 `online-per-resource`：每个数据库来自在线一致快照，资源归档与双库**不是同一原子业务时点**。不把它当作发布停写恢复点。

发布演练必须先按已批准维护窗口关闭所有应用/cron/外部写入口，确认在途写已完成，再设置 `BACKUP_WRITE_FENCE=acknowledged`、`BACKUP_SOURCE_REVISION=<实际候选SHA>`。该标志只是操作者声明，不会替你停写；实际停写证据、窗口、RPO/RTO及旧应用回读须记入 BM-35/36。

full目录保留 `full_<tag>.tar.gz` 和同名 `.sha256`；内部含原有db/资源子归档和 `.guatswr-backup.json`。manifest记录子包/文件大小与SHA-256、时间、版本、来源和一致性等级。public源包含链接或特殊文件会拒绝，不能静默丢掉它们。归档/校验文件权限600，过去恢复点不因本次失败或重复tag被覆盖。保留期/调度统一留BM-30。

## 恢复到新目录

先取得可信 SHA-256（保留同目录sidecar，或明确传 `--sha256`）。哈希提供完整性；从攻击者同时取得归档和哈希不能证明来源真实性。使用由运行用户控制的私有父目录，绝不能把目标放在public树下。父目录须存在，目标必须尚不存在；恢复不会覆盖原data或删除原WAL/SHM。

```bash
bash scripts/restore.sh /srv/guatswr/backups/full/full_<tag>.tar.gz \
  --target /srv/guatswr-recovery/candidate-unique
```

工具先验外包校验、路径/类型/数量/大小、manifest/子包/文件哈希、双库身份、integrity_check和foreign_key_check，全部完成后才发布新目标。拒绝绝对路径、`..`、Windows路径、symlink/hardlink、设备/稀疏文件、重复条目、文件作为目录、过大PAX元数据。上限为20GiB归档/解压预算、10万条目、32MiB manifest；超预算须先评估并审查调整，不绕过检查。

成功产物为 `<target>/data/guatswr_web_{main,logs}.db`、`data/public/` 和 `RESTORE_READY.json`。文件属执行用户，不采用归档里的uid/setuid权限。后续应用应以相同uid或经明确权限配置读取。拿这个副本在隔离端口做启动/读写/资源核验，**不会自动切换服务或移动到原目录**。

新版本已有写入时，不得直接用旧备份覆盖：先停写、保全现状，再选择旧应用兼容读取或数据协调方案。生产恢复仍需精确版本、批准窗口及回退判据。

## 历史包

历史full包（一个db子包加一个uploads子包）可在可信外包哈希存在时加 `--allow-legacy`。它仍做全部路径/双库/integrity/FK检查，结果标记 `legacy-unknown`，不伪造manifest时点。支持日志文件名 `logs` 或 `logs.db`。损坏/错误的v2 manifest不会降级成legacy。单库裸db、缺日志库或缺资源的输入不再隐式覆盖原数据。

## 本地验收命令

- `python backend/scripts/backup_bundle_test.py`：跨平台对抗验包。
- 在包含CLI/Python的**隔离容器**中执行 `node scripts/test-backup-snapshot.cjs`、`node scripts/test-backup-restore.cjs`，只创建临时合成数据。
- 磁盘满测试给隔离容器挂 `--tmpfs /limited:rw,size=1m`，设 `BACKUP_TEST_LIMIT_ROOT=/limited`；不挂真实data。

已执行范围及旧镜像回读证据见 [BM-10](evidence/BM-10.md)。原数据实测/版本迁移/性能及生产一致点尚须各自阶段验收。
