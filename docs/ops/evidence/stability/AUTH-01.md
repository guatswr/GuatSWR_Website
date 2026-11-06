# 稳定性更新证据记录：AUTH-01

- 任务 ID：AUTH-01
- 任务名称：无变化鉴权零写盘
- 基线 Revision：`aea44f8b7c0abfe9797e26fd84785c14a24a60e1` (main)
- 实施日期：2026-11-06
- 状态：CODE_VERIFIED

---

## 1. 变更范围与文件清单

1. `web/server/utils/bff-auth-service.ts`：
   - 在 `verify()` 热路径中区分身份信息是否发生实质变更（`identityChanged`）。
   - 当 `identityChanged === false` 时，严格不调用 `deps.store.set()`，从根本上消除了每次受保护路由鉴权对底层 SQLite 或内存存储的同步写入与全表 `sweep()` 遍历。
   - 当 `identityChanged === true`（用户头像、角色、用户名等字段在上游发生变更）时，构建新副本并通过 `deps.store.set(updated)` 先可靠持久化后再返回新身份。
   - 严格保留每次调用 `requestMe`、`recordId` 重读核验、到期时间检查、上游 401/403/404 状态与权限判断，严禁为了减少写盘而缓存鉴权结果或跳过撤销核验。
   - 保持 `expiresAt` 不变，杜绝滑动延期。
2. `web/tests/auth-service.test.ts`：
   - 新增 `AUTH-01 zero-disk-write verification and store invariants` 专项测试套件，包含 4 组定向测试用例。
3. `web/tests/auth-session.test.ts`：
   - 新增断言测试，确认 `lastSeenAt` 绝不作为滑动过期依据，会话生命周期严格受不可变的 `expiresAt` 约束。
4. `docs/ops/STABILITY-TASKS.md`：
   - 更新 AUTH-01 状态为 `CODE_VERIFIED` 并填写交接信息。
5. `docs/ops/evidence/stability/AUTH-01.md`：
   - 本证据记录文件。

---

## 2. lastSeenAt 依赖溯源

依据计划设计规则 C2，实施前对全代码库进行了依赖溯源扫描（`git grep "lastSeenAt"`）：

- `web/server/utils/bff-session.ts`：仅在 `BffSessionRecord` 接口声明、`createSessionRecord` 赋初值、以及 `createMemorySessionStore` 内部临时调用 `sweep(record.lastSeenAt)`（但 `sweep` 内部仅比较 `record.expiresAt <= now`）。
- `web/server/utils/bff-auth-service.ts`：旧代码在每次 `verify()` 时将 `now()` 写入 `lastSeenAt` 并无条件持久化。
- `web/tests/bff-runtime.test.ts`：仅作为单测静态 mock 对象的合法字段占位。

**溯源结论**：全站不存在任何读取 `lastSeenAt` 进行业务判断、活跃度展示或滑动过期的消费者。因此，在无变化鉴权中停止持久化 `lastSeenAt` 完全安全，符合规则 C2 与 C3。

---

## 3. 写入计数与性能对比

### 3.1 存储写入次数对比（基线 vs AUTH-01）

| 操作场景 | 操作次数 | 基线（修改前）写入次数 | AUTH-01（修改后）写入次数 | 变化量 |
| --- | --- | --- | --- | --- |
| 用户登录（Login） | 1 次 | 1 次 `store.set` | 1 次 `store.set` | 保持一致 |
| **无变化鉴权（Verify Unchanged）** | **100 次** | **100 次 `store.set` + 100 次全表 sweep** | **0 次 `store.set` + 0 次 sweep** | **-100%（实现零写盘）** |
| 身份变更鉴权（Role/Avatar Change） | 1 次 | 1 次 `store.set` | 1 次 `store.set` | 可靠更新 |
| 慢请求与撤销竞争（Logout Race） | 1 次 | 0 次（捕获过期） | 0 次 `store.set`（不复活） | 安全防复活 |

### 3.2 性能与事件循环延迟实测改善

在压力会话规模（10,000 条持久化会话）下，通过基线脚本测量对比：

| 指标项 | 基线（10,000 会话） | AUTH-01（10,000 会话） | 改善幅度 |
| --- | --- | --- | --- |
| 并发 1 事件循环延迟 P99 | 19.9ms | 18.4ms | -7.5% |
| 并发 5 事件循环延迟 P99 | 35.5ms | 15.4ms | **-56.6%（大幅减轻阻塞）** |
| 并发 20 事件循环延迟 P99 | 41.8ms | 18.9ms | **-54.8%（消除同步全表扫描）** |

---

## 4. 验证命令与测试结果

所有测试均在 Node 24.16.0 隔离环境下运行，全部成功通过：

| 命令 | 退出码 | 覆盖范围与结果 |
| --- | --- | --- |
| `pnpm --filter @guatswr/web exec vitest run tests/auth-session.test.ts tests/auth-service.test.ts tests/bff-session-core.test.ts tests/bff-session-race.test.ts tests/bff-runtime.test.ts tests/durable-records.test.ts` | 0 | 6 个核心测试文件，**116 个用例全部通过**（含 AUTH-01 新增的 5 个断言测试） |
| `pnpm --filter @guatswr/shared test` | 0 | 9 个测试文件，**83 个用例全部通过** |
| `pnpm --filter @guatswr/web test` | 0 | 77 个测试文件，**866 个用例全部通过** |
| `pnpm --filter guiair-backend test` | 0 | 63 个测试文件，**2076 个用例全部通过**（1 个合法跳过） |
| `python scripts/test_ops.py` | 0 | 4 个用例全部通过 |
| `python backend/scripts/backup_bundle_test.py` | 0 | 20 个用例全部通过 |
| `pnpm typecheck` | 0 | 全局 TypeScript 类型检查全部通过，0 错误 |
| `pnpm lint` | 0 | 全局 ESLint 检查通过，0 错误 |

---

## 5. 新增断言覆盖确认

根据 `STABILITY-EXECUTION-GUIDE.md` 对 AUTH-01 的验收要求，新增断言均已落地并得到验证：

1. **连续 100 次无变化鉴权持久化 set 次数为 0**：在 `tests/auth-service.test.ts` 中通过 spy 拦截 `store.set`，100 次连续验证 `setCount` 增量精确为 0。
2. **登录创建一次**：`service.login()` 执行后 `store.set` 计数精确等于 1。
3. **角色/头像变化按实际变更保存**：变更 `avatar`、`role`、`username` 分别触发 1 次持久化保存，并在存储中核验到更新后的数据。无变化重复读取时不触发写入。
4. **撤销与慢 requestMe 竞争不恢复会话**：在 `requestMe` 挂起期间调用 `logout()`，`verify()` 正确捕获并拒绝（401），且不会调用 `store.set` 将已注销的会话重新写回磁盘。
5. **expiresAt 不因访问延长**：推进模拟时钟至距到期 1 秒前，返回与存储的 `expiresAt` 均与登录时创建的值严格一致；推进至到期后 1 秒立即返回 401。

---

## 6. 剩余风险与下一任务

- 当前仅在 BFF 鉴权（`verify`）层消除了无变化写盘与遍历。
- 访客草稿更新（`guest-drafts.ts`）仍存在先 `delete()` 后 `set()` 的两阶段写盘问题。
- `durableRecords` 底层尚未提供显式的原子 UPSERT 与批量删除事务能力，存在进程崩溃或异常时的状态不一致风险。
- **下一任务**：`AUTH-02`（原子记录更新与失败一致性）。
