# BM-04e Workspace 前的兼容依赖补丁

输入：6a8dbcd56e1cb796bfcbbb5e7f00969bcf176187；该提交远程run39894871767全通过（包含BM-14双产物和Compose修正）。2026-10-23。

正式registry的完整npm audit初轮为18项：critical1/high14/moderate3。更新现有semver范围内的锁版本后，剩5个开发依赖关联；再将开发工具nodemon2升级到精确3.1.14，剩3项，均源自braces3.0.3的GHSA-vfj7-8cjw-p6xm（经chokidar/nodemon传播）。完整原始结果见BM-04e-audit.json；生产omit=dev审计为0，原始结果见BM-04e-production-audit.json。不能把生产0宣称为全依赖0。

主要锁版本：Express4.22.3、body-parser1.20.9、qs6.16.1、path-to-regexp0.1.13、js-yaml4.3.2、tar7.5.22、node-gyp12.4.0。保持Express4和sqlite3 5.1.7（嵌入引擎仍3.44.2）、sharp0.35.5。没有audit fix --force，没有合并Express5/SQLite驱动主版本升级。npm更新使用本机Node22 launcher --ignore-scripts；实际运行验证为Node24，干净安装另在容器完成。

Windows Node24 typecheck/lint/build及17+228=245测试全部通过，真实新Nuxt BFF1项通过。Linux Node24干净npm ci、typecheck/lint/build和245项通过；开发nodemon启动/触碰隔离TS文件后的重编译与HTTP重启通过，dev显式使用SIGTERM；prune后正常/超时退出和双库integrity通过。最终开发watch脚本的增量日志解析修正后独立再次通过。日志 .tools/bm04e-{windows-test,bff-test,linux-build,linux-test}.log。

剩余开发依赖问题在BM-15统一采用仓库已登记、带源文件哈希和攻击探针的braces补丁；当前独立npm安装尚未应用，不能提前称已缓解。候选发布仍受统一安全门禁约束。

BM-12补充：Compose整目录挂载遮盖dist已在6a8dbcd修正并推送，见BM-12-compose.md；仅语法验证，未操作运行服务。回退本节点恢复package和npm锁，运行数据未改变。
