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

## BM-31d4 原生绑定复核（输入4cc8e00）

在事件类型化时核对sqlite3原生Statement::BindParameter及Windows/Linux直接SELECT参数，实测JSON对象和数组均绑定固定文本`[object Object]`，布尔值为0/1；不是NULL，也不是JavaScript String(array)。发现BM-22早先将structured school过滤器转NULL的假设错误：原fixture没有学校名恰为该文本的行，未能检出差异。新增含该历史学校名的真实DB用例先红（bm31d-member-binding-red.log），再恢复原生语义；不引入新业务协议或schema。

新增strict legacyJsonBinding，限定既有JSON/query输入边界，参数仍绑定而不拼SQL；members Repository的过滤值类型改为SqlValue。此修复与事件结构重构分开提交，后续Event复用同一已验证边界。成员专项及联合完整回归/独立镜像证据接续补入。

成员10项专项通过（bm31d-member-binding-targeted.log）。联合工作树（含后续事件类型迁移）完整Windows17+1948=1965、Linux17+1949=1966通过，Windows1项POSIX不适用（bm31d-events-binding-windows/linux.log），BFF完整链路通过。另单独构建仅绑定修复的生产上下文：恢复HEAD事件路由和单测夹具、移除尚未提交的3个事件TS源，镜像guatswr-backend-bm31d-member-runtime，manifest-list sha256:b77fb8b0d029dc0b428e8b36e507e436ae7db4c2ef5a40347318747b2ea1ebca；runtime-smoke与真实HTTP structuredSchool回归通过（bm31d-member-production-build/runtime/native-binding.log）。新增test-member-binding.cjs接入容器CI。此修复不宣称事件结构迁移已经提交或31d完成。

## BM-31d5 事件剩余CRUD类型迁移（绑定修复基线bbdcf7a）

事件draft/save/public-list/detail/admin-list/create/participants迁入strict repository/service/controller，原Signup/State服务保留，JS事件路由325行缩为纯接线。保留宽松输入、native JSON参数绑定、任意合法历史content值、status过滤回退/分页、作者及管理员私有详情、匿名公开投影、原通知触发点/默认no-op。未新增Event wire schema、唯一约束或状态收紧；save最终写锁中重查published/存在性仍有效。create仍先保留draft，文件成功后发布、准备失败丢弃保留行；文件跨资源补偿仍归BM-27，不在本节点冒充已完成。

新增3项真实DB回归：布尔/数值/对象/数组与native CAST参数对照、历史额外列与NULL内容/结构化type过滤/状态回退、真实目录故障后无已发布记录或成功审计。6项保存/审核/删除竞争屏障改为拦截SqliteStore初次SELECT，最终写锁复核不受拦截；17项bootstrap保持，旧纯单测更新DB端口与lastID，未用mock替代真实HTTP并发。9项新增/并发专项、原16项内容/状态/投影专项通过。完整Windows17+1948=1965、Linux17+1949=1966通过（bm31d-events-binding-windows/linux.log），Windows1项POSIX不适用；strict build/lint与BFF完整双会话链路通过。

新生产镜像guatswr-backend-bm31d-events-runtime，manifest-list sha256:e16ed019bdc87032a49b99528aa00e12ea9f4745fc3628e8145712c2b1dc2631，无源码覆盖原生runtime-smoke通过（bm31d-events-production-build/runtime.log），含直连游客拒绝/可信证明及管理内容保存链路。成员绑定独立生产镜像证据见前段。没有重跑全量恢复；剩余storage/upload及app中sitemap等业务继续，31d未完成。

## BM-31d6 sitemap查询与输出类型迁移（输入5d5da9f）

将app.js中的SQL、日期规则和XML拼接迁入strict TS sitemap控制器，应用保留HTTP装配。先在旧实现运行3项真实HTTP/SQLite用例，再用同一组验证新实现（bm31d-sitemap-legacy/targeted.log）：已发布/NULL状态可见、软删排除、date文本前缀与无效日期、原排序/XML转义、固定no-cache头、SITE_URL及原协议/Host回退、DB故障plain Server Error 500。未收紧日期或更改URL来源协议。

完整Windows17+1951=1968通过，1项POSIX不适用；Linux17+1952=1969通过（bm31d-sitemap-windows/linux.log），strict build/lint通过。新生产镜像guatswr-backend-bm31d-sitemap-runtime无源码覆盖runtime-smoke通过，已加入实际XML Content-Type及新活动URL验证（bm31d-sitemap-production-build/runtime.log）。本节点未重跑BFF/恢复，沿用31d5/31c对应证据。后续上传路径补验发现目录创建前缺边界检查，将独立修复，不把该未完成项藏入本纯类型节点。

## BM-31d7 上传目录副作用边界修复（输入ce38fd9）

旧visitor内容/头像入口最终moveVerifiedFile会拒绝越界，但先mkdir目标子目录：events根目录或某EID目录为指向public外的symlink/junction时，拒绝上传之前已在外部创建空目录。用合成目录与真实PNG multipart复现两项红灯（bm31d-upload-boundary-red.log）；不是文件内容已逃逸，也不声称已写出图片。新增mkdir前isSafePath检查，保持原HTTP500与清理策略，消除该目录副作用。此为已有路径边界修复补验，无新协议。

