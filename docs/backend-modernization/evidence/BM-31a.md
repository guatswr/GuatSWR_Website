# BM-31a 显式管理员初始化

2026-10-24，输入7c282ec。按Plan2.1前移执行。常规createDatabase移除SUPER_ADMIN创建/提权；保留环境名称供显式命令使用，不修改已有用户、密码或token版本。

新增严格TS bootstrapAdministrator及CLI，须传--main-db绝对路径、已有文件且main迁移校验通过；不创建数据库或自动迁移。bcrypt计算在事务外；事务内检查已有同名与其他super_admin再插入。已有同名super_admin幂等返回unchanged且不改hash；已有普通用户拒绝提升；已有其他super_admin拒绝再做首位初始化。用户名沿用ASCII规则，密码另拒绝UTF8超过72字节以避免bcrypt截断。凭据仅从进程环境读取，输出固定结果/错误，不在命令参数或日志暴露。

五项真实SQLite/CLI专项通过：遗留环境启动不新增/提权、显式创建/幂等/不重置、并发首位创建唯一、无效凭据、绝对路径/缺库拒绝与输出脱敏。完整回归/生产产物结果在提交前补充。使用手册见MIGRATIONS.md。回退旧启动代码会恢复提权风险，不能将旧版视为无条件安全回退。

BM-31其余类型化、账户撤销及安全审计outbox仍未完成。本节点未接触原始库或生产流量。

完整后端Windows/Linux各17项bootstrap+1873项Vitest=1890项通过（bm31a-windows.log、bm31a-linux.log）；strict build/lint及专项5项通过。新白名单生产镜像guatswr-backend-bm31a-runtime构建成功，无源码覆盖运行新增显式CLI创建/幂等和既有HTTP smoke通过（bm31a-production-build.log、bm31a-production-runtime.log）。此节点未单独重跑BFF。
