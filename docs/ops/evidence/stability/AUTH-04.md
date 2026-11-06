# 稳定性更新证据记录：AUTH-04

- 任务 ID：AUTH-04
- 任务名称：投稿提交的跨重启幂等
- 基线 Revision：`aea44f8b7c0abfe9797e26fd84785c14a24a60e1` (main)
- 实施日期：2026-11-06
- 状态：CODE_VERIFIED

---

## 1. 变更范围与文件清单

1. `backend/src/migrations/main-008-event-submissions.sql`：
   - 增加新迁移表 `event_submissions`：
     - `event_id INTEGER PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE`
     - `capability_key TEXT NOT NULL`
     - `digest TEXT NOT NULL`
     - `response TEXT NOT NULL`
     - `created_at INTEGER NOT NULL`
     - 索引 `idx_event_submissions_capability ON event_submissions(capability_key)`
2. `backend/src/migrations/manifest.json`：
   - 更新 `main` 升级定义至版本 8，校验 sha256 完整性并纳入 schema 校验。
3. `backend/src/modules/events/repository.ts`：
   - 导出 `EventSubmissionRow` 接口。
   - 新增 `getSubmission(eventId: number, executor: SqlExecutor)`：在指定事务/执行器中读取提交凭证。
   - 新增 `createSubmission(eventId, capabilityKey, digest, response, createdAt, executor)`：在指定事务/执行器中持久化提交回执。
4. `backend/src/modules/events/service.ts`：
   - 新增 `computeCanonicalPayloadDigest(body)`：对提交载荷的 `type`、`title`、`content` 计算规范化 SHA-256 摘要。
   - `save()` 支持可选参数 `saveOptions: { capabilityKey?: string | undefined; digest?: string | undefined }`。
   - **单事务（Single Transaction）原子查重与提交**：
     - 在更新 `events` 记录的同一数据库事务（`tx`）中，核查 `getSubmission(numericId, tx)`。
     - 若已存在提交记录：
       - 若 `existing.capability_key !== capabilityKey` 且非管理员：抛出 403 `草稿凭据不匹配`。
       - 若 `existing.digest === canonicalDigest`：标记 `replayed = true` 并直接返回成功回执，跳过对 `events` 的重复更新、跳过向 `bot_notifications` 的重复入队、跳过重复审计日志。
       - 若 `existing.digest !== canonicalDigest`：抛出 409 `该活动已提交，请勿修改后重复提交`。
     - 若不存在提交记录：在同一事务中原子更新 `events` 状态为 `pending`、插入 `event_submissions` 回执、入队 `event.pending` 审核通知。
5. `backend/src/modules/events/controller.ts`：
   - 从 `req.guestDraftProof` 中提取 `capabilityKey`（`proof:${proof.ip}:${proof.eid}`），并解析请求头 `x-submission-digest`，传给 `service.save(...)`。
6. `web/server/utils/guest-bff.ts`：
   - `GuestUpstreamRequest` 接口增加可选属性 `submissionDigest?: string`。
   - 在向后端发送请求时，通过 `headers['x-submission-digest'] = request.submissionDigest` 传递内容摘要。
7. `web/server/api/bff/guest/events/[id]/index.put.ts`：
   - 在调用 `guestUpstream.request()` 时传入 `submissionDigest: digest`。
   - 无论首次提交还是重放成功，均在获得后端 200 确认后调用 `draft.store.confirmSubmission(draft.intent, id, digest)` 完成客户端闭环。
8. `backend/tests/integration/event-submission-idempotency.test.mjs`：
   - 新建专项集成测试套件，全面覆盖 4 项关键场景：
     - 首次提交落盘并在同一事务中写入 `event_submissions` 与 `bot_notifications`；
     - 进程崩溃/网络超时后以相同摘要重发，安全获得 200 回执（`replayed: true`），且不产生重复审核通知、不重复更新事件表；
     - 修改正文后重复提交被 409 Conflict 拒绝；
     - 并发相同提交原子处理，仅产生 1 条通知与 1 条回执。
9. `backend/tests/integration/migrations.test.mjs`：
   - 更新最新模式版本断言至版本 8，所有 20 项数据库迁移与 schema 一致性测试全部通过。
10. `web/tests/guest-bff.test.ts`：
    - 新增断言：核验 BFF 调用 upstream 时正确转发 `x-submission-digest` 请求头。

---

## 2. 崩溃窗口闭合分析与时序保证