Windows夹具使用已知绝对fixture根内的链接路径，PowerShell核验LinkType后以LiteralPath/无Recurse移除链接，再运行普通fixture清理；初次直接依赖Node lstat出现与原生junction信息不一致、遗留链接导致ENOTEMPTY，已修正夹具，不递归删除junction树。Linux仍lstat确认后unlink，未跳过测试。

两项专项及完整Windows17+1953=1970、Linux17+1954=1971通过（bm31d-upload-boundary-targeted/windows/linux.log），Windows1项POSIX不适用；真实BFF完整链路通过。新生产镜像guatswr-backend-bm31d-upload-boundary-runtime的原生runtime-smoke通过（bm31d-upload-boundary-production-build/runtime.log），正常内容/头像路径不改。未重跑完整恢复；上传类型迁移、文件发布补偿及保留策略继续，未关闭整个31d/BM-27。

## BM-31d8 上传/图片/multipart类型迁移（输入ae13d74）

管理员与游客内容/头像上传、图片验证/缩略图/发布、Multer配置与请求计数迁入strict TS，4个JS位置只保留接线。保留MIME/扩展名、50MiB/parts/fields/8 HTTP请求限制、40MP与200页、SVG不生成缩略图、Cache files=0、EXDEV复制与私有验证先行、URL/消息、EID状态/凭据及原生参数绑定；目录创建前边界检查沿用31d7。上传控制器工作纳入应用track，关闭等待已进入控制器的异步工作。未实现后续BM-27的跨资源文件补偿，不声称所有文件操作已原子。

Windows17+1953=1970通过、1项POSIX不适用；Linux17+1954=1971通过（bm31d-uploads-windows/linux.log），strict build/lint与真实BFF完整链路通过。新生产镜像guatswr-backend-bm31d-uploads-runtime，manifest-list sha256:4ff6e102f774086f1af0ed6d836af57db3beda384b4455e9c6e67556230209ab，无业务源码覆盖runtime-smoke通过（bm31d-uploads-production-build/runtime.log）。本节点未重跑完整恢复。

新增资源生命周期实测（非本纯类型变更）：8个multipart已解析、后台工作被屏障暂停的真实TCP客户端断开后，原计数释放，允许第9个工作进入（bm31d-aborted-upload-red.log，activeWork=9、heldLimit=false）。源码原HTTP计数不能代表实际图片工作上限，须31d9独立修复与回归，不将这一已知缺口写为完成。

## BM-31d9 上传工作槽位生命周期修复（输入379e244）

解析成功后槽位由controller finally显式释放，客户端close/aborted仅在解析期释放，不再让仍运行的上传处理提前腾出容量。已经aborted/destroyed的请求不启动parser；解析结束发现已断开则删除该请求的私有文件并停止后续处理。容量仍8、既有429消息不变，非异常客户端的URL/字段/大小/格式规则不变；EX-22登记此资源限制修复。

使用真实Multer磁盘解析和TCP断开、受控处理工作屏障复现与验证；不把合成parser字节称为通过Sharp的真实图片。3项专项验证已关闭入口不解析、8个处理中的断开客户端仍占槽、第9个429、完成释放后再次200及私有文件清空。此前红灯activeWork=9，现原生生产检查activeWork=8、heldLimit=true；新增8秒上限的test-upload-work-ownership.cjs接入容器CI。

完整Windows17+1956=1973通过，1项POSIX不适用；Linux17+1957=1974通过（bm31d-upload-lease-windows-final/linux-final.log）。strict build/lint、BFF完整链路通过。新生产镜像guatswr-backend-bm31d-upload-lease-runtime，manifest-list sha256:daf71a819ee15c539068619a28d356acb1d55624ac54753f70e1275a2202ce5c；无源码覆盖真实TCP断开资源检查与runtime-smoke通过（bm31d-upload-lease-production-build/native/runtime.log）。完整恢复本节点未重跑。剩余storage和BM-27补偿/引用保留继续，31d尚未完成。

## BM-31d10 搬图与通用帮助函数类型迁移（输入c94bea3）

storage.js搬图/配对缩略图/请求缓存/日期与config目录/暂存清理及utils.js的JSON/校验帮助函数迁入strict TS，JS仅保留接线。TS描述输入未知值、泛型透传和Schema safeParse结果；没有新增直接Zod依赖或靠主目录hoisted包解析。保持既有文件行为，BM-27的移动前后补偿、保留引用与进程中断缺口继续开放；不能将纯类型迁移写成文件事务已经完成。

strict构建首次发现日期捕获组可为undefined，补显式组存在检查；lint发现旧destPath冗余赋值，删除无用赋值，不关闭规则。现有17项bootstrap及30项unit通过，完整Windows17+1956=1973、Linux17+1957=1974通过（bm31d-files-windows-final/linux-final.log），Windows1项POSIX不适用；BFF完整链路、lint通过。新生产镜像guatswr-backend-bm31d-files-runtime，manifest-list sha256:5c23d800f0d7348dfaea57a5903c478875d352f847a83753390dc49cf6cf796a，原生runtime-smoke通过（bm31d-files-production-build/runtime.log）。本节点未重跑完整恢复。

JS账本物理文件仍31，auth/ban/limiter/upload及所有域路由主要为薄适配；app/lifecycle/models-db为平台资源装配。config/proxy及最终适配边界还需逐项检查。31d整体依赖BM-27退出条件，目前仍IN PROGRESS，随后从文件一致性实施接续。
