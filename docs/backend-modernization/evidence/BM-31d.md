# BM-31d 剩余JavaScript业务收口（进行中）

31d开始时的31个legacy文件不能直接当作31个薄适配器。主要剩余业务包含event CRUD/list/detail、storage搬图与暂存清理、upload_visitor、publicLog/publicEvent投影、app中的sitemap查询，以及ban/limiter策略。已完成的auth/admin/config等JS只保留接线；生命周期/数据库资源装配的例外须逐项复核。全节点依赖BM-27文件补偿完成，不因此提前进入Express5。

## BM-31d1 封禁时长异常独立修复（输入3c40679）

先固定缺陷再改类型。对HEAD原ban模块在隔离子进程传Infinity，SQLite回调日期格式化抛RangeError（bm31d-ban-expiry-red-corrected.log，退出1）；仅合成banned_ips表及文档网段IP，未启动或触碰主服务。第一次红灯工具在uncaughtException中重入SQLite导致NAPI fatal，废弃该工具结论；改为只记录异常名并退出，再针对归档旧模块复现RangeError。

独立CJS缺陷修复：管理员minutes必须有限且换算后的日期在JavaScript Date范围，非法返回400；banIp内部端口在写库前拒绝Infinity/-Infinity/NaN/超范围并异步回调BAN_EXPIRY，避免原生回调内再抛日期异常。合法正数、0和负数的旧永久/过期语义保留，不改IPv4/IPv6身份或业务封禁规则。配置BAN_MINUTES/限流器的严格类型与启动校验归31d2。

新增2项真实DB回归覆盖4组HTTP非法时长、4组内部非法到期值、有限限时/0/负数永久封禁及服务仍可访问；Windows专项通过（bm31d-expiry-targeted.log）。完整Windows17+1939=1956通过、1项POSIX专用不适用；Linux17+1940=1957全通过（bm31d-expiry-windows/linux.log）。新生产镜像guatswr-backend-bm31d-expiry-runtime，manifest-list sha256:7406e64b625e1bcc145c9ab2db89f17c9ea9bf20aaadda10d4bd3fb781379d0b，在原生HTTP验证非法封禁400/无DB行、服务继续可用及现有会话撤销/可靠审计通过（bm31d-expiry-production-build/runtime.log）。本独立修复未重跑BFF/恢复，沿用31c完整证据；不标记31d全节点完成。

## BM-31d2 封禁/限流严格类型与生命周期（输入b759776）

封禁service/controller及4组限流器迁至strict TS，CJS只接线。保留原IP字符串、过期判断、永久reason、Bot前缀绕过、查询故障fail-open（新增固定诊断）、原429消息/窗口/默认上限、MemoryStore每实例隔离与shutdown释放。管理员ban/unban在主库事务内复核actor版本/角色，操作与BAN_IP/UNBAN_IP意图同事务；自动限流封禁使用受信服务器operator，无来自HTTP body的权限字段。回调适配及自动封禁工作纳入生命周期track，关闭等待已排队写入，避免响应429后数据库先关闭而漏存封禁。

配置前置：BAN_MINUTES须有限且可换算Date，保留合法有限负数/0/小数的既有行为；GLOBAL_RATE_LIMIT须非负安全整数（0行为保留）。原NaN/Infinity/非整数等误配置现在在创建数据目录前拒绝，只有键名出现在错误，不回显值。此为EX-21配置校验例外，等待期/依赖策略不变。

新增5项真实DB/HTTP专项：过期/永久/绕过、意图失败回滚与stale actor、实际超限自动封禁、非法配置无目录副作用、排队写入在shutdown前落库。Windows/Linux最终7项专项（含31d1两项）通过，BFF完整双会话链路1项通过，strict build/lint通过（bm31d-bans-final-targeted/final-targeted-linux/bff/lint.log）。完整回归及镜像结果待补。

最终完整回归：Windows17+1944=1961通过、1项POSIX专用不适用（bm31d-bans-windows-final.log），Linux17+1945=1962通过（bm31d-bans-linux.log；执行到该文件时已纳入第五项shutdown屏障，另7项最终专项复核通过）。初轮Windows在追加第五项前17+1943通过，最终已重跑全套，未混用数量。新生产镜像guatswr-backend-bm31d-bans-runtime，manifest-list sha256:211c671f2a7cfd9f570ace636b1c7cb595c95973a7767acd41506f36ce555c2f，无业务源码覆盖实际HTTP非法封禁拒绝、合法封禁/解封及主库审计意图、改密撤销/日志投递通过（bm31d-bans-production-build/runtime.log）。本节点未重跑完整恢复，沿用31c证据。31d仍有事件CRUD、公开投影与文件业务等待收口。

## BM-31d3 公开投影/游客入口/路径边界类型迁移（输入73a791b）

publicLog/publicEvent、guestGateway与storageBoundary迁至strict TS；CJS只保留工厂或纯包路径接线。TS业务直接导入对应typed模块，避免通过allowJs适配器重新落回any。保留4096字符界限、固定安全动作文本、线性token过滤、公开config白名单、递归私有字段/32层深度过滤、已有字段/NULL、原CIDR/XFF/常量时间bridge校验，以及同前缀/根目录/symlink安全规则。没有新API或schema变化，JS账本物理文件数量仍31，业务已从这4个位置移除；其余文件继续审查。

Windows17+1944=1961通过、1项POSIX专用不适用；Linux17+1945=1962全通过（bm31d-projection-windows/linux.log）。strict build/lint、真实BFF双会话完整链路通过（bm31d-projection-build/lint/bff.log）。新生产镜像guatswr-backend-bm31d-projection-runtime，无源码覆盖runtime-smoke及真实改密/封禁/可靠审计通过（bm31d-projection-production-build/runtime/native-security.log）。首次机械转换误给isInside调用处加类型注解，被TS构建拒绝后修正；未降低编译或测试门禁。未新增镜像恢复演练，本节点沿用31c恢复证据。下步事件CRUD与文件流程，未标记31d完成。
