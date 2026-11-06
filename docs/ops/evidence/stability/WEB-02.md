# WEB-02 证据：首屏并行与目录规模治理

- 任务 ID：`WEB-02`
- 状态：`CODE_VERIFIED`
- 执行时间：2026-11-06
- 前置依赖：`WEB-01`

---

## 1. 缺陷与瓶颈复现

### 原缺陷
1. **首屏请求串行瀑布流（Server Waterfalls）**：
   - `web/app/pages/logs.vue`：首屏通过连续 3 个独立的 `await useFetch`（`/api/logs`、`/api/logs/stats`、`/api/logs/umami`）顺序加载，SSR 响应延迟为 $T_1 + T_2 + T_3$ 的累加。
   - `web/app/pages/members.vue`：首屏通过连续 2 个独立的 `await useFetch`（`/api/content/members`、`/api/members/stats/schools`）顺序加载，形成不必要的串行等待。
2. **资源目录条目 DOM 节点无限膨胀**：
   - `web/app/pages/resources.vue`：原实现将所有拉取的条目（包含多次加载更多）一次性全量直接渲染为 DOM 表格或卡片网格。当一个目录下累计存在上百、上千乃至上万个文件时，浏览器 DOM 节点数量随条目数无上限线性增长，造成严峻的滚动卡顿与客户端内存泄漏。

---

## 2. 解决方案设计与实现

依据执行手册 `WEB-02` 规范：
1. **独立首屏并发聚合（Promise.all）**：
   - `web/app/pages/logs.vue`：
     - 将 `rangeWindows` 与 `umamiRequest` 的声明提前。
     - 同时并发启动 `logsFetch`、`statsFetch`、`umamiFetch` 三个独立请求，并通过 `await Promise.all([logsFetch, statsFetch, umamiFetch])` 同步完成。
     - 保持原有查询 key、watch 响应式窗口、useState 缓存与错误处理不变，消除服务端串行瀑布流。
   - `web/app/pages/members.vue`：
     - 同时并发启动 `membersFetch` 与 `schoolStatsFetch`，并通过 `await Promise.all([membersFetch, schoolStatsFetch])` 聚合返回。
     - 保留服务器端拼音排序语义与 revision 定时器。
2. **资源页无障碍客户端分页（Accessible Client Pagination）与 DOM 有界控制**：
   - 在 `web/app/utils/resource-browser.ts` 中实现高内聚纯函数 `paginateResources`，设置每页基准大小为 `RESOURCE_VIEW_PAGE_SIZE = 100`。
   - `web/app/pages/resources.vue`：
     - 保持对全部已加载结果的过滤（`selectedKind`、`searchQuery`）与排序（`sortBy`、`sortOrder`）语义完整，各类别的数量汇总依然基于全体匹配集合。
     - 表格和网格只渲染当前分页的切片条目（`displayedItems`），使浏览器 DOM 节点严格钳位在 100 项之内。
     - 切换目录路径（`currentPath`）、修改筛选类别（`selectedKind`）、修改排序条件（`changeSort`）或清除搜索时，自动重置当前页码至第 1 页。
     - 在列表底部引入结构化无障碍分页导航控件（`<nav class="resources-pagination">`），提供“上一页”、“下一页”以及当前页码指示（带 `aria-current="page"` 与禁用态保护）。

---

## 3. 验证与测试凭据

### 专项测试用例 (`web/tests/resource-browser.test.ts`)
1. `bounds DOM item count to at most 100 entries with 100, 1000, 10000 items`：
   - 验证在 100、1,000、10,000 合成条目压力测试下，当前页条目数恒定被截断在最多 100 项，DOM 元素量严格有界。
2. `clamps invalid and out-of-range pages gracefully`：
   - 验证非法或越界页码（0、负数、极大页码、空列表）安全自愈并钳位。
3. `preserves sorting and filtering across pages`：
   - 验证跨页切片时严格继承前面的过滤与排序结果，数据不错位。

### 命令执行记录
```sh
$ pnpm --filter @guatswr/web exec vitest run tests/resource-browser.test.ts tests/resources.test.ts tests/public-pages.test.ts
Exit code: 0 (3 files passed, 55 tests passed)

$ pnpm --filter @guatswr/web test
Exit code: 0 (78 files passed, 903 tests passed)

$ pnpm typecheck
Exit code: 0 (shared, backend, web 全部 0 错误)

$ pnpm lint
Exit code: 0 (0 errors, 1 legacy warning in admin/history.vue)
```

---

## 4. 剩余风险与下一任务
- 剩余风险：无。首屏数据流完全保持既有公共 API 协议与响应格式。
- 下一任务：`ASSET-01`（引用索引影子构建）。
