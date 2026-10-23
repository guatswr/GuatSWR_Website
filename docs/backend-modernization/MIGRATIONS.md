# 数据库迁移运行手册

当前版本：main 001 / audit 001。所有命令在仓库根目录执行，使用 Node 24.16.0、pnpm 11.25.0；先运行 `pnpm --filter @guatswr/shared build` 和 `pnpm --filter guiair-backend build`。生产镜像已经包含编译结果，可在 `/app` 使用 `node dist/src/migrations/cli.js` 替代下面的 pnpm 入口。

正常应用启动要求两个数据库已存在且账本、SQL checksum、完整结构指纹匹配。启动不执行 CREATE / ALTER，也不会补齐缺失索引。未迁移的旧库必须先显式接管；缺库或漂移会终止启动。BM-31a已将SUPER_ADMIN初始化移到显式命令；常规启动不创建或重新提升账户。

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

## 首位管理员显式初始化（BM-31a）

完成数据库initialize/adopt并确认check成功后，在后端目录使用当前Node24构建产物执行：

```powershell
pnpm --filter guiair-backend build
# SUPER_ADMIN_USERNAME / SUPER_ADMIN_PASSWORD由操作者安全注入当前进程环境，不写入命令参数或Git。
pnpm --filter guiair-backend admin:bootstrap --main-db E:\explicit\data\guatswr_web_main.db
```

命令仅打开显式绝对路径已有数据库，不创建缺失数据库或自动迁移；结构漂移会拒绝。用户名1～50位ASCII字母/数字/下划线/连字符；密码6～100字符且UTF-8不超过72字节，避免bcrypt静默截断。环境变量仍可保留供该命令使用，但常规server启动不再消费它们初始化账户。

首次创建返回created；同名super_admin重复执行返回unchanged，不重置密码。已有其他super_admin时拒绝新建首位管理员，同名非super_admin也拒绝，不用此命令恢复/提升已有用户权限。错误输出为固定文本，不打印凭据。此行为改变用于关闭重启提权漏洞；回退旧启动代码会重新引入风险，不能在生产仍配置旧凭据时盲目回退。

## 显式增量升级（BM-27b1）

已有账本数据库使用 `pnpm --filter guiair-backend db:migrate upgrade --data-dir <绝对目录>`；自定义--main-db/--audit-db规则不变。upgrade只打开已有文件，不创建缺库；无账本须先走显式adopt。正常启动与check不执行升级，旧版本或未来未知版本均拒绝。

每个数据库manifest保留原version1/file/sha256/shape，可增加upgrades数组，版本必须从2连续递增；每项声明独立SQL文件、SHA256和累积shape。当前只支持保留既有列、索引及外键定义的Expand路径；新项不得删掉旧shape中的要求。所有文件先验hash，再开始写事务。v1 SQL与checksum不能修改来假装升级。

一次数据库upgrade在BEGIN IMMEDIATE内校验当前账本所有版本/checksum、最新实际schema指纹与结构，依次执行待应用脚本/校验新结构/追加账本；任一失败回滚全部本次待升级步骤。历史行不改写，新行记录该版本的schema指纹。历史schema_hash只做格式检查，实际数据库只可与最后一行比对；账本不是防数据库管理员篡改的密码学审计。重复upgrade无待执行项时不重放SQL。

新空库initialize会执行baseline和全部已声明升级并原子提交；未登记旧库adopt先验证原指纹及v1核心结构，再同事务执行已声明增量。已有账本时initialize/adopt不替代upgrade。主/审计两库仍分别提交，部分成功后核查两库并显式重试，不能用旧快照覆盖已成功库。

本节点仓库真实manifest仍只有v1，v2仅存在于合成测试。旧v1应用校验器会拒绝v2账本，不能据“SQL兼容”宣称可直接回滚旧镜像。首次真实v2发布前必须确定兼容部署/回退版本并独立验收；此节点未升级原库。
