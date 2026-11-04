# 长期运行部署与验收

本目录是待 review 的部署材料；不会因合并代码自行安装系统任务。先验证，再切换生产。

## 备份链路

腾讯云 `guatswr-backup.timer` 每天 03:30（服务器时区，部署时确认 Asia/Shanghai）调用 `scripts/ops_backup.py`。
链路：应用完整备份 → 临时目录恢复验证 → Umami PostgreSQL pg_dump → 流式打包并 GPG 公钥加密 → rsync 到阿里云 → 阿里云保留清理 → 本机保留清理 → 写 last-success。
任一步失败任务非零退出，不会先删除旧副本。明文中间文件仅在私有临时目录，退出自动清理。
完整包维持 online-per-resource 语义，不承诺双库和文件同一时刻；重大升级仍须停写备份。

阿里云目标已通过 sshali 确认可达，约 34GB 可用。正式目标 `/srv/guatswr-backups`，专用用户 `guatswr-backup`，目录 0700，文件 0600。

### 安装准备

1. 在独立受控设备生成 GPG 加密密钥，离线保管私钥及恢复口令。将**公钥**导入腾讯云 GPG keyring，核对完整指纹；不要把解密私钥放在两台备份服务器上。
2. 腾讯云创建专用 SSH 密钥；阿里云配置专用非 root 用户及目标目录，禁用端口转发、代理转发、X11 和 PTY。固定 host key，禁止 StrictHostKeyChecking=no。阿里云脚本与 systemd unit 由 root 持有，备份用户只能写目标目录。SSH 密钥有删除备份能力，应定期轮换并单独保留离线副本。
3. 腾讯云 `/root/.ssh/config` 配置 `guatswr-backup-ali`：HostName 8.163.78.202、Port 22、User guatswr-backup、IdentityFile 专用密钥、BatchMode yes、StrictHostKeyChecking yes。
4. 两端需要 python3，腾讯云另需 gpg、rsync、tar、Docker CLI。复制 receiver/monitor 到阿里云 `/opt/guatswr-backup`；腾讯云使用仓库 scripts。
5. 复制 backup.example.json 到腾讯云 `/etc/guatswr-backup.json`（0600），填公钥完整指纹。运行不带 --apply 的命令检查目标。
6. 手工执行一次 `ops_backup.py --config /etc/guatswr-backup.json --apply`。部署前必须先确认源镜像包含新的 backup_guard.py 和 backup_prune.py。
7. 从阿里云下载并解密一份，核对 website.tar.gz 恢复和 Umami SQL 向空库导入成功；离线私钥可用性必须验收。
8. 设置 BACKUP_SCHEDULER_OWNER=external（宿主机 timer 为唯一调度），应用 backup_enabled 保持关闭。成功演练后才安装启用腾讯云 backup timer；阿里云安装 prune timer。先 `systemd-analyze verify` 再 `systemctl daemon-reload`、`enable --now`。

### 保留与清理

两端默认：超过 30 天且不在最新 7 份内才删除。修改天数/数量需要同步脚本调用参数及 prune unit。远端仅匹配 `guatswr-YYYYMMDDTHHMMSSZ.tar.gpg`，忽略临时文件、软链接和其他文件。
本机 backup_prune.py 默认仅预览，--apply 才删除；各类型至少保留 7 份，并保护最近一份有效恢复验证包。缺失或无效验证标记、已有保留锁均拒绝清理。独立 DB/uploads 包及配套 sidecar 一并按策略处理。

预览：
```sh
python3 /opt/guatswr-backup/ops_backup_receiver.py --root /srv/guatswr-backups
python3 /app/scripts/backup_prune.py --root /app/backups
```
第二条在 backend 容器中执行。清理不触碰 asset-quarantine、公开资源和业务数据库。
未知历史 `.asset-cleanup-fence` / `.backup-retention.lock` 必须停相关作业并核查后人工处理，不按 TTL 猜测删除。新备份验证/删除/保留锁记录 Linux boot id、PID 及进程启动时间，只有确认原进程已退出才接续；未知旧锁仍需人工核查。新 backup_guard 管理的 fence 能在进程组终止后自动接续；守护进程被单独强杀而子进程仍在运行时内核锁继续持有。

## 外部业务探测和通知

在阿里云安装 monitor 服务/每分钟 timer，从站点主机之外访问首页及 readiness。monitor.example.json 复制到 `/etc/guatswr-monitor.json`（0600），增加确定的静态资源 URL、需要的正文 contains 校验。
默认连续 3 次失败后成为告警，持续失败每小时提醒，恢复通知一次；检查阿里云磁盘和站外备份 30 小时新鲜度。
webhook 是通用 `{text: ...}` JSON POST，需要匹配通知端协议/适配器。目前用户尚未指定渠道，因此留空；空值只输出 journal，不代表已配置外发通知。
用不可达测试 URL 验证故障/恢复，不制造生产故障。监控运行在阿里云，阿里云自身离线仍应沿用独立主机离线通知。

## 应用资源与重启连续性

web/backend 日志各 10MB × 3；应用配置需要重建容器才生效。
默认各 1GiB、1.5 CPU、256 PID，可用 WEB/BACKEND_MEMORY_LIMIT、CPU_LIMIT、PIDS_LIMIT 调整。上线前测量 SSR、并发图片处理与备份峰值，结合宿主机和 Umami 余量设置，不能根据空闲内存直接验收。
web 新增独立 bff-state Docker volume；镜像准备 node 用户可写的 /app/state。BFF_STATE_DIR 开启逐记录 AES-256-GCM 加密、SQLite FULL 同步持久化，Cookie 不落盘。必须保持 session secret 不变。禁止多副本/多 worker；更换 secret 会隔离旧存储并要求重新登录。
备份 BFF volume 与 secret 会扩大能力凭证暴露面，本方案选择不转储到站外；灾难恢复重新登录，普通容器重启则保留会话及访客草稿授权。已在飞行的上游提交不承诺跨进程 exactly-once。
回滚前先禁用 host timer；旧版本使用 app 调度时先设置唯一 owner 再启用，避免双调度。持久化 volume 不随回滚删除。

## 验收清单

- 重启前端：已有登录仍有效，未完成访客草稿可继续操作；注销及撤销重启后仍有效。
- 备份并发只允许一个，强杀作业后下一轮接续；未知历史锁拒绝覆盖。
- 阿里云解密并实际恢复主库、审计库、资源与 Umami；校验失败不能触发清理。
- 预览清理列表，仅清理匹配命名的过期项，最近 7 份与最后有效恢复点保留。
- 外部 readiness 故障/恢复、备份超龄、磁盘阈值能触发指定渠道通知。
- 峰值负载下验证内存/PID 配额，无 OOM、无不可接受的延迟退化。
