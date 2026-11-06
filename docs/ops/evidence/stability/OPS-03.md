# OPS-03 业务探测和通知证据

## 1. 任务背景与目标

- 任务编号：`OPS-03`
- 依赖：`OPS-01`（已满足）
- 实施入口：
  - `scripts/ops_monitor.py`：业务健康探测、备份时效评估与通知告警引擎
  - `scripts/test_ops_monitor.py`：正文断言、静态资产、备份凭证与告警重试专项测试
  - `deploy/operations/monitor.example.json`：生产探测基准配置

## 2. 设计与防护机制

1. **正文断言与禁止任意 200**：
   - 首页探测严格配置 `contains: "GUAT"` 字符片段断言；
   - 响应即使返回 HTTP 200，若未包含指定正文字符串（如被默认反代 50x 页或空模板截断），立即作为异常失败上报，杜绝虚假存活。
2. **Readiness 契约精准核验**：
   - 服务就绪探针严格解析 JSON 返回体；
   - 断言返回字段 `service == "guatswr-web"` 且 `status == "ok"`，降级或格式非法均作为故障记录。
3. **静态图片资产探测**：
   - 新增静态资源探测项（如 `favicon.ico`），核验返回 `Content-Type: image/` 且实体体积满足 `min_bytes >= 100`；
   - 防止因 Nginx 静态别名配置失误或软链接损坏导致全站静态媒体 404/0字节。
4. **绑定凭证判定备份时效**：
   - 废弃单纯依靠 `mtime` 判断备份新鲜度的不可靠模式；
   - 深入扫描备份目录下的 `guatswr-*.receipt.json`、`guatswr-*.verified.json` 及 `last-success.json` 凭证；
   - 仅根据凭证中落盘的 `received_at` / `verified_at` 严格计算流逝时间（阈值 30 小时）；无凭证或凭证过期直接上报 `backup:<name>` 异常。
5. **告警生命周期与通知重试机制**：
   - 连续 3 次探测失败方才触发告警升级（防止网络偶发抖动误报）；
   - 故障持续时，每隔 1 小时（3600 秒）发送一次静默提醒；
   - 故障恢复后立即发送一次 `GuatSWR: recovered` 恢复回执；
   - **通知失败不假记**：仅在 Webhook POST 成功（2xx）后更新已发送状态与已通知集合；若外部接口超时或报错，保留待通知状态，在下次调度周期立即重试。
6. **通知未配置优雅降级**：
   - 当配置中未提供外部 Webhook 地址时，系统明确记录 `notification_status: "BLOCKED_EXTERNAL"`，同时所有本地探测及状态流转正常执行，杜绝未配置时静默崩溃或虚假报告已通知。
7. **互斥锁与原子写盘**：
   - 采用 `.state.lock` 文件互斥锁，严防 Cron 或外部调度并发重叠；
   - 状态使用临时文件原子写入与 `os.fsync`。

## 3. 验证结果

- 测试文件：`scripts/test_ops_monitor.py`
  - `test_homepage_positive_content_assertion`：正文断言校验与任意 200 拦截防御（PASSED）
  - `test_readiness_service_and_status`：就绪探针 service/status 精准判定（PASSED）
  - `test_static_asset_probe`：静态图片 content-type 与 min_bytes 校验（PASSED）
  - `test_backup_freshness_requires_valid_receipt`：非 mtime 的绑定凭证时效判定（PASSED）
  - `test_alert_threshold_reminder_and_recovery`：3 次触发、1 小时间隔与恢复通知（PASSED）
  - `test_failed_notification_is_retried_next_cycle`：通知失败重试与不假记（PASSED）
  - `test_unconfigured_webhook_reports_blocked_external`：未配置渠道时安全输出（PASSED）
- 测试输出：
  - `python scripts/test_ops_monitor.py` 7 项全通过（Ran 7 tests in 0.085s, OK）
  - `python scripts/test_ops.py` 18 项全通过
  - `python scripts/health_watchdog_test.py` 9 项全通过

## 4. 生产验收边界

- 代码及模拟 HTTP stub 已全部验证（`CODE_VERIFIED`）。
- 生产环境外部企业微信/飞书/钉钉等 Webhook 渠道由用户后续自行配置填入，本地在未填入时保持 `BLOCKED_EXTERNAL` 安全降级。
