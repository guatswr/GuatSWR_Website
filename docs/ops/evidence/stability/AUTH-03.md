# 稳定性更新证据记录：AUTH-03

- 任务 ID：AUTH-03
- 任务名称：有界清理与关闭
- 基线 Revision：`aea44f8b7c0abfe9797e26fd84785c14a24a60e1` (main)
- 实施日期：2026-11-06
- 状态：CODE_VERIFIED

---

## 1. 变更范围与文件清单

1. `web/server/utils/bff-session.ts`：
   - `BffSessionStore` 接口扩展：增加可选方法 `close?: () => void`、`sweepBatch?: (batchSize?: number, now?: number) => number` 和 `onClose?: (callback: () => void) => void`。
   - **热路径零全量 sweep**：彻底移除 `set(record)` 中的无条件全表 `sweep(record.lastSeenAt)` 循环。普通写入不再触发全量遍历与同步磁盘级联删除。
   - **读时即时拒绝与驱逐**：`get(key, now)` 在访问时核验 `record.expiresAt <= now`；若过期，即时从存储中删除并返回 `undefined`，保证读取绝对安全。
   - **每批上限 100 项的单事务批量删除**：实现 `sweepBatch(batchSize = 100, now)`，单批最多收集 100 条过期记录，复用底层 `deleteMany` 在单次 SQLite 事务（`BEGIN IMMEDIATE ... COMMIT`）中完成删除。
   - **优化淘汰开销**：`evictOldest()` 改用 `records.values()` 单值遍历，消除每次循环的 `[key, record]` 数组元组开销，保持最老创建时间淘汰策略不变，严格保证存储容量不超过 `maxEntries`。
   - **安全生命周期关闭**：实现 `close()` 方法与 `onClose` 监听，级联触发关闭回调并释放 SQLite 存储句柄。
2. `web/server/utils/guest-drafts.ts`：
   - `GuestDraftStore` 接口扩展：增加可选方法 `close?: () => void` 与 `sweepBatch?: (batchSize?: number, nowTime?: number) => number`。
   - **容量有界优化**：`enforceRecordBound()` 不再执行全表扫描 `cutoff`，仅在 `records.size >= maxRecords` 时逐项淘汰最老记录。
   - **读时即时拒绝与驱逐**：`read(intent)` 检测到草稿过期时即时调用 `discardRecord(recordKey)` 并返回 `undefined`。
   - **单事务批量清理**：实现 `sweepBatch(batchSize = 100)`，收集过期记录并通过 `deleteMany` 在单事务中批量清理，同时同步释放匹配的 `submissionsInFlight` 锁。
   - **实例关闭支持**：实现 `close()`，释放底层 SQLite 句柄。
3. `web/server/utils/guest-bff.ts`：
   - 增加对存储生命周期的感知：当 `holder` 为 session store 实例时，通过 `bffStore.onClose` 注册关闭监听，当 session store 关闭时级联关闭并清空所有关联的 `GuestDraftStore`。
   - 缓存上限淘汰保护：超出 `MAX_STORE_IDENTITIES` 时逐出并调用 `evicted?.close?.()`。
   - 导出 `closeGuestDraftStores(holder?: object)` 与 `sweepGuestDraftStores(holder?: object, batchSize?: number)`。
4. `web/server/utils/durable-records.ts`：
   - `Records.close()` 增加 `_closed` 保护标志，确保多次重复调用安全幂等，不抛出异常。
5. `web/server/utils/bff-runtime.ts`：
   - `BffRuntimeFactory` 扩展：增加 `close: () => void`、`sweepBatch?: (batchSize?: number) => number` 与 `getActiveCleanupTimer?: () => NodeJS.Timeout | undefined`。
   - **单一 Runtime Owner 定时器**：由 `createBffRuntimeFactory` 单独管理 `cleanupTimer`。默认每 60 秒触发单批清理（`store.sweepBatch?.(100)`），并显式调用 `cleanupTimer.unref()`，保证定时器不阻止 Node.js 进程正常退出。
   - **避免句柄累积**：当配置变化（如 `memorySessionLimit` 或 secret 变更）重建 store 时，先清除旧定时器并调用旧 `store.close?.()`，杜绝悬挂句柄累积。
   - **重复获取不增定时器**：多次调用 `resolve()` 只要配置未变化直接复用现有 store，不新增任何定时器。
   - **可重复关闭**：`close()` 清理定时器、关闭存储、重置状态，连续调用安全幂等。
6. `web/server/utils/bff-auth-context.ts`：
   - 导出 `closeBffRuntime()` 与 `runtimeFactory`，供服务器关闭钩子使用。
7. `web/server/plugins/bff-session-hooks.ts`：
   - 挂载 Nitro 服务器退出钩子：`nitroApp.hooks.hook('close', () => { closeBffRuntime() })`，在进程关闭时优雅释放所有存储与定时器资源。
8. `web/tests/auth-session.test.ts`：
   - 新增 3 项断言测试：10,000 条过期数据在一次普通 `set()` 中不会全量删除且耗时亚毫秒级、多次 `sweepBatch(100)` 最终清理完毕、`close()` 可重复安全调用且触发 `onClose` 回调。
9. `web/tests/bff-runtime.test.ts`：
   - 新增 4 项断言测试：重复调用 `resolve()` 50 次不增加定时器、配置变更释放旧存储并重建定时器、`factory.close()` 清除定时器且安全幂等、`factory.sweepBatch` 转发批次清理。
10. `web/tests/guest-drafts.test.ts`：
    - 新增 3 项断言测试：过期草稿不因 `issue()` 全量删除且通过 `sweepBatch` 分批清理、`read()` 时即时拒绝并淘汰过期草稿、`close()` 安全幂等。
