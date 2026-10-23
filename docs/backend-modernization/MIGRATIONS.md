# 数据库迁移运行手册

当前版本：main 001 / audit 001。所有命令在仓库根目录执行，使用 Node 24.16.0、pnpm 11.25.0；先运行 `pnpm --filter @guatswr/shared build` 和 `pnpm --filter guiair-backend build`。生产镜像已经包含编译结果，可在 `/app` 使用 `node dist/src/migrations/cli.js` 替代下面的 pnpm 入口。

正常应用启动要求两个数据库已存在且账本、SQL checksum、完整结构指纹匹配。启动不执行 CREATE / ALTER，也不会补齐缺失索引。未迁移的旧库必须先显式接管；缺库或漂移会终止启动。当前 SUPER_ADMIN 环境变量仍保留旧版初始化/提权行为，拆离归 BM-31；“只校验版本”仅指 schema 管理。

## 新的空环境

先创建实际绝对数据目录，例如 Linux `/srv/guatswr/data` 或 Windows `E:/staging/guatswr/data`。然后：

```sh
pnpm --filter guiair-backend db:migrate initialize --data-dir /srv/guatswr/data
pnpm --filter guiair-backend db:check --data-dir /srv/guatswr/data
```

只有空数据库可以 initialize；非空旧库不能用此命令补表。重新执行时，已经完成的库只检查账本，返回 `applied:false`。应用的 DATA_DIR 必须指向同一目录。

## 历史库接管

1. 先制作并验证恢复点，在复制件演练。发布恢复点必须覆盖双库、public 和 manifest，并在受控停写窗口采集；单库在线快照不能证明整个系统处于同一业务时点。BM-17 的诊断副本不等于完整恢复包。
2. 对复制件运行 inspect，复核完整私有 DDL、核心字段、默认值、索引、FK、扩展表/列及数据质量。未知扩展必须保留；禁止仅因结构能匹配就认定来源正确。
3. 使用本次 inspect 返回的两个 `fingerprint` 显式 adopt，然后 check。不要使用 BM-17 Python 报告中的 schema hash，两种报告的序列化格式不同。

```sh
pnpm --filter guiair-backend db:inspect --data-dir /srv/guatswr/copy
pnpm --filter guiair-backend db:migrate adopt --data-dir /srv/guatswr/copy --main-fingerprint MAIN_SHA256 --audit-fingerprint AUDIT_SHA256
pnpm --filter guiair-backend db:check --data-dir /srv/guatswr/copy
```

adopt 不改业务表，仅在单库事务内校验并写入独立迁移账本。核心列/索引/FK不匹配、完整性或外键检查失败会回滚。历史 bio、NULL tags、旧审计表、AUTOINCREMENT 序列均保留。结构清单来自复制件的 SQLite 原生内省；Drizzle 查询/驱动依 ADR-17 留在 BM-37/38 的条件评估，不引入第二套迁移账本或 db push。

## 自定义数据库文件

CLI 不隐式读取 DB_PATH / LOG_DB_PATH，必须传入实际绝对文件名。这两个选项对四种命令都有效；相同路径或指向同一 inode 的别名会被拒绝。

```sh
pnpm --filter guiair-backend db:check --data-dir /srv/guatswr/data --main-db /srv/guatswr/data/custom-main.db --audit-db /srv/guatswr/audit/custom-log.db
```

创建目录由操作者明确完成。应用 DB_PATH / LOG_DB_PATH 的相对值以 DATA_DIR 为基准，需先解析为 CLI 的绝对路径。inspect/check 使用只读连接，缺失文件不会被创建。

## 双库部分完成与故障处理

main 与 audit 各自 BEGIN IMMEDIATE / COMMIT，不存在跨文件原子提交。CLI 按 main、audit 顺序输出 JSON 状态；返回非零时保留输出并分别检查两个文件。若 main 已成功、audit 失败，修复 audit 的明确原因后，用同一组文件及已复核指纹重试原命令；main 会检查后跳过，audit 才执行。先在复制件证明恢复路径，再操作发布环境。

`MIGRATION_REQUIRED` 表示缺少账本；`MIGRATION_SCHEMA_DRIFT` 表示当前结构与已接管指纹不同；版本/checksum 错误必须核对实际部署产物与迁移历史。禁止删除账本、编辑 checksum、盲目重新 adopt 或运行自动补表来消除错误。应保留失败现场，在新目录恢复已验证备份并按发布流程回退。CLI 的受控错误不会输出业务行或 SQL 原始错误。

目前实测仅对本地历史数据的复制件完成 adopt；原始库、现有服务和流量尚未切换。正式切换继续受 BM-35/36 发布门禁约束。
