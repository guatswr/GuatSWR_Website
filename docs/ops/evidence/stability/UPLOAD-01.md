# UPLOAD-01 报名头像容量治理证据

## 1. 任务背景与目标

- 任务编号：`UPLOAD-01`
- 依赖：`BASE-01`（已满足）
- 实施入口：
  - `web/server/utils/guest-upload.ts`：BFF 访客上传配额限额管理器（次数与累计流量双维治理）
  - `web/server/api/bff/guest/upload/avatar.post.ts`：活动与访客身份配额接入
  - `backend/src/modules/events/signup/service.ts`：报名事务内资产影子索引原子同步与取消报名自动清理引用
  - `backend/src/routes/event.js`：注入公共根目录配置
  - `web/tests/guest-avatar-governance.test.ts`：配额与窗口滑动单元测试
  - `backend/tests/integration/event-signup-asset.test.mjs`：报名落盘、影子关联与取消报名引用清除集成测试

## 2. 设计与防护机制

1. **真实调用时序与独立访客凭据绑定**：
   - 访客在活动报名弹窗中上传头像，无需也不得要求访客预先拥有文章投稿草稿（`guestProof.check('draft')` 专用于稿件，头像上传直接使用活动及独立 CSRF/IP 保护）；
   - 上传凭据严格绑定 `(guestIp, eid)`，防止跨活动/跨访客串用。
2. **容量与配额双维治理（Quota Governance）**：
   - 针对访客头像上传设立严格的有界配额管理器：
     - 单个 `(guestIp, eid)` 1 小时滑动窗口内最多允许上传 **5 次**；
     - 单个 `(guestIp, eid)` 1 小时滑动窗口内累计上传体积上限 **100 MiB**；
     - 超出任一配额即刻拦截并抛出 429 `quota_exceeded`（'头像上传次数已达上限' 或 '头像上传累计体积已达上限'），避免恶意刷盘耗尽磁盘；
     - 内存表上限 5,000 条，配合 TTL 自动淘汰，保障内存严格有界。
3. **报名保存事务确认归属与影子索引同步**：
   - 报名接口（`service.signup`）在单事务内调用 `tx.save` 持久化参与者后，立即调用 `syncEntityAssetReferences`，将 `(event_participants, participantId, avatar, avatarUrl)` 原子写入 `asset_references` 表；
   - 经此同步，该头像 URL 在系统资产索引中被正式标记为 `used`；
   - 配合 `ASSET-02` 的轻量覆盖索引探测，`isAnyAssetTargetReferenced` 立即返回 `true`，防止并发或定时清理误删。
4. **取消报名引用清除与禁止按路径年龄无差别删除**：
   - 访客取消报名（`service.remove`）时，事务内自动调用 `removeEntityAssetReferences` 清除其在 `asset_references` 中的记录；
   - 若头像为该参与者独占，清除后 `isAnyAssetTargetReferenced` 返回 `false`，安全交由孤儿清理作业回收；
   - 若头像被多个参与者共享（或被其他实体引用），由于其他实体的引用记录依然完好，`isAnyAssetTargetReferenced` 坚决返回 `true`，绝对保留该资产；
   - **核心纪律守则**：严禁仅依据文件路径的 mtime 或文件年龄做无差别暴力物理删除，所有资产清理必须且只能通过权威引用探测确认零引用后方可回收。

## 3. 验证结果

- Web 测试文件：`web/tests/guest-avatar-governance.test.ts`
  - `allows uploads within count and volume quotas`：配额内正常上传（PASSED）
  - `rejects uploads exceeding window count quota`：超 5 次触发 429 拦截（PASSED）
  - `rejects uploads exceeding cumulative byte quota`：超 100 MiB 触发 429 拦截（PASSED）
  - `isolates quota across different visitor IPs and different events`：IP 与活动维度配额隔离（PASSED）
  - `resets quota after 1 hour sliding window`：1 小时滑动窗口重置（PASSED）
- 后端测试文件：`backend/tests/integration/event-signup-asset.test.mjs`
  - `records asset reference in shadow index upon successful participant signup`：报名落盘并原子记录影子引用（PASSED）
  - `removes asset reference when participant cancels signup`：取消报名后影子引用精准清除（PASSED）
  - `preserves shared avatar reference when only one participant cancels`：多方共享头像时单方取消安全豁免（PASSED）
- 回归测试集：
  - `tests/integration/asset-publication.test.mjs`（21 passed）
  - `tests/integration/asset-shadow-index.test.mjs`（5 passed）
  - `tests/guest-upload.test.ts`（8 passed）
- 代码质量：`pnpm typecheck` 0 错误通过，`pnpm lint` 0 错误通过

## 4. 生产验收边界

- 代码与本地各场景自动化测试已全部验证（`CODE_VERIFIED`）。
- 历史未归属头像在生产环境下应先进行只读盘点，经人工确认孤儿名单后再执行安全隔离，避免自动破坏性删除历史真实数据。
