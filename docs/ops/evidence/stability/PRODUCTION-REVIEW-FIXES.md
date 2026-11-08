# PostgreSQL 测试、CI 与干净恢复修复验证

日期：2026-11-08。基线 `535c6e02ccc756e059dcc49da35958250f92730a`，本轮修改未提交。状态：CODE_VERIFIED（本地）；未 push、部署或连接生产。

## 修复范围

- 生产与开发保持纯 PostgreSQL。测试使用真实 loopback Docker、完整 schema 模板、每用例独立库和非 DDL 应用账号；故障注入有独立管理连接。初始化不再默默返回，也不从进程生产 URL 回退取迁移凭据。关闭异常时仍释放管理连接并删除本用例库。
- 生命周期、compiled runtime、启动漂移、管理员 bootstrap、审计、文件引用和并发测试改用 PG。SQLite WAL/本地文件启动/旧 adopt 运行时测试退役，由 PG store 契约、完整模式/lifecycle、失败/恢复回归替代；Windows 只排除原有 POSIX 进程组用例，不新增忽略名单。
- SQLite SQL/manifest/校验引擎原样归档在 scripts/postgres/legacy-sqlite，离线导出不再 require 已删除的 dist engine。另验证 30 表只读导出、未知字段拒绝、活动 WAL 拒绝和孤立外键拒绝。不会恢复 SQLite 应用模式。
- backend 构建先安全清理自身 dist，镜像也排除宿主 dist。真实 BFF 崩溃后保留 PG 草稿归属并可幂等重放。
- 新多池回归暴露独立 deleteAdmin 的并发检查竞态，已复用安全域事务锁；外层已授权事务保持原有锁语义。备份调度以可注入执行器验证路径/日期，真实备份在 release 和生产镜像中执行；宿主默认驱动与当前 PG 契约一致。
- CI 增加 postgres job，接入 scope 与最终 result；保留双平台纯单测，把业务/契约/生命周期和冷恢复放入 Linux PG job。生产容器门禁由旧 SQLite 专用探针换为真实非 root PG 应用、卷、dump/restore、登录/资源和恢复后写入。合成 UI 上游明确使用 memory，不冒充 PG 测试。
- README、架构、初始化、备份格式、账号权限和当前任务状态已统一；历史文档加版本边界。PG-07 原有生产记录保留，不将本地通过写成线上重新验收。

## 本地验证

| 检查 | 实际结果 |
| --- | --- |
| 完整 PG 业务/契约/真实 BFF/schema/lifecycle/release | 72 文件，2106 通过；Windows 原有 POSIX 排除 1；失败 0 |
| 最终 fixture 关闭异常/compiled runtime/lifecycle 回归 | 17 通过 |
| PG store 契约 | 23 通过；源清单检查另 1 通过 |
| 离线迁移/验包边界 | 11 通过 |
| 前端单测 | 80 文件，914 通过 |
| CI 自测 / tooling | 12 / 128 通过 |
| Python 运维/历史验包/检查/manifest | 24 / 20 / 9 / 2 通过 |
| 干净 backend 与 web 生产镜像 | 构建成功 |
| 非 root backend 生产镜像冷恢复 | 32 表、PG 序列及真实 public/隔离/日志字节恢复，候选登录和新增文章成功 |
| frontend 生产镜像 | SSR、nonce、公开内容、图片代理和 sourcemap 检查通过 |
| 类型 / lint / 边界 / 补丁 | 通过；lint 留有既有 history.vue 的 v-html 警告，0 错误 |

真实冷恢复先写入 PG、备份，再停止原应用，向新空库和新卷执行 pg_restore，启动新容器核验。sourceRevision 标为 workspace review，只供本地 review，不能当作已发布源码版本。未用旧编译产物或模拟 PASS 字符串替代恢复。

详细计数、镜像 ID、证据摘要及真实演练报告见 [机器记录](PG-CI-RECOVERY-20261108.json)。可复现命令与 CI 结构见 [测试手册](../../POSTGRESQL-TESTING.md)。

## 尚未声称的验收

没有提交或推送，所以远端 GitHub Actions 尚未针对本轮 diff 执行。本轮也没有复查生产在线状态、生产异地加密包取回解密/恢复、实际调度和告警投递；本地合成数据耗时不能用于承诺生产维护窗口。完整浏览器 E2E 和在线依赖审计保持现有 CI 门禁，本轮不以容器 HTTP 检查替代其结果。
