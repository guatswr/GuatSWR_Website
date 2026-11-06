# WEB-01 证据：Markdown 渲染服务端缓存与并发合并

- 任务 ID：`WEB-01`
- 状态：`CODE_VERIFIED`
- 执行时间：2026-11-06
- 前置依赖：`BASE-01`

---

## 1. 缺陷与瓶颈复现

### 原缺陷
1. 在 `web/server/api/content/activity/[id].get.ts` 中，每次前端访问公开活动详情时，即使从公共 BFF 缓存 `readCachedActivity` 取出了文章实体，仍然对正文 `content` 每次都执行完整的 `renderSafeMarkdown(content)`。
2. `renderSafeMarkdown` 是一个 CPU 密集型链条：
   - KaTeX 数学公式语法预处理（`prepareMath` / `attachGeneratedMath`）
   - `@nuxtjs/mdc` 解析为 unified / remark / rehype / hast 语法树
   - 遍历 AST 树检查节点深度与节点数预算（`astWithinBudget`）
   - Shiki 语法高亮渲染（`highlightBlocks`）
   - 递归安全清洗与规范化（`sanitizeMarkdownAst`）
3. 高并发场景下，20 个相同内容的并发请求将并行启动 20 次完整的 MDC 解析与 Shiki 高亮，造成严重的 CPU 峰值挤兑和事件循环延迟剧增。

---

## 2. 解决方案设计与实现

依据规则 C7 与执行手册：
1. **独立渲染缓存设计与实现 (`web/server/utils/markdown-cache.ts`)**：
   - **容量与内存有界控制**：
     - 最大项数：128 项（LRU 淘汰）。
     - 最大字节数：8 MiB。
     - 单项阈值：512 KiB。
     - TTL 寿命：5 分钟（300,000 ms）。
     - 超大项（> 512 KiB）：允许正常渲染返回给调用者，但**不保留在缓存中**。
   - **缓存键安全唯一性**：
     - Key 格式：`${renderVersion}:${sha256(content)}`。
     - 采用内容的 SHA-256 哈希作为摘要，无论文章多长均保持固定长度且绝不碰撞。
     - 包含渲染版本常量 `renderVersion`（当前为 `2026-11-safe-mdc-katex-shiki-v1`），当高亮或脱敏安全规则升级时，自动使历史缓存自然失效。
2. **并发单飞合并（Single-flight Coalescing）**：
   - 维护 `inflight: Map<string, Promise<SafeMarkdownResult>>`。
   - 当多个请求同时到达且内容摘要相同时，挂载到同一个正在执行的渲染 Promise，仅执行 1 次真实渲染。
   - 无论成功或失败，通过 `finally` 阶段可靠释放并清理 inflight，失败绝不驻留在缓存中。
   - 限制最大 inflight 并发数量（默认 64 项），防范极端雪崩。
3. **不可变隔离保护（AST Immutability Isolation）**：
   - 存储和返回时通过 `structuredClone` 深度克隆，使得任何调用方修改返回对象（如篡改 `nodes` 树或 `headings`）都不会污染缓存，也不会污染其他并发请求。
4. **数据可见性分层保证**：
   - `web/server/api/content/activity/[id].get.ts` 接入 `renderCachedMarkdown(content)`。
   - 活动是否可见/公开在 `readCachedActivity` 阶段已完成判决；未公开或下架的活动直接抛出 404，绝不绕过 404 权限检查。

---

## 3. 验证与测试凭据

### 专项测试用例 (`web/tests/public-markdown-cache.test.ts`)
1. `deduplicates 20 concurrent identical render requests (single-flight coalescing)`：20 个相同并发请求真实渲染仅执行 1 次，其余全部挂起复用。
2. `re-renders when markdown content changes`：内容修改时生成新摘要并重新渲染。
3. `re-renders when renderVersion changes`：安全规则或高亮版本升级时重新渲染。
4. `does not store errors in cache and allows subsequent retry`：失败时不缓存错误，后续重试能够正常渲染。
5. `evicts least recently used items when maxKeys or maxTotalBytes is reached`：LRU 淘汰机制与容量上限生效。
6. `renders oversized items on-demand without retaining them in cache`：超大 AST 项成功返回调用者但拒绝存入缓存。
7. `isolates returned AST objects so mutating results does not poison cached trees`：原地篡改返回值不污染后续请求。
8. `expires entries after ttlMs`：5 分钟 TTL 过期后重新触发渲染。
9. `produces identical sanitization, math and highlight results through cached render`：KaTeX 公式、Shiki 高亮与 XSS 清洗结果与底层 `renderSafeMarkdown` 完全一致。
10. `never bypasses unpublish visibility check: unpublished activity returns 404 without reaching or leaking cache`：活动取消发布后稳定 404，不被缓存绕过。

### 命令执行记录
```sh
$ pnpm --filter @guatswr/web exec vitest run tests/public-markdown-cache.test.ts tests/public-markdown-server.test.ts tests/public-markdown-parity.test.ts tests/public-data-cache.test.ts tests/public-cache-limits.test.ts
Exit code: 0 (5 passed, 44 passed)

$ pnpm --filter @guatswr/web test
Exit code: 0 (78 files passed, 898 tests passed)

$ pnpm typecheck
Exit code: 0 (shared, backend, web 全部 0 错误)

$ pnpm lint
Exit code: 0 (0 errors, 1 legacy warning in admin/history.vue)
```

---

## 4. 剩余风险与下一任务
- 剩余风险：无。所有并发与容量边界均通过严格单测断言。
- 下一任务：`WEB-02`（首屏并行与目录规模）。
