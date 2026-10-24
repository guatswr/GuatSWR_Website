# BM-15f 后续依赖安全门禁修复

输入f5ab295。67ed1e7远程run40045189143的container通过，但Windows/Linux/real-bff在check:security失败。本地Node24/pnpm11隔离工作区复现6条未解决公告；不删除检查、不增加ignore或放宽已有backport策略。

上游修复与npm元数据核验：

| 包 | 锁定变化 | 发布时间UTC | 依据 |
| --- | --- | --- | --- |
| body-parser | 1.20.8 → 1.20.9 | 2026-10-22T11:38:27.889Z | [上游压缩请求公告](https://github.com/expressjs/body-parser/security/advisories/GHSA-27r3-jxmh-p828) |
| serialize-javascript | 7.1.2 → 7.1.3 | 2026-10-22T21:24:35.883Z | [上游函数序列化公告](https://github.com/yahoo/serialize-javascript/security/advisories/GHSA-m5mm-p8h7-m29v) |
| fast-uri | 3.1.8 → 3.1.9 | 2026-10-19T23:05:26.357Z | [上游scheme混淆公告](https://github.com/fastify/fast-uri/security/advisories/GHSA-w74x-v6f9-j3xg)；另3条同包公告由本次补丁关闭 |

均已满minimumReleaseAge1440，保持策略无例外。使用独立`.tools/bm31-security-refresh`更新锁文件，diff仅3包版本/integrity和对应引用。body-parser覆盖范围限`<2`，避免未来BM-32把Express5的2.x依赖强制降至1.x。主工作区node_modules没有重装。

新增3项上游回归，接入test:tooling及后端Windows/Linux/BFF CI：序列化跨函数拼接关闭script、percent/legacy-unescape scheme不得变为javascript、真实子HTTP进程压缩帧及延迟尾块结束后仍正常退出。旧依赖的前2项红灯可复现；第三项是进程存活/HTTP结束回归，当前Node24样本在旧版也通过，不将其冒充漏洞复现。第一次压缩请求测试构造缺少结束帧边界而超时，按上游1.20.8→1.20.9回归场景修正。新版fast-uri.resolve对坏scheme抛出malformed，断言保留此拒绝行为。

安装失败记录：首次新Windows工作区sqlite3 prebuild尝试写全局npm-cache被EPERM拒绝；改用任务内npm_config_cache后冻结安装及原生脚本成功，未调整系统权限。曾手动收窄override时误改锁文件依赖键，被pnpm拒绝；从HEAD原锁重新用pnpm生成，随后冻结检查通过，不保留手改锁。

Windows验证：安全审计0未解决（bm31-security-green.log，当前1条node-forge原始公告由既有已验hash/probe补丁缓解），新3项回归通过，tooling103/shared79/web730通过；后端17+1924=1941通过、1项POSIX专用不适用；全工作区typecheck通过。Linux、新Nuxt产物+BFF及生产镜像结果接续补入。

完成验证：Linux白名单干净安装、原生SQLite构建、新3项回归、后端17+1925=1942通过（bm31-security-linux-build/linux.log）；全工作区lint通过，前端保留1条既有history.vue v-html警告。使用修复后的serializer构建新Nuxt输出，真实BFF链路1项通过（bm31-security-web-build/bff.log）。新生产镜像guatswr-backend-bm31-security-runtime，manifest-list sha256:eb0f1e51ddb6fc3a500db0c2e77677ced1a39579ecfecc197f48260377d5c29c；无源码覆盖启动smoke及完整双库/public/quarantine恢复后应用HTTP通过（bm31-security-production-build/runtime/restore.log）。磁盘满注入本节点未重跑。远程精确SHA结果随后单列，本地完成不冒称远程绿灯。