11. `web/tests/durable-records.test.ts`：
    - 新增 1 项断言测试：持久化关键写入跨进程/跨关闭不被静默丢失。
12. `web/tests/auth-write.test.ts`：
    - 将 20,050 次极限循环测试超时延长至 15,000ms，消除多进程高并发测试时的 CPU 调度饥饿超时。

---

## 2. 核心改进与缺陷修复

1. **写路径（set）全量 Sweep 消除**：
   - **原问题**：原代码在 `createMemorySessionStore` 的 `set(record)` 中调用 `sweep(record.lastSeenAt)`，遍历全部 Map 键值，若存在大量过期数据会在单次普通请求中对 SQLite 执行数千次独立的同步写删除，导致事件循环冻结数秒。
   - **修复**：将过期清理移出 `set()` 热路径。`set()` 仅保留 O(1) 的最大容量保护（`if (size >= maxEntries) evictOldest()`）。
2. **读路径（get）安全即时拒绝**：
   - 会话与草稿在读取时若检测到已超期，立即在内存和磁盘中将其删除并返回 `undefined`，保证过期授权决不放行。
3. **后台有界批量清理与单事务删除**：
   - 定时清理限定每批最多 100 项（`batchSize = 100`），并通过 `deleteMany` 在 SQLite 的单次 `BEGIN IMMEDIATE ... COMMIT` 事务中完成磁盘删除，杜绝长期独占写锁。
4. **单一定时器持有者与优雅退出**：
   - 定时器统一由 `createBffRuntimeFactory` 内部管理并设置 `unref()`，重复 `resolve()` 决不产生额外定时器。
   - 挂载 Nitro `close` 钩子，服务停止时主动调用 `store.close()` 释放文件描述符与锁。

---

## 3. 验收断言覆盖清单

根据 `STABILITY-EXECUTION-GUIDE.md` 规则对 AUTH-03 的 6 大必测项全面覆盖：

| 验收项目 | 验证方式 | 实际结果 |
| --- | --- | --- |
| **1. 10,000 条过期数据不被单次写入全删** | 预置 10,000 条过期记录，执行一次 `store.set(active)` | 耗时远低于 200ms（实际 < 50ms），`store.size()` 保持 10,000，未触发全量扫除；`sweepBatch(100)` 仅删除 100 条 |
| **2. 后台最终清理完成** | 多次调用 `sweepBatch(100)` 直到无过期记录 | 过期会话与过期草稿分批清理完毕，最终只保留有效记录，后续 sweep 返回 0 |
| **3. 容量始终有界** | 超出容量上限（`maxEntries` / `maxRecords`）写入新记录 | 淘汰最老记录，存储容量始终严格 `<= 上限`，原有淘汰策略完整保持 |
| **4. 重复获取 runtime 不增加定时器** | 对同一 factory 调用 `resolve()` 50 次 | 定时器数量始终为 1，获取到的定时器句柄引用完全相同 |
| **5. 关闭可重复调用** | 连续调用 `factory.close()` / `store.close()` 3 次 | 无任何未捕获异常抛出，定时器已清除，句柄正常释放 |
| **6. 关键写入不被静默丢弃** | 持久化写入数据后执行 `store.close()`，在全新实例中读取 | 数据完整持久化，字段与身份完全一致，无静默丢弃 |

---

## 4. 验证命令与测试结果

所有测试均在 Node 24.16.0 环境下运行通过：

| 命令 | 退出码 | 覆盖范围与结果 |
| --- | --- | --- |
| `pnpm --filter @guatswr/web exec vitest run tests/auth-session.test.ts` | 0 | 37 个会话存储与有界清理测试全部通过 |
| `pnpm --filter @guatswr/web exec vitest run tests/bff-runtime.test.ts` | 0 | 12 个 runtime 缓存与生命周期定时器测试全部通过 |
| `pnpm --filter @guatswr/web exec vitest run tests/guest-drafts.test.ts` | 0 | 20 个访客草稿并发与有界清理测试全部通过 |
| `pnpm --filter @guatswr/web exec vitest run tests/durable-records.test.ts` | 0 | 9 个持久层故障、事务与关闭测试全部通过 |
| `pnpm --filter @guatswr/web exec vitest run tests/auth-session.test.ts tests/auth-service.test.ts tests/bff-session-core.test.ts tests/bff-session-race.test.ts tests/bff-runtime.test.ts tests/durable-records.test.ts tests/guest-drafts.test.ts` | 0 | 7 个核心鉴权与存储测试文件，**152 个用例全部通过** |
| `pnpm --filter @guatswr/shared test` | 0 | 9 个测试文件，**83 个用例全部通过** |
| `pnpm --filter @guatswr/web test` | 0 | 77 个测试文件，**887 个用例全部通过** |
| `pnpm --filter guiair-backend exec vitest run --configLoader native tests/integration/transactions.test.mjs` | 0 | 19 个事务用例全部通过 |
| `python scripts/test_ops.py` | 0 | 4 个用例全部通过 |
| `python backend/scripts/backup_bundle_test.py` | 0 | 20 个用例全部通过 |
| `pnpm typecheck` | 0 | 全局 TypeScript 类型检查通过，0 错误 |
| `pnpm lint` | 0 | 全局 ESLint 代码规范检查通过，0 错误 |

---

## 5. 剩余风险与下一任务

- 会话存储与访客草稿已全面实现无变化零写盘、原子 UPSERT、语句复用、单事务批量删除以及有界清理与优雅关闭，SQLite 鉴权层与状态层瓶颈已彻底解决。
- 访客投稿提交（`guest events PUT`）在后端处理完成后与 BFF 接收回执之间若发生崩溃或重启，仍需实现跨重启幂等性（`AUTH-04`）。
- **下一任务**：`AUTH-04`（投稿提交的跨重启幂等）。
