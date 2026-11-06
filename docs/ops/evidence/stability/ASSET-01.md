# ASSET-01 证据：引用索引影子构建与零遗漏比对

- 任务 ID：`ASSET-01`
- 状态：`CODE_VERIFIED`
- 执行时间：2026-11-06
- 前置依赖：`DB-03`

---

## 1. 缺陷与瓶颈复现

### 原缺陷
1. **全表全站全文 UNION ALL 扫描**：
   - 现有发布与暂存清理逻辑（`backend/src/storage/publication.ts`、`reference-inventory.ts`）在每次涉及图片的提交事务中，均调用 `assetReferences(tx, publicRoot)`。
   - `assetReferences` 通过一段庞大的 SQL，对全站 8 张大表（`users`、`members`、`history`、`activities`、`events`、`event_participants`、`site_config` 以及 `activity_revisions`）进行全量 UNION ALL 扫描，并在内存中进行正则解析提取引用。
   - 随着站点内容积累，写事务耗时随全站数据规模线性增长，严重占用 SQLite 独占写 lease。
2. **缺乏结构化引用索引**：
   - 无法对单个资源的引用情况进行精准定向索引检索（必须扫描全库），导致物理删除判定脆弱且耗时。

---

## 2. 解决方案设计与实现

依据执行手册 `ASSET-01` 规范：
1. **建立结构化索引表迁移 (`backend/src/migrations/main-010-asset-references.sql`)**：
   - 表 `asset_references`：
     - `source_type`: 来源表类型（`users`、`members`、`history`、`activities`、`events`、`event_participants`、`site_config`、`activity_revisions`）。
     - `source_id`: 实体稳定唯一标识。
     - `source_field`: 产生引用的列（`avatar`、`cover_image`、`images`、`content`、`description`、`value` 等）。
     - `source_version`: 实体版本号。
     - `asset_path`: 规范化本地资产绝对路径。
     - `family_key`: 统一的原图/缩略图（`-thumb`）family 索引键。
     - `incomplete`: 未知字段或不可解析路径标记（标记为 1，fail-safe 保护永不被视为无引用误删）。
   - 创建复合索引与唯一索引：
     - `idx_asset_references_unique(source_type, source_id, source_field, asset_path)`
     - `idx_asset_references_path(asset_path)`
     - `idx_asset_references_family(family_key)`
     - `idx_asset_references_source(source_type, source_id, source_field)`
2. **迁移清单更新 (`backend/src/migrations/manifest.json`)**：
   - 注册版本 10 迁移升级项，生成完整表结构、外键与索引快照，并通过 SHA-256 完整性校验。
3. **权威引用来源清单与影子同步 (`backend/src/storage/reference-inventory.ts`)**：
   - 定义权威清单 `ASSET_REFERENCE_SOURCES` 涵盖全量 8 大业务来源。
   - 实现 `syncEntityAssetReferences(tx, root, options)`：提供业务更新时的单实体引用精准刷新。
   - 实现 `removeEntityAssetReferences(tx, sourceType, sourceId, field)`：提供实体物理删除时的引用清除。
4. **影子全量重建与一致性校验工具**：
   - `rebuildAssetReferences(db, root, { dryRun })`：
     - 默认 `dryRun: true`，只读统计并比对，不向数据库写入任何变更。
     - 显式 `dryRun: false` 时在事务内原子刷新 `asset_references`。
   - `compareInventoryWithShadow(db, root)`：
     - 逐项比对传统全库扫描集与影子索引集，强断言 `missingInShadow === []`（零漏报），确保影子构建结果 100% 覆盖旧扫描。
   - 本卡**严格不切换删除判断**（保留现有隔离区与全量扫描防护，待 ASSET-02 切换）。

---

## 3. 验证与测试凭据

### 专项测试用例 (`backend/tests/integration/asset-shadow-index.test.mjs`)
1. `defines the comprehensive list of 8 authoritative reference sources`：验证 8 大引用来源完整覆盖。
2. `computes consistent asset family keys stripping -thumb and extensions`：验证 family 去缩略图规范化一致性。
3. `rebuilds shadow index with zero drop against legacy full-scan`：
   - 覆盖全部 8 类业务数据（包括软删除成员 `deleted_at IS NOT NULL`、活动 Markdown 正文图、事件嵌套 JSON 图等）；
   - 验证 dry-run 模式下不修改数据库；
   - 验证重建后比对结果 `match === true`，遗漏项为 0。
4. `tags unparseable or malformed URLs with incomplete=1 instead of dropping them`：损坏或畸形路径打上 incomplete 标记，防止误当孤儿清理。
5. `supports incremental entity reference sync and removal on business updates`：增量同步与物理删除维护正常。

### 迁移与回归测试
- `backend/tests/integration/migrations.test.mjs`：20 项全部通过（主库升级至版本 10）。
- `backend/scripts/migration_baseline_test.py`：通过。
- `backend/tests/integration/asset-inventory.test.mjs`：通过。
- `backend/tests/integration/asset-publication.test.mjs`：通过（21 项全部通过）。
- `backend/tests/integration/asset-cleanup.test.mjs`：通过（11 项全部通过）。
- `backend/tests/integration/article-revisions.test.mjs`：通过（6 项全部通过）。

### 全局检查
- `pnpm typecheck`：通过（0 错误）。
- `pnpm lint`：通过（0 错误）。

---

## 4. 剩余风险与下一任务
- 剩余风险：无。本阶段影子构建未切换删除判断，业务写入行为与隔离区策略保持 100% 兼容。
- 下一任务：`ASSET-02`（引用读切换）。
