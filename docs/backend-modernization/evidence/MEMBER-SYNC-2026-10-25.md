# QQ 群成员同步实现与验收

这是 v2.0.0 之后新增功能的实现记录，不改变冻结发行证据。本记录形成于功能提交前；尚未发行、迁移原数据库、部署或向真实 AstrBot/QQ 发送消息。插件按 [对接协议](../../../backend/docs/MEMBER-SYNC.md) 后续实现。

## 交付

- main5 显式 Expand：成员 QQ 唯一约束、人工跟随开关、同步隐藏/保护、资料状态，以及持久设置、群代次、请求、不可变批次、头像任务、群关系、资料待办和成员版本触发器。原成员 ID 和资料保留，未关联 QQ 的旧记录仍可用。
- 38 个 Bot 操作和公共 `/api/members/revision`（机器文档共 39 个），新增回传接口要求 members:sync，实际私信回执要求 deliveries:ack；任务绑定凭据/群/配置代次，角色、撤销和管理员接收身份实时校验。
- 默认关闭。默认周期六小时，持久化下一次执行时间，同群活动任务唯一；采集调度与网络投递分离。十分钟采集期限，首次预览或异常快照二十四小时核验；失败/部分数据不清空当前名册。
- 全批校验后事务提交名册、群关系、版本和私信意图；QQ 跨群去重，不按名字猜测旧身份。连续两次完整缺席才标记离群；只隐藏自动维护、未受保护且已离开全部受管群的记录，不删除资料或恢复人工删除记录。
- 头像原始字节不超过 2MiB、真实 PNG/JPEG/WebP，16MP 解码上限，转换为 256px WebP；不接收任意下载 URL，拒绝伪装 SVG。复用存储边界与文件事务异步发布，每轮最多处理 20 个；故障保留旧头像。已知原始图片校验值可供插件省略未变化的头像。
- 新成员资料待办和私信意图持久化，同一轮汇总、最多列出 50 人；Webhook 2xx 与实际发信回执分开。十分钟无回执记失败，迟到成功可以纠正；接收人降权/解绑或凭据撤销时取消发送，资料待办不消失。
- 管理页可设置周期/群/Bot/管理员，查看快照并按 QQ/群名片分页搜索，选择已有档案关联 QQ，再核验应用；支持待完善筛选、人工跟随开关和保护。公开成员页不暴露 QQ，后台正常编辑可关闭对应跟随。
- 成员版本涵盖全部合法写入口；BFF 成员列表、排序、学校统计按版本分开缓存，版本探测合并为五秒读，后台写即时失效；可见页面每六十秒检查变化。兼容旧后端 404，不把 403/故障当作旧版本。

## 环境

Windows Node24.16.0 / SQLite3.44.2 / sharp0.35.5。源码和验证产物位于忽略的 `.tools/bot-platform`；依赖来自已有隔离安装，与当前锁文件规范化后相同，没有原地重装主工作区依赖。TEMP/TMP、双库、资源、接收端及端口均隔离；Python 指定 BACKUP_NODE_BIN=Node24。

保留用户原有两个 BFF IP/Cookie 修改与 googlebot 脚本。旧开发服务未启停。所有成员、QQ、凭据和接收器都是测试夹具；没有把真实原库、成员信息或密钥写入证据。

## 失败与修复

1. 初次 main5 在既有投递表添加新外键，触发原迁移引擎“不改变旧外键集合”的保护。改为接收人 ID 标量列，发送前通过绑定表和当前管理员身份复核；原有外键/校验没有放松。
2. 新升级用例在已建立 main4 账本后再 ALTER bio，被 schema drift 正确拒绝。改为先构造带历史列的 v1，再按真实流程显式 adopt→main4→main5；旧行、旧账本和 Bot 投递数据保持验证。
3. Windows 工作者中 async lstat 将刚创建的 junction 报成普通目录，导致“仅当 isSymbolicLink 才清理”的测试清理分支跳过。探针确认后，改为在独立别名上测试真实存储边界，保留应用已打开的 upload 目录，并非递归删除该测试刚创建的精确链接（Windows rmdir / POSIX unlink）。仍断言服务拒绝暂存、私有目标无新文件，未跳过或放宽安全断言。
4. shared ESM 构建入口遗漏独立 Bot 文件，旧目录的残留 ESM 产物掩盖问题。加入 tsconfig.build 的明确入口，并另建无 dist 的目录重新构建、打包和验证 ESM/CJS/声明。清理旧隔离 dist 的命令被自动审批策略拒绝，保留原目录，未绕过审批删除该目录。
5. 前端原冻结接口扫描器只识别 CJS literal routes，新增八个 BFF 映射被拒绝。补充实际 Bot→typed API→member-sync 路由挂载链验证，再扫描真实 TS 路由声明；不把新路径写进假 fixture 或跳过原 71 操作检查。

