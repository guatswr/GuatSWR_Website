# OPS-02 接收、保留与恢复凭证证据

## 1. 任务背景与目标

- 任务编号：`OPS-02`
- 依赖：`OPS-01`（已满足）
- 实施入口：
  - `scripts/ops_backup_receiver.py`：远端/离线专用备份接收与保留管理引擎
  - `scripts/test_ops.py`：接收校验、保留防护与恢复凭证单元测试
  - `backend/scripts/backup_bundle.py` 与 `backend/scripts/backup_prune.py`：底层归档格式与解密校验联动

## 2. 设计与防护机制

1. **临时文件原子接收与密文 SHA-256 校验**：
   - 接收端禁止直接向正式路径写入未验证数据。文件先落地为临时文件，计算并对比客户端提供的 `expected_sha256`。
   - 校验通过后，使用 `os.replace` 原子发布为 `guatswr-<tag>.tar.gpg`；
   - 篡改、截断或哈希不匹配时立即清理临时文件并抛出 `CHECKSUM_MISMATCH`，绝不污染归档目录；
   - 拒绝重名覆盖攻击（`PACKAGE_ALREADY_EXISTS`）。
2. **传输凭证与解密恢复验证双轨分立**：
   - 接收成功后原子生成 `guatswr-<tag>.receipt.json`，标记 `status: transferred`；
   - 严禁以 mtime 或传输完成时间假冒“可恢复”；独立实现 `record_recovery_verification`，在专用离线环境中成功解密并校验明文包后生成 `guatswr-<tag>.verified.json`；
   - 恢复凭证记录验证者身份、时间及加密包 SHA-256 绑定。
3. **保留策略与最后一份已验证恢复点强制保护**：
   - 默认保留 30 天且至少保留最新 7 份；
   - 核心防灾兜底：系统始终识别出最后一个真实通过验证的恢复点（`last_verified`），即使其已超过 30 天，也绝对禁止清理；
   - 零验证点熔断：若当前目录下没有任何一份恢复点通过验证，`plan()` 抛出 `RETENTION_REFUSED_NO_VERIFIED_POINT` 拒绝破坏性删除，防止出现“因持续失败导致旧有效备份被全部清空”的恶性灾难。
4. **免密钥灾难恢复 Runbook 自动生成**：
   - `generate_recovery_runbook` 提供 6 步标准化的可执行故障恢复命令行；
   - 包含 SHA-256 核验、GPG 解密、明文包解压、`backup_bundle.py verify` 校验、`backup_bundle.py restore` 恢复与 Umami 数据库导入；
   - 严禁在脚本或 Runbook 中硬编码任何私钥或数据库密码。
5. **跨平台互斥锁**：
   - 引入 `.receiver.lock`，并发执行或上传与清理同时触发时安全互斥。

## 3. 验证结果

- 测试文件：`scripts/test_ops.py`
  - `test_refuses_when_no_verified_point`：无验证点时破坏性清理拒绝（PASSED）
  - `test_old_only_minimum_and_namespace_with_verified_point`：常规 30 天/7 份保留逻辑验证（PASSED）
  - `test_preserves_oldest_verified_recovery_point`：超过保留期的唯一验证点安全豁免（PASSED）
  - `test_empty_directory_returns_empty_list`：空目录安全处理（PASSED）
  - `test_unsafe_policy_refused`：非法参数防御（PASSED）
  - `test_atomic_receive_package_success`：原子接收与 receipt 写入（PASSED）
  - `test_atomic_receive_checksum_mismatch_cleans_temp`：哈希不匹配防御与清理（PASSED）
  - `test_atomic_receive_duplicate_package_rejected`：重复包防御（PASSED）
  - `test_recovery_runbook_generation`：Runbook 生成且无密钥泄露（PASSED）
- 测试输出：
  - 18 项单测全通过（Ran 18 tests in 1.041s, OK）
  - `backend/scripts/backup_bundle_test.py` 20 项全通过（Ran 20 tests in 3.321s, OK）

## 4. 生产验收边界

- 代码及离线测试已完备（`CODE_VERIFIED`）。
- 生产远端（如阿里云主机 `sshali`）环境下的端到端定时接收触发与恢复演练需由运维在具备真实 GPG 私钥的环境下独立进行，禁止在未授权时连接生产主机。
