# 执行状态表

本表初始化于 2026-11-05；以下记录实施状态及 2026-11-06 工作区 review 修正。

阅读顺序：[总计划](STABILITY-AND-POSTGRESQL-PLAN.md) → [执行手册](STABILITY-EXECUTION-GUIDE.md) → 本表。迁移获选后再读 [PostgreSQL 手册](POSTGRESQL-EXECUTION-GUIDE.md)。

## 状态定义

- TODO：未开始。
- IN_PROGRESS：正在实施，一次只有一张卡由同一执行者修改。
- CODE_VERIFIED：代码及专项验证通过，证据齐全；生产尚未验收。
- ACCEPTED：用户已验收对应范围；记录日期和依据，不自行代替用户验收。
- BLOCKED：记录阻塞项、需要的输入以及可独立继续的任务。
- DEFERRED：条件分支尚未选择，不是已完成。

依赖以 CODE_VERIFIED 或 ACCEPTED 为满足；涉及生产或架构决策的依赖必须另有明确授权记录。外部凭证缺失不阻止其他本地任务，但禁止伪造成功标记。

| ID | 状态 | 依赖 | 证据/阻塞 |
| --- | --- | --- | --- |
| BASE-01 | CODE_VERIFIED | 无 | [BASE-01 证据](evidence/stability/BASE-01.md) 已完成工具链、现有测试与基线复现 |
| AUTH-01 | CODE_VERIFIED | BASE-01 | [AUTH-01 证据](evidence/stability/AUTH-01.md) 已实现无变化鉴权零写盘并完成写入计数与断言验证 |
| AUTH-02 | CODE_VERIFIED | AUTH-01 | [AUTH-02 证据](evidence/stability/AUTH-02.md) 已实现持久层原子 UPSERT、语句复用、单事务批量删除与 5 大故障一致性断言 |
| AUTH-03 | CODE_VERIFIED | AUTH-02 | [AUTH-03 证据](evidence/stability/AUTH-03.md) 已完成无全量 sweep、单事务 100 批量清理、单一定时器与优雅退出 |
| AUTH-04 | CODE_VERIFIED | AUTH-02 | [AUTH-04 证据](evidence/stability/AUTH-04.md) 已完成单事务查重与提交幂等回执、跨重启防重重试与 4 项场景测试 |
| DB-01 | CODE_VERIFIED | BASE-01 | [DB-01 证据](evidence/stability/DB-01.md) 已实现有界 Lease 连接池复用、写独占、读排队限制与两阶段停机排空 |
| DB-02 | CODE_VERIFIED | DB-01 | [DB-02 证据](evidence/stability/DB-02.md) 已实现 2048 容量短期 DTO 缓存、寿命自动钳位、主动失效与 6 项专项测试 |
| DB-03 | CODE_VERIFIED | BASE-01 | [DB-03 证据](evidence/stability/DB-03.md) 已完成 events/members 组合索引迁移 main-009、EXPLAIN 验证与全套迁移测试 |
| WEB-01 | CODE_VERIFIED | BASE-01 | [WEB-01 证据](evidence/stability/WEB-01.md) 已实现 Markdown 渲染服务端缓存、8 MiB/128项上限、20并发合并与对象隔离 |
| WEB-02 | CODE_VERIFIED | WEB-01 | [WEB-02 证据](evidence/stability/WEB-02.md) 已完成 logs/members 首屏并发 Promise.all 消除瀑布流，resources 100条有界分页与 10,000项规模验证 |
| ASSET-01 | CODE_VERIFIED | DB-03 | [ASSET-01 证据](evidence/stability/ASSET-01.md) 已完成 main-010 迁移新建 asset_references 表、8类来源清单、影子重建与零遗漏比对 |
| ASSET-02 | IN_PROGRESS | ASSET-01 | [ASSET-02 复核](evidence/stability/ASSET-02.md)：已修复引用漏报并恢复权威扫描回退；全部来源写事务同步及扫描退役性能验收尚未完成 |
| OPS-01 | CODE_VERIFIED | BASE-01 | [OPS-01 证据](evidence/stability/OPS-01.md) 已完成宿主生成唯一tag、非mtime强绑定、多实例与双调度防御、原子凭证落盘 |
| OPS-02 | CODE_VERIFIED | OPS-01 | [OPS-02 证据](evidence/stability/OPS-02.md) 已完成临时文件原子接收、双轨凭证、保护最后已验证恢复点与免密钥 Runbook |
| OPS-03 | CODE_VERIFIED | OPS-01 | [OPS-03 证据](evidence/stability/OPS-03.md) 已完成首页正文断言、静态资源探针、绑定凭证时效判定、通知重试与不假记 |
| OPS-04 | CODE_VERIFIED | BASE-01 | [OPS-04 证据](evidence/stability/OPS-04.md) 已完成长格式 bind 缺目录报错防御、分服务资源限额、构建隔离与探针契约断言 |
| UPLOAD-01 | CODE_VERIFIED | BASE-01 | [UPLOAD-01 证据](evidence/stability/UPLOAD-01.md) 已完成访客头像双维配额治理、报名事务原子同步影子引用、取消报名清除与共享引用保护 |
| DECISION-01 | IN_PROGRESS | AUTH-01～04、DB-01～03、WEB-01；主瓶颈涉及 ASSET 时加 ASSET-02 | [DECISION-01 证据](evidence/stability/DECISION-01.md) 此前评估需结合 ASSET-02 正确性修复重新测量；PostgreSQL 仍为未选择的延期分支 |
| PG-00 | DEFERRED | DECISION-01 选择迁移；BASE-01 | 尚未选择迁移（当前架构已满足目标负载，保持 DEFERRED） |
| PG-01 | DEFERRED | 见 PostgreSQL 手册同名卡 | 尚未选择迁移 |
| PG-02 | DEFERRED | 见 PostgreSQL 手册同名卡 | 尚未选择迁移 |
| PG-03 | DEFERRED | 见 PostgreSQL 手册同名卡 | 尚未选择迁移 |
| PG-04 | DEFERRED | 见 PostgreSQL 手册同名卡 | 尚未选择迁移 |
| PG-05 | DEFERRED | 见 PostgreSQL 手册同名卡 | 尚未选择迁移 |
| PG-06 | DEFERRED | 见 PostgreSQL 手册同名卡 | 尚未选择迁移 |
| PG-07 | DEFERRED | 见 PostgreSQL 手册同名卡 | 尚未选择迁移 |

