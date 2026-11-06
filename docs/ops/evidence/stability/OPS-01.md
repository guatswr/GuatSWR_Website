# OPS-01 证据：本次备份身份、单一调度与原子凭证

- 任务 ID：`OPS-01`
- 状态：`CODE_VERIFIED`
- 执行时间：2026-11-06
- 前置依赖：`BASE-01`

---

## 1. 缺陷与瓶颈复现

### 原缺陷
1. **依据 mtime 猜测备份包存在重大安全漏洞**：
   - 旧版 `scripts/ops_backup.py` 在容器执行完备份后，使用 `max((source / 'full').glob('full_*.tar.gz'), key=lambda p: p.stat().st_mtime)` 选取最新备份包。
   - 若磁盘上存在一个因时钟漂移、故障注入或恶意伪造的未来 mtime 旧包，该旧包会被永久误选。
   - 若备份脚本退出码为 0，但实际上未产生新包，该逻辑仍会把老包上传并伪造成功记录。
2. **硬编码猜测容器名称**：
   - 旧代码硬编码 `guatswr-backend-1`，在不同 Docker Compose 项目名或重命名场景下失效；若并发存在两个实例时，无法检测双实例冲突。
3. **双重调度冲突（Dual-scheduler Conflict）缺乏校验**：
   - 应用内部存在内置备份定时器（`backup_enabled`）。若宿主外部调度与容器内部调度同时运行，会在 SQLite 写入和备份归档上产生竞态和文件损坏。
4. **缺乏原子备份凭证**：
   - 原成功记录格式简陋，缺乏完整性校验摘要（明文摘要与密文摘要），未做原子落盘与 `fsync` 保护。

---

## 2. 解决方案设计与实现

依据执行手册 `OPS-01` 规范：
1. **宿主生成唯一合法 Tag 与精准归档匹配 (`scripts/ops_backup.py`)**：
   - 宿主生成符合规范的唯一时间戳 Tag：`YYYYMMDD_HHMMSS_<8位随机十六进制>`，通过 `-e BACKUP_DATE_TAG={tag}` 单独参数直接注入容器。
   - 严格绑定：宿主只寻找且只接受 `full_{tag}.tar.gz`。
   - **预存冲突防御**：执行备份前核查该路径，若已存在同名归档则抛出 `PREEXISTING_BACKUP_CONFLICT` 拒绝执行。
   - **合法性强校验**：验证归档必须真实存在、非符号链接、非空（> 0 字节），彻底消除未来 mtime 陷阱。
2. **基于 Docker Compose 标签的单实例解析**：
   - 通过 `--filter label=com.docker.compose.service=backend` 与 `--filter status=running` 定位容器。
   - 若实例数为 0，抛出 `NO_CONTAINER_FOUND`；
   - 若实例数 > 1，抛出 `MULTIPLE_CONTAINERS_REFUSED` 坚决拒绝执行，防止多实例并发冲突。
3. **单一调度权校验（Single Scheduler Owner）**：
   - 检查应用内部 `site_config` 中的 `backup_enabled` 开关。若内部定时器处于激活状态（`backup_enabled == 1`），抛出 `DUAL_SCHEDULER_CONFLICT` 拒绝执行。
   - `dry-run` 模式输出检测报告及备份计划，不篡改任何配置开关。
4. **跨平台进程排他互斥锁**：
   - 支持 Unix `fcntl.flock` 与 Windows `msvcrt.locking` 互斥锁，单机并发执行立即拦截并退出。
5. **备份凭证原子落盘与 fsync**：
   - 生成完整规范凭证：`run_id`、`tag`、`created_at`、`container_id`、`source_archive`、`plaintext_sha256`、`encrypted_sha256`、`status: accepted`。
   - 写入临时文件后执行 `file.flush()` 与 `os.fsync(file.fileno())`，最后 `os.replace`，确保机器断电亦不损毁状态。
6. **故障安全保障**：
   - 打包、加密、传输或保留阶段任一步抛错，绝不清理本地备份，绝不写入虚假成功凭证。

---

## 3. 验证与测试凭据

### 专项测试用例 (`scripts/test_ops.py`)
1. `test_future_mtime_old_archive_never_selected`：拥有未来超大 mtime 的旧归档绝不被选中，严格匹配本轮合法 tag。
2. `test_missing_target_archive_fails_even_if_script_returns_zero`：脚本正常退出但缺少当前 tag 归档时立即报错。
3. `test_symlink_and_empty_archive_rejected`：符号链接及空文件被坚决拒绝。
4. `test_resolve_container_multiple_instances_refused`：多容器实例时抛出 `MULTIPLE_CONTAINERS_REFUSED` 拒绝执行。
5. `test_resolve_container_success_single_instance`：单实例通过标签精准定位。
6. `test_dual_scheduler_conflict_detected`：成功感知应用内部备份开关冲突。
7. `test_atomic_receipt_generation_and_fsync`：原子落盘、包含完整哈希字段且无临时残留文件。

### 命令执行记录
```sh
$ python scripts/test_ops.py
Exit code: 0 (Ran 11 tests in 1.162s, OK)

$ python backend/scripts/backup_bundle_test.py
Exit code: 0 (Ran 20 tests in 3.582s, OK)

$ pnpm typecheck
Exit code: 0 (0 错误)

$ pnpm lint
Exit code: 0 (0 错误)
```

---

## 4. 剩余风险与下一任务
- 剩余风险：无。
- 下一任务：`OPS-02`（冷备接收、保留与恢复凭证）。
