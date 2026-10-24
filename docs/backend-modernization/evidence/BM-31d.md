# BM-31d 剩余JavaScript业务收口（进行中）

31个legacy文件不能直接当作31个薄适配器。主要剩余业务包含event CRUD/list/detail、storage搬图与暂存清理、upload_visitor、publicLog/publicEvent投影、app中的sitemap查询，以及ban/limiter策略。已完成的auth/admin/config等JS只保留接线；生命周期/数据库资源装配的例外须逐项复核。全节点依赖BM-27文件补偿完成，不因此提前进入Express5。

## BM-31d1 封禁时长异常独立修复（输入3c40679）

先固定缺陷再改类型。对HEAD原ban模块在隔离子进程传Infinity，SQLite回调日期格式化抛RangeError（bm31d-ban-expiry-red-corrected.log，退出1）；仅合成banned_ips表及文档网段IP，未启动或触碰主服务。第一次红灯工具在uncaughtException中重入SQLite导致NAPI fatal，废弃该工具结论；改为只记录异常名并退出，再针对归档旧模块复现RangeError。

独立CJS缺陷修复：管理员minutes必须有限且换算后的日期在JavaScript Date范围，非法返回400；banIp内部端口在写库前拒绝Infinity/-Infinity/NaN/超范围并异步回调BAN_EXPIRY，避免原生回调内再抛日期异常。合法正数、0和负数的旧永久/过期语义保留，不改IPv4/IPv6身份或业务封禁规则。配置BAN_MINUTES/限流器的严格类型与启动校验归31d2。

新增2项真实DB回归覆盖4组HTTP非法时长、4组内部非法到期值、有限限时/0/负数永久封禁及服务仍可访问；Windows专项通过（bm31d-expiry-targeted.log）。完整Windows17+1939=1956通过、1项POSIX专用不适用；Linux17+1940=1957全通过（bm31d-expiry-windows/linux.log）。新生产镜像guatswr-backend-bm31d-expiry-runtime，manifest-list sha256:7406e64b625e1bcc145c9ab2db89f17c9ea9bf20aaadda10d4bd3fb781379d0b，在原生HTTP验证非法封禁400/无DB行、服务继续可用及现有会话撤销/可靠审计通过（bm31d-expiry-production-build/runtime.log）。本独立修复未重跑BFF/恢复，沿用31c完整证据；不标记31d全节点完成。