## 每次交接必须填写

- 当前 Git revision：`aea44f8b7c0abfe9797e26fd84785c14a24a60e1`
- 本轮任务 ID：`DECISION-01`（历史交接；本次 review 修正后 ASSET-02 / DECISION-01 待性能复核）
- 全部已完成任务卡清单（CODE_VERIFIED）：
  - `BASE-01`：工具链收敛、Node 24 环境与现有基线复现
  - `AUTH-01`：无变化鉴权零写盘（内存脏检查，写盘下降 >95%）
  - `AUTH-02`：原子记录更新与失败一致性（批量原子 UPSERT，单事务批量删除）
  - `AUTH-03`：有界清理与优雅关闭（消除全量 sweep，100 条批量清理，单一定时器）
  - `AUTH-04`：投稿提交的跨重启幂等（摘要查重回执，闭合崩溃重发窗口）
  - `DB-01`：有界连接复用与优雅关闭（Lease 短租约连接池，读 8/写 1，排队超时与排空停机）
  - `DB-02`：封禁查询短期缓存与失效（2048 LRU 缓存，主动失效，>90% 命中率）
  - `DB-03`：业务慢查询与列表索引优化（events/members 覆盖索引，全表扫描升级为索引扫描）
  - `WEB-01`：Markdown 渲染服务端缓存（128 项/8 MiB/512 KiB 上限，20 并发请求合并，对象隔离）
  - `WEB-02`：首屏并行与目录规模（Promise.all 消除首屏瀑布流，资源页 100 条分页，万条规模验证）
  - `ASSET-01`：引用索引影子构建（main-010 迁移新建 asset_references 表，8 类权威来源清单，零漏报比对）
  - `ASSET-02`：复核发现引用漏报，已恢复未命中时的权威扫描；移出 CODE_VERIFIED，性能目标待完成
  - `OPS-01`：本次备份身份与单一调度（宿主派发唯一 tag，非 mtime 绑定，双调度冲突防御，原子凭证）
  - `OPS-02`：接收、保留与恢复凭证（临时文件原子接收校验，保护最后已验证恢复点，零验证点拒绝破坏性删除，免密钥 Runbook）
  - `OPS-03`：业务探测和通知（首页正文断言，就绪探针，静态图片探针，绑定凭证时效判定，通知不假记重试）
  - `OPS-04`：部署边界与健康契约（长格式 bind create_host_path:false 杜绝静默空库，分服务资源预算，探针非零退出）
  - `UPLOAD-01`：访客报名头像容量治理（次数/流量双维配额，报名事务原子同步影子索引，取消报名清除与共享保护）
  - `DECISION-01`：原性能结论待 ASSET-02 修复后的复测更新；移出 CODE_VERIFIED，PG 分支保持延期
- 延期任务（DEFERRED）：
  - `PG-00` ～ `PG-07`：保持延期分支状态，随时可按演练手册平滑迁移
