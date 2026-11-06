# 稳定性更新证据记录：AUTH-02

- 任务 ID：AUTH-02
- 任务名称：原子记录更新与失败一致性
- 基线 Revision：`aea44f8b7c0abfe9797e26fd84785c14a24a60e1` (main)
- 实施日期：2026-11-06
- 状态：CODE_VERIFIED

---

## 1. 变更范围与文件清单

1. `web/server/utils/durable-records.ts`：
   - 增加 `DurableRecords<T>` 扩展接口，显式提供 `atomicUpdate()`、`deleteMany()` 和 `close()` 能力，同时完全保留 `Map<string, T>` 标准契约。
   - **预编译语句复用**：`insertStmt`、`deleteStmt`、`selectAllStmt`、`clearStmt` 在 SQLite 启动时编译一次并长期复用，杜绝每次写入重新 compile SQL 语句。
   - **更新失败一致性**：`set()` 与 `atomicUpdate()` 先通过 `insertStmt.run` 落盘，成功后再更新内存缓存；若加密或 SQLite 写入失败，内存缓存保持不变。`atomicUpdate()` 对现有记录执行 `structuredClone`，彻底杜绝回调函数就地篡改旧记录。
   - **原子 UPSERT 与内存重排**：单次写入使用 `INSERT OR REPLACE INTO records VALUES (?, ?)`，内存通过 `super.delete()` + `super.set()` 刷新至 Map 迭代尾部，不再对磁盘触发先 `DELETE` 后 `INSERT`。
   - **撤销失败一致性**：`delete()` 与 `deleteMany()` 执行 SQLite 删除；若 SQLite 抛出异常，在当前进程内存中驱逐对应 key（阻止当前进程继续授权该会话），并向外抛出持久化异常；未提交的事务自动 `ROLLBACK`，重启后以最后一次成功落盘为准。
   - **批量事务删除**：`deleteMany()` 在单事务（`BEGIN IMMEDIATE ... COMMIT`）中完成多键删除。
   - **水合规范化**：提供内部 `_hydrate()` 方法，消除外部通过 `Map.prototype.set.call` 绕过存储语义的做法。
   - **向后兼容**：表结构、PRAGMA、文件路径、sha256 命名规则及 AES-256-GCM（12 字节 IV + AAD）完全保持不变，历史数据无缝读取。
2. `web/server/utils/guest-drafts.ts`：
   - `put()` 移除 `records.delete(recordKey)`，直接调用 `records.set(recordKey, candidate)` 执行原子 UPSERT，彻底闭合草稿更新时“先删除再创建”的恢复空窗。
   - `issue()` 与 `confirmSubmission()` 对 `drafts`、`submitted` 数组与嵌套 `receipts` 对象均执行不可变拷贝，禁止原地修改 `read()` 返回的旧记录引用。
3. `web/server/utils/bff-session.ts`：
   - `deleteByUserId` 检测并复用 `durable.deleteMany(keysToDelete)` 单事务批量删除。
4. `web/server/utils/bff-auth-service.ts`：
   - `logout()` 不再吞噬 `deps.store.delete(key)` 的持久化异常；持久化失败时向调用方抛错（返回非成功），同时当前进程拒绝继续授权。
5. `web/tests/durable-records.test.ts`：
   - 新增 7 个故障与一致性测试（全文件 8 个测试，全部在独立子进程与真实 SQLite 文件中执行）。
6. `web/tests/guest-drafts.test.ts`：
   - 新增 2 个测试，验证创建异常时旧记录不可变保护与收据拷贝隔离。
7. `web/tests/auth-service.test.ts`：
   - 新增测试，验证登出持久化失败时返回非成功且当前进程拒绝继续授权。
8. `docs/ops/STABILITY-TASKS.md`：
   - 更新 AUTH-02 状态为 `CODE_VERIFIED` 并填写交接信息。
9. `docs/ops/evidence/stability/AUTH-02.md`：
   - 本证据记录文件。

---

## 2. 原缺陷复现与故障分析

1. **草稿更新的两阶段写盘与恢复空窗**：
   - 原代码 `put()` 为调整 Map 迭代顺序执行：`records.delete(recordKey)` 然后 `records.set(recordKey, record)`。
   - 产生两次磁盘同步 I/O；且在 `delete` 完成后到 `set` 提交前，若进程崩溃或断电，访客草稿数据彻底丢失。
   - 修复后：单次 `INSERT OR REPLACE`（UPSERT），内存通过 `super.delete()` + `super.set()` 调整迭代顺序，0 删除写盘，无恢复空窗。
