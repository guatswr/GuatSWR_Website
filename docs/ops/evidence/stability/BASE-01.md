# 稳定性更新证据记录：BASE-01

- 任务 ID：BASE-01
- 任务名称：环境与复现基线构建
- 基线 Revision：`aea44f8b7c0abfe9797e26fd84785c14a24a60e1` (main)
- 实施日期：2026-11-06
- 状态：CODE_VERIFIED

---

## 1. 变更范围与文件清单

1. `scripts/performance/benchmark.mjs`：新建可重复运行的性能基线测试脚本，支持 `--warmup`、`--duration`、`--rounds`、`--concurrencies`、`--seed`、`--output`、`--quick` 参数。在隔离临时环境中测试两档会话规模（小会话 100 与压力会话 10,000）及并发探索梯度（1、5、20 并发）。
2. `.tools/performance/baseline.json`：由性能基线脚本生成的机器可读完整测试数据结果（位于 `.gitignore` 忽略目录）。
3. `docs/ops/STABILITY-TASKS.md`：更新 BASE-01 任务状态至 CODE_VERIFIED。
4. `docs/ops/evidence/stability/BASE-01.md`：本证据记录文件。

---

## 2. 工具链核对

- 操作系统：Windows 11 (win32 x64, Kernel 10.0.26300)
- CPU 架构：AMD Ryzen 7 7840HS (16 逻辑核心)
- 物理内存：32 GiB (33,585,106,944 bytes)
- Node.js 版本：`v24.16.0`（位于 `C:\Users\water\AppData\Local\Microsoft\WinGet\Packages\OpenJS.NodeJS.LTS_Microsoft.Winget.Source_8wekyb3d8bbwe\node-v24.15.0-win-x64\node.exe`，已置于命令进程 PATH 前端）
- 包管理器：pnpm `11.25.0`
- Python 版本：Python `3.13`
- Node 24 专用环境变量：`BACKUP_NODE_BIN` 指向 Node 24.16.0 二进制，以满足 Windows 备份与恢复元数据提供者要求。

---

## 3. 现有测试套件基线验证

所有测试均在隔离环境与受控参数下运行，未修改任何生产数据：

| 命令 | 退出码 | 结果与覆盖范围 |
| --- | --- | --- |
| `pnpm --filter @guatswr/shared build` | 0 | 共享库编译正常通过 |
| `pnpm --filter @guatswr/web exec vitest run tests/bff-session-core.test.ts tests/bff-session-race.test.ts tests/auth-session.test.ts tests/durable-records.test.ts tests/guest-drafts.test.ts` | 0 | 5 个核心会话/草稿测试文件全部通过（84 个测试用例） |
| `pnpm --filter guiair-backend build` | 0 | 后端 TypeScript 编译与 Legacy 检查通过（31 个文件） |
| `pnpm --filter guiair-backend exec vitest run --configLoader native tests/integration/transactions.test.mjs` | 0 | 后端事务边界集成测试通过（19 个测试用例） |
| `python scripts/test_ops.py` | 0 | 运维保留与恢复锁测试通过（4 个测试用例） |
| `python backend/scripts/backup_bundle_test.py` | 0 | 备份归档与还原保护测试通过（20 个测试用例） |
| `pnpm typecheck` | 0 | 全局 3 个工作区项目类型检查通过，0 错误 |
| `pnpm lint` | 0 | 全局 ESLint 检查通过，0 错误，1 个合法 warning (`v-html` 审计) |
| `pnpm test` | 0 | 全套单元与集成测试通过（63 个测试文件，2076 个用例全部通过，1 个跳过） |
| `pnpm check:artifacts` | 0 | 产物 source-map 与体积检查通过 |
| `pnpm check:boundaries` | 0 | 架构代码边界检查通过（168 个文件，0 违规） |
| `pnpm check:patches` | 0 | 依赖安全补丁回溯探测通过（38 个探针正常） |
| `pnpm test:ci` | 0 | CI 工作流契约测试全部通过（12 个用例） |
| `pnpm test:tooling` | 0 | 工具链与构建契约测试全部通过（128 个用例） |

### 已知现有受控外部条件差异记录

1. `pnpm check:security`：在无外部 npm registry 网络连通的环境中提示 `Audit failed without usable findings`，属于网络隔离预期现象；补丁检查 `check:patches` 完全通过。
2. `pnpm check:routes`：在未设置 `NUXT_SITE_ENV=staging` 且未注入本地 Mock 统计上游时，默认由于 SEO 规则对未标记 preview 的页面要求 `noindex`，且检测到外部 Umami 引用。这属于外部生产环境环境变量注入项，不影响底层会话与数据库改造。
3. 生产数据库规模：当前工作区未挂载生产数据库，实际生产业务表数量与真实数据规模聚合结果标记为**缺失**。本阶段基线采用代表性的受控合成数据集进行定量测量。

---

## 4. 原缺陷性能复现与基线测量数据