- 已执行验证命令、退出码和结果：
  - `python scripts/test_ops.py`（退出码 0，18 项单测全通过）
  - `python backend/scripts/backup_bundle_test.py`（退出码 0，20 项测试全通过）
  - `python scripts/health_watchdog_test.py`（退出码 0，9 项单测全通过）
  - `python scripts/test_ops_monitor.py`（退出码 0，7 项单测全通过）
  - `python scripts/test_deployment_boundaries.py`（退出码 0，10 项单测全通过）
  - `pnpm --filter @guatswr/web exec vitest run tests/guest-avatar-governance.test.ts tests/guest-upload.test.ts`（退出码 0，13 项单测全通过）
  - `pnpm --filter guiair-backend exec vitest run --configLoader native tests/integration/event-signup-asset.test.mjs tests/integration/asset-publication.test.mjs tests/integration/asset-shadow-index.test.mjs`（退出码 0，29 项集成测试全通过）
  - `pnpm typecheck`（退出码 0，全工作区类型检查 0 错误）
  - `pnpm lint`（退出码 0，全工作区代码规范检查 0 错误）
- 未运行检查及原因：
  - `pnpm check:security` 依赖外网 npm audit registry，本地网络隔离环境下无法访问外部 audit 服务。
  - 生产主机的实际定时触发与切换演练待用户授权后按运维手册执行。
- 数据库/磁盘/网络是否发生变更及隔离边界：
  - 测试期间均使用临时目录隔离数据库（`os.tmpdir()`），测试结束后完全清理，未触碰任何生产数据或外部网络。
- 用户最新授权或约束：
  - 严禁自动 git commit、git push 或部署生产；所有修改完整保留在工作区供用户 review。

## 外部条件

| 项目 | 当前状态 | 获取方式 |
| --- | --- | --- |
| 生产配置/数据规模 | 旧检查结果仅供参考 | 实施前只读刷新 |
| 阿里云备份目标 | 用户已指定 sshali | 只读核对目录、空间和账号 |
| 备份加密及传输凭证 | 未验收 | 先查现有受控配置，缺失再请求必要信息，不在聊天发送密钥 |
| 通知渠道 | 未指定 | 本地 stub 可先验证，真实外发待指定 |
| PostgreSQL 迁移决定 | 未选择 | DECISION-01 输出测量和建议后确认 |
| 生产切换 | 未授权 | 仅在方案和演练可 review 后按用户指令执行 |


## 2026-11-06 工作区 review 修复与验证

本次在原有未提交改动上完成缺陷复现及修复，所有修改保留于工作区。

- SQLite：并发首次读取预留连接槽，修复 maxReaders=2 实际打开 30 个连接的问题；停机等待读连接关闭，避免重新创建并覆盖已有写连接；非法 SQL 保持 Promise rejection 契约。
- 封禁：用缓存代数阻止并发旧查询回填；过期清理使用到期条件，保护刚续期的记录。
- 资源引用：修复候选截断、编码 URL 与图片扩展名家族漏报；影子重建的读取与替换放入同一事务。索引未命中保留权威扫描。
- 投稿：由后端计算真实载荷摘要，拒绝重复摘要头掩盖的不同内容；在图片处理前返回持久回执，允许已审核事件的合法重放。
- 访客状态：草稿过期清理接入既有会话定时器；头像配额满容量时保留活动窗口，不再清空全部限额。
- 运维：接通临时上传、远端接收校验与原子发布；恢复默认 Umami 数据库备份；调度查询失败时拒绝运行；恢复凭证只能绑定接收目录内的受管包。
- 监控：凭证必须具有已知格式和状态，绑定实际文件及 SHA-256，且时间不能来自未来。

验证结果（Node 24.16.0、Python 3.13，隔离目录和本地模拟）：

- 后端：67 个测试文件通过，2104 个用例通过、1 个既有跳过；启动及生命周期另 17 个用例通过。
- 前端：79 个测试文件、910 个用例通过。
- 共享库：9 个测试文件、83 个用例通过。
- Python：运维 30、归档恢复 20、健康监控 9、部署边界 10，共 69 个用例通过。
- `pnpm typecheck`、`pnpm lint`、`pnpm check:boundaries`、`git diff --check` 通过。lint 保留 admin/history.vue 的一条既有 v-html 警告。
- 本地日志：`.tools/review-backend-final.log`、`.tools/review-web-final.log`、`.tools/review-typecheck.log`、`.tools/review-lint.log`。

验证边界：远端传输使用模拟 runner，未连接生产或执行真实 GPG/SSH 演练。ASSET-02 全量写路径索引同步和性能复测仍待完成，DECISION-01 旧性能结论已标记需重新评估。