保留中间失败日志。已有 POSIX 不适用跳过仍明确统计，未把定向成功数和全量数重复相加。

## 验证记录

主验证命令：shared ESM/CJS build、strict typecheck、ESLint；backend strict build/ESLint、17 个 Node 启动测试和全量 Vitest；Nuxt typecheck/build、web 全量 Vitest；真实 Nuxt+BFF→Express 与独立 Playwright Chromium UI；Python 备份/恢复/检查；独立无源码 shared tarball 消费。

关键证明：

- main4 中已有 Bot 凭据、投递和历史 bio 列升级后保留；QQ 唯一索引与版本触发器实际执行。
- 重复批次同内容幂等、不同内容冲突；批次缺失、重复QQ、失效配置、撤销、人数不符和空快照均不半批更新。
- 私信意图持久化失败时成员、版本和任务一起回滚；群角色不会变成网站管理权限。
- 本地 HTTP 接收器区分 service command 与 private notification，真实回执独立于 HTTP ACK。
- 真实 BFF 使用 Cookie/CSRF、网站超级管理员核验及 UUID 参数白名单，成员 QQ 只出现在私有响应；新的 Bot 快照绕过 BFF 写入口后，预热公开缓存仍收敛更新。
- Chromium 真实操作：网站登录→快照对照→旧档案 QQ 关联→应用→补学校/人工昵称→资料完成→公开页可见且不含 QQ。截图 `.tools/bot-platform/member-sync-ui.png`，未作为视觉审批或整站无障碍验收。

最终数量和产物见下方收口记录。本轮没有执行 Linux/容器、远程 CI、全部跨设备 E2E 或外部插件联调；测试不代表生产容量/SLA。

## 最终收口

| 验证 | 结果 |
| --- | --- |
| 后端全量 Vitest | **2039 通过，1 项既定 Windows/POSIX 不适用跳过；58 文件通过** |
| Node 启动/生命周期 | 17/17 |
| 网站全量单测 | **743/743，57 文件通过** |
| shared 单测 | 79/79 |
| 后端/shared strict 类型与 ESLint | 通过，零错误/零警告 |
| Nuxt typecheck 与生产构建 | 通过 |
| 网站 ESLint | 0 错误；1 条既有、已审阅的 history.vue 净化 HTML 提示 |
| 最新产物真实 BFF 专项 | 1/1，含绕过 BFF 的后续 Bot 自动快照使预热缓存收敛 |
| 最新产物 Chromium UI 专项 | 1/1，实际操作 QQ 对照关联、核验应用、资料完善和公开页 |
| Python 备份/数据检查/迁移基线 | 20/20、9/9、2/2 |
| 无 dist 残留的 shared 干净构建和无源码 tarball 消费 | 6 个路径 ESM/CJS 同构，strict .cts/.mts 通过 |
| 导入边界 / JS 清单 | 132 文件零违规；31 个旧 JS 清单未增长 |
| 独立 OpenAPI / 产物 | 38 Bot + 1 公共版本接口逐项匹配；0 sourcemap |

全量 JSON/log：`.tools/bot-platform/member-sync-finalized-backend.{json,log}`、`member-sync-finalized-web.{json,log}`。类型/构建：`member-sync-finalized-typecheck.log`、`member-sync-finalized-build.log`。真实链路分别执行 `vitest.bff.config.mjs` 的 member-sync-bff.test 与 `vitest.ui.config.mjs`；没有将定向数量叠加成额外唯一单测。

窗口清单：原生产仍暂缓；实际使用前显式迁移 main5，启用 Bot 平台，配置带 members:sync/deliveries:ack 的凭据和允许群，绑定提醒管理员，再在后台核验第一次快照并启用周期。插件未实现时不要打开定时采集。没有设置真实 QQ 接收人或执行正式发送。