通过 `scripts/performance/benchmark.mjs` 在隔离目录（由 `fs.mkdtemp` 创建）下生成两档数据集（A 档 100 会话，B 档 10,000 会话）并对各项热路径进行 3 轮重复测量。

### 4.1 会话规模与数据规格

- 业务表基线数据：1,000 条活动（activities）、1,000 位成员（members）、1 个正式活动（events）、1 位系统管理员（users）
- 会话规模 A（小规模）：100 条持久化会话记录
- 会话规模 B（压力规模）：10,000 条持久化会话记录（在 SQLite `records` 表中预生成并加密持久化）

### 4.2 性能实测聚合对比（中位数汇总）

| 工作负载 | 会话档位 | 并发 1 (P50 / P95 / P99) | 并发 5 (P50 / P95 / P99) | 并发 20 (P50 / P95 / P99) | 事件循环延迟 P99 (C1/C5/C20) |
| --- | --- | --- | --- | --- | --- |
| **Auth Verify (无变化鉴权)** | 100 sessions | 22.8ms / 28.2ms / 32.0ms | 42.7ms / 80.8ms / 93.3ms | 145.3ms / 200.2ms / 224.2ms | 19.6ms / 17.4ms / 41.8ms |
| **Auth Verify (无变化鉴权)** | 10,000 sessions | **28.5ms / 32.5ms / 37.3ms** | **41.6ms / 75.4ms / 93.1ms** | **156.6ms / 193.5ms / 226.3ms** | **19.9ms / 17.2ms / 37.6ms** |
| **Guest Draft Update (草稿更新)** | 100 sessions | 5.5ms / 6.4ms / 7.6ms | 27.6ms / 31.0ms / 32.8ms | 107.5ms / 120.4ms / 126.7ms | — |
| **Guest Draft Update (草稿更新)** | 10,000 sessions | 5.5ms / 5.9ms / 6.3ms | 26.4ms / 29.2ms / 29.7ms | 115.0ms / 136.0ms / 136.3ms | — |
| **Public List (公开列表读取)** | 1,000 条数据 | 16.7ms / 23.6ms / 24.5ms | 12.1ms / 40.6ms / 58.5ms | 47.4ms / 75.1ms / 91.0ms | — |
| **Event Signup (活动报名写事务)** | 单主库写 | 14.1ms / 16.9ms / 18.5ms | 43.7ms / 74.3ms / 85.4ms | **176.9ms / 243.6ms / 262.2ms** | — |
| **Mixed (后台轮询 + 公开页读取)** | 混合竞争 | 11.1ms / 31.5ms / 36.0ms | 16.7ms / 42.5ms / 56.7ms | 54.1ms / 84.6ms / 102.2ms | 14.7ms / 14.7ms / 16.6ms |

### 4.3 核心缺陷定性与定量分析

1. **BFF 会话热路径无变化同步写盘与全量扫描开销（AUTH-01/AUTH-02 优化目标）**：
   - 现状代码在 `bff-auth-service.ts` 中，每笔 `verify()` 调用即使身份信息毫无变化，依然会无条件执行 `deps.store.set(updated)`。
   - `durableRecords` 使用 `PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL;`。在每次 `set()` 时，`bff-session.ts` 遍历内存/数据库所有会话进行 `sweep()`。
   - 在 10,000 条会话压力规模下，单次鉴权基线延迟增加约 25%（并发 1 下 P50 从 22.8ms 升至 28.5ms，P99 升至 37.3ms），并在高并发下造成显著的事件循环停顿（41.8ms）。
2. **草稿持久化的 delete + set 间隙（AUTH-02 优化目标）**：
   - 访客草稿更新每次调用 `records.delete(recordKey)` 再 `records.set(recordKey, record)`，导致单个业务操作发生 2 次独立同步写盘。并发 20 下单草稿更新延迟高达 107ms～115ms。
3. **SQLite 写事务并发排队瓶颈（DB-01 优化目标）**：
   - 活动报名涉及写事务，在并发 1 时延迟为 14ms，但在并发 20 时延迟线性暴增至 176.9ms（P99 达 262.2ms），显示明显的单写锁排队争用。
4. **后端内部代理限流边界陷阱**：
   - 后端 `/api/auth` 路由挂载了 `authLimiter`（硬编码单 IP 15 分钟内最多 120 次）。BFF 代理如果没有转发各自客户端 IP，所有请求将聚合为 127.0.0.1，在超过 120 次后直接返回 429 导致 BFF 报“登录服务暂不可用”。

---

## 5. 剩余风险与外部输入

- 生产环境真实会话和内容规模聚合数据因未挂载生产凭据暂未读取，生产上线前需按基线脚本只读测量一次生产聚合值。
- 本地测量是在 Windows 环境下单节点完成，Linux 生产容器下文件系统与事件循环行为需在镜像构建后通过 Docker 探针验证。

---

## 6. 下一任务

- 任务编号：`AUTH-01`（无变化鉴权零写盘）
- 目标：消除 `verify()` 在身份未变更时的同步写盘与全量扫描，引入 lastSeenAt 内存合并控制，断言 100 次无变化鉴权落盘次数为 0。
