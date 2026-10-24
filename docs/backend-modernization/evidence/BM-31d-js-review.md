# BM-31d 最终JavaScript边界审阅

输入342592f；31个物理JS全部逐项登记。allowJs仍是CommonJS装配桥，checkJs=false未冒称全库严格TS；新业务文件strict/noUncheckedIndexedAccess/exactOptionalPropertyTypes，未关闭编译/lint门禁。保留物理包装文件避免同时改模块制式/全部require入口。

| 文件 | 当前归属与边界 |
| --- | --- |
| `src/app.js` | HTTP框架装配例外：mount、安全头/CORS、错误适配和定时器注册；业务查询均委托strict模块。BM32另验框架差异。 |
| `src/config/proxy.js` | CJS薄适配：只装配strict TS依赖、HTTP路由/中间件与错误转交；业务逻辑不由该JS实现。 |
| `src/lifecycle.js` | 平台装配例外：资源依赖、追踪、信号/监听/关闭；无领域SQL或业务身份决策。 |
| `src/middlewares/auth.js` | CJS薄适配：只装配strict TS依赖、HTTP路由/中间件与错误转交；业务逻辑不由该JS实现。 |
| `src/middlewares/ban.js` | CJS薄适配：只装配strict TS依赖、HTTP路由/中间件与错误转交；业务逻辑不由该JS实现。 |
| `src/middlewares/guestGateway.js` | CJS薄适配：只装配strict TS依赖、HTTP路由/中间件与错误转交；业务逻辑不由该JS实现。 |
| `src/middlewares/limiter.js` | CJS薄适配：只装配strict TS依赖、HTTP路由/中间件与错误转交；业务逻辑不由该JS实现。 |
| `src/middlewares/upload.js` | CJS薄适配：只装配strict TS依赖、HTTP路由/中间件与错误转交；业务逻辑不由该JS实现。 |
| `src/models/db.js` | 平台装配例外：包根/路径、原生连接、PRAGMA及迁移校验、审计适配；无import开库/DDL。BM33补部署路径隔离。 |
| `src/models/security.js` | CJS薄适配：只装配strict TS依赖、HTTP路由/中间件与错误转交；业务逻辑不由该JS实现。 |
| `src/routes/activities.js` | CJS薄适配：只装配strict TS依赖、HTTP路由/中间件与错误转交；业务逻辑不由该JS实现。 |
| `src/routes/admin.js` | CJS薄适配：只装配strict TS依赖、HTTP路由/中间件与错误转交；业务逻辑不由该JS实现。 |
| `src/routes/auth.js` | CJS薄适配：只装配strict TS依赖、HTTP路由/中间件与错误转交；业务逻辑不由该JS实现。 |
| `src/routes/bot.js` | CJS薄适配：只装配strict TS依赖、HTTP路由/中间件与错误转交；业务逻辑不由该JS实现。 |
| `src/routes/config.js` | CJS薄适配：只装配strict TS依赖、HTTP路由/中间件与错误转交；业务逻辑不由该JS实现。 |
| `src/routes/event.js` | CJS薄适配：只装配strict TS依赖、HTTP路由/中间件与错误转交；业务逻辑不由该JS实现。 |
| `src/routes/history.js` | CJS薄适配：只装配strict TS依赖、HTTP路由/中间件与错误转交；业务逻辑不由该JS实现。 |
| `src/routes/logs.js` | CJS薄适配：只装配strict TS依赖、HTTP路由/中间件与错误转交；业务逻辑不由该JS实现。 |
| `src/routes/members.js` | CJS薄适配：只装配strict TS依赖、HTTP路由/中间件与错误转交；业务逻辑不由该JS实现。 |
| `src/routes/upload.js` | CJS薄适配：只装配strict TS依赖、HTTP路由/中间件与错误转交；业务逻辑不由该JS实现。 |
| `src/routes/upload_visitor.js` | CJS薄适配：只装配strict TS依赖、HTTP路由/中间件与错误转交；业务逻辑不由该JS实现。 |
| `src/utils.js` | CJS薄适配：只装配strict TS依赖、HTTP路由/中间件与错误转交；业务逻辑不由该JS实现。 |
| `src/utils/backup.js` | CJS薄适配：只装配strict TS依赖、HTTP路由/中间件与错误转交；业务逻辑不由该JS实现。 |
| `src/utils/backupScheduler.js` | CJS薄适配：只装配strict TS依赖、HTTP路由/中间件与错误转交；业务逻辑不由该JS实现。 |
| `src/utils/bot.js` | CJS薄适配：只装配strict TS依赖、HTTP路由/中间件与错误转交；业务逻辑不由该JS实现。 |
| `src/utils/botHooks.js` | CJS薄适配：只装配strict TS依赖、HTTP路由/中间件与错误转交；业务逻辑不由该JS实现。 |
| `src/utils/imageUpload.js` | CJS薄适配：只装配strict TS依赖、HTTP路由/中间件与错误转交；业务逻辑不由该JS实现。 |
| `src/utils/publicEvent.js` | CJS薄适配：只装配strict TS依赖、HTTP路由/中间件与错误转交；业务逻辑不由该JS实现。 |
| `src/utils/publicLog.js` | CJS薄适配：只装配strict TS依赖、HTTP路由/中间件与错误转交；业务逻辑不由该JS实现。 |
| `src/utils/storage.js` | CJS薄适配：只装配strict TS依赖、HTTP路由/中间件与错误转交；业务逻辑不由该JS实现。 |
| `src/utils/storageBoundary.js` | CJS薄适配：只装配strict TS依赖、HTTP路由/中间件与错误转交；业务逻辑不由该JS实现。 |

proxy原CIDR规则逐行迁至strict security/proxy-policy，Bot三入口校验/错误响应迁至strict integrations/bot/controller；notifier输入类型如实接受既有wire nullable字段，仍按原规则转空字符串。没有改通知协议/新增自动hook。所有域路由均指向已有typed controller/service/repository；botHooks保持原禁用适配。后续增业务不得写入包装JS，check:legacy物理预算不得增长。

app内安全头/CORS与错误mask仍是HTTP装配代码，lifecycle/db资源管理仍需动态CJS原生库连接；这三项是明确审阅后的平台例外，不是遗漏的域迁移。最终回归继承BM27双平台1993/1994和真实BFF/镜像；本次新增边界检查build/lint、Windows/Linux各20专项通过。Express5本身及后续最终候选门禁独立，不由本报告替代。