2. **原地修改污染内存状态**：
   - 原代码在 `issue()` 和 `confirmSubmission()` 中直接对 `existing` 或 `read()` 得到的对象执行 `record.drafts.push()`、`record.submitted.push()`。若后续 upstream 抛错或持久化失败，内存中的数据已被篡改，与磁盘状态永久漂移。
   - 修复后：先复制（浅/深拷贝）得到 `candidate`，只有持久化成功后才发布到内存中。
3. **撤销失败时的授权隐患**：
   - 原代码 `logout()` 中 `try { deps.store.delete(...) } catch {}` 忽略所有错误。如果磁盘写入失败，上层认为登出成功，但内存中可能仍持有有效会话。
   - 修复后：撤销失败向上抛错，且当前进程在内存中驱逐该会话，立刻使后续 `verify()` 返回 401。

---

## 3. 故障测试与断言覆盖清单

在 `web/tests/durable-records.test.ts`、`web/tests/guest-drafts.test.ts` 和 `web/tests/auth-service.test.ts` 中完成 5 大故障场景验证：

| 故障场景 | 验证方式 | 实际结果 |
| --- | --- | --- |
| **1. 提交前抛错一致性** | 在 `atomicUpdate` 更新器中抛出异常或在 SQLite commit 前模拟错误 | 内存保持旧值，新进程读取旧值，未发生半提交 |
| **2. 提交成功跨进程可读** | 执行 `set` / `atomicUpdate` 提交后，在独立 Node 子进程中重新读取 | 新进程准确读取最新提交数据 |
| **3. 更新无删除恢复空窗** | 检查写入操作，更新时不执行 `DELETE FROM records`，单次 UPSERT 完成，并正确刷新 Map 迭代尾部 | 只有 1 次 UPSERT，0 次 DELETE，Map 顺序更新 |
| **4. 加密与 AAD 边界保持** | 用错误 secret 或篡改 AAD 打开同名数据库 | 拒绝访问或无法解密，Fail-closed 安全失败 |
| **5. 撤销失败一致性** | 注入 SQLite 触发器阻止 DELETE 执行 | `m.delete()` 向上抛错（非成功）；当前进程内存已驱逐（拒绝继续授权）；新进程仍保留原磁盘数据 |
| **6. 批量事务删除** | `deleteMany(['s1', 's2'])` | 在单次 `BEGIN IMMEDIATE ... COMMIT` 事务中完成，异常时自动 `ROLLBACK` |
| **7. 旧格式无缝读取** | 使用历史 AES-256-GCM 格式预置 SQLite 文件 | 新代码无缝解密并读取数据，保证向前向后兼容 |
| **8. 草稿内存不可变隔离** | `create()` 失败或并发保存 | 内存中的原有草稿与收据数组未被污染 |

---

## 4. 验证命令与测试结果

所有测试均在 Node 24.16.0 环境下运行通过：

| 命令 | 退出码 | 覆盖范围与结果 |
| --- | --- | --- |
| `pnpm --filter @guatswr/web exec vitest run tests/durable-records.test.ts` | 0 | 8 个持久层故障与事务测试用例全部通过 |
| `pnpm --filter @guatswr/web exec vitest run tests/guest-drafts.test.ts` | 0 | 17 个草稿并发与不可变测试用例全部通过 |
| `pnpm --filter @guatswr/web exec vitest run tests/auth-session.test.ts tests/auth-service.test.ts tests/bff-session-core.test.ts tests/bff-session-race.test.ts tests/bff-runtime.test.ts tests/durable-records.test.ts tests/guest-drafts.test.ts` | 0 | 7 个核心测试文件，**141 个用例全部通过** |
| `pnpm --filter @guatswr/shared test` | 0 | 9 个测试文件，**83 个用例全部通过** |
| `pnpm --filter @guatswr/web test` | 0 | 77 个测试文件，**876 个用例全部通过** |
| `pnpm --filter guiair-backend exec vitest run --configLoader native tests/integration/transactions.test.mjs` | 0 | 19 个事务用例全部通过 |
| `python scripts/test_ops.py` | 0 | 4 个用例全部通过 |
| `python backend/scripts/backup_bundle_test.py` | 0 | 20 个用例全部通过 |
| `pnpm typecheck` | 0 | 全局 TypeScript 类型检查通过，0 错误 |
| `pnpm lint` | 0 | 全局 ESLint 代码规范检查通过，0 错误 |

---

## 5. 剩余风险与下一任务

- 现阶段虽然消除了更新时的恢复空窗，但 `createMemorySessionStore` 在每次 `set()` 时依然会调用 `sweep()` 遍历全表过期会话（`AUTH-03` 的优化范围）。
- 此外，定时清理器需要建立批次上限（如每批最多 100 项）和有界关闭机制，避免会话堆积造成停顿。
- **下一任务**：`AUTH-03`（有界清理与关闭）。