### 原有时序的脆弱窗口
在旧有实现中：
```
[Client] ---> (1. PUT /bff/events/:id) ---> [BFF Memory]
                                                 |
                                         (2. PUT /api/event/:id)
                                                 v
                                             [Backend DB] (COMMIT events & bot notice)
                                                 |
                                            (200 OK)
                                                 v
                                            [BFF Crash!] (BFF 在调用 confirmSubmission 前进程崩溃或断电)
```
此时客户端收到超时（504/网络中断），客户端按幂等协议发起重试：
- BFF 重启后，内存状态丢失，重新读取本地存储显示该草稿仍处于未确认状态；
- BFF 再次将请求转发给后端；
- 后端由于缺乏提交回执表，再次执行 `UPDATE events`，并再次插入一条 `event.pending` 审核通知发送至 QQ 群或机器人；
- 造成事件审核重复入队与通知轰炸。

### AUTH-04 实施后的安全时序
```
[Client] ---> (1. PUT /bff/events/:id [digest=D]) ---> [BFF]
                                                          | (x-submission-digest: D)
                                                          v
                                                 [Backend DB Transaction]
                                                 BEGIN IMMEDIATE;
                                                 检查 event_submissions WHERE event_id=EID;
                                                 --> 首次: UPDATE events; INSERT event_submissions; INSERT bot_notifications;
                                                 COMMIT;
                                                          |
                                                     (200 OK)
                                                          v
                                            [BFF 进程崩溃或网络丢包]
                                                          |
[Client Retry] -> (3. PUT /bff/events/:id [digest=D]) -> [BFF 重启]
                                                          | (x-submission-digest: D)
                                                          v
                                                 [Backend DB Transaction]
                                                 BEGIN IMMEDIATE;
                                                 检查 event_submissions WHERE event_id=EID;
                                                 --> 发现已有记录 (digest == D):
                                                     跳过 UPDATE events;
                                                     跳过 INSERT bot_notifications;
                                                     直接返回缓存的 200 回执 (replayed: true);
                                                 COMMIT;
                                                          |
                                                     (200 OK)
                                                          v
                                                 [BFF 调用 confirmSubmission 并持久化]
                                                          v
[Client] <--------------------- (200 OK 回执) ------------+
```
无论 BFF 在何种阶段崩溃、无论网络重发多少次，后端的业务状态变更和审核通知都严格只发生一次。

---

## 3. 测试与验证凭据

### 3.1 后端幂等性专项集成测试
```
pnpm --filter guiair-backend exec vitest run --configLoader native tests/integration/event-submission-idempotency.test.mjs
```
- 结果：4 passed (4), 1.66s
  - `records event_submissions on first submit and replays idempotently without duplicate bot outbox` (PASS)
  - `rejects duplicate submission with different digest with 409 conflict` (PASS)
  - `rejects submission with forged capability key` (PASS)
  - `handles concurrent identical submissions without duplicate notification` (PASS)

### 3.2 数据库迁移测试套件
```
pnpm --filter guiair-backend exec vitest run --configLoader native tests/integration/migrations.test.mjs
```
- 结果：20 passed (20), 4.91s
  - `upgrades main4 with existing Bot state and protects legacy member fields while adding unique QQ and revision triggers` (PASS)
  - `upgrades main3 to main8 without rewriting old data or ledger and accepts main3 with the platform disabled` (PASS)
  - `CLI initializes and checks explicitly named custom database files` (PASS)
  - `explicitly upgrades v1, retains adopted extensions/data and historical ledger rows, and is idempotent` (PASS)
  - `CLI upgrade opens existing databases only and succeeds as a no-op at the current version` (PASS)

### 3.3 后端核心事务与边界测试
```
pnpm --filter guiair-backend exec vitest run --configLoader native tests/integration/migrations.test.mjs tests/integration/guest-proof.test.mjs tests/integration/event-submission-idempotency.test.mjs tests/integration/transactions.test.mjs
```
- 结果：4 test files passed, 48 tests passed (48), 12.59s

### 3.4 Web BFF 边界测试
```
pnpm --filter @guatswr/web exec vitest run tests/guest-bff.test.ts
```
- 结果：21 passed (21), 66ms

### 3.5 全工作区静态类型检查与代码规范检查
- `pnpm typecheck`：退出码 0，3 个子工程（`@guatswr/shared`, `@guatswr/web`, `guiair-backend`）全部 0 错误通过。
- `pnpm lint`：退出码 0，全工作区 0 错误通过。

---

## 4. 结论与验收就绪性
AUTH-04 所有代码变更均严格按照《稳定性和 PostgreSQL 演进方案》和《稳定性执行手册》实施：
- 零改动破坏现有公共 API 契约和数据字段；
- 新增 `main-008` 迁移经完整 ledger 与 checksum 校验通过；
- 单事务内完成查重、事件更新、幂等回执落盘与通知入队；
- 彻底闭合了原实现在 BFF 崩溃后的重复提交通知与二次写入漏洞；
- 所有修改均保留在工作区未 commit、未 push，本卡状态评定为 `CODE_VERIFIED`。
