# 后端验收矩阵

更新：2026-10-23。所有项目均为未来要求，本轮未运行应用测试。任务归属见 [执行表](EXECUTION.md)。

## 测试分层与隔离

单元测试验证纯规则；Supertest 验证真实 Express 中间件；真实临时 SQLite 文件验证 SQL/FK/WAL；双连接验证锁与并发；Linux 容器验证原生模块、脚本和文件权限；Nuxt 生产输出连接真实后端验证完整链路。内存 API fixture 只能验证客户端边界。

每套测试必须拥有独立 main/logs/public/backups/端口/密钥；临时目录前缀和绝对路径校验成功才清理。禁止读生产 `.env` 或启动默认 db.js。时钟可注入，但并发测试使用真实连接和屏障，不能只用 mocked Promise；外部 HTTP 仅使用本地可控接收器。

## 必测用例

| 组 | 场景与断言 |
| --- | --- |
| A01 全路由 | 接口台账每个操作至少成功、缺失/无效参数、无权请求；方法、状态码、Content-Type、JSON 字段类型/null/缺省、排序分页一致；无消费者接口也保留 |
| A02 登录 | 正确/错误密码、缺失/错误二步密码、损坏 CBC、5 次错误锁、60 秒释放、多请求竞态；JWT 24h、声明与版本；密码不 trim；旧 bcrypt 可用 |
| A03 Token | 无 token 401、无效 token 原 403、版本失效 401；optionalAuth 无效 token 当前匿名回退；删用户/降权/DB 故障目标 fail closed；BFF 401 清会话与 403 保留会话分别测试 |
| A04 用户权限 | admin/super_admin 全权限表；删自己、最后超级管理员、并发交叉删除、目标不存在；profile 缺 avatar 的当前清空语义；密码/二步修改与全局撤销区分 |
| A05 配置 | 10 个公开键、内部键读取/写入权限、QQ 字段 trim、空值/default、非法 URL；不同角色缓存不串；不得通过普通配置回写 token_version |
| A06 成员/群史 | 学校空值分组、tags 异常 JSON/去重、sort_order/id；缩略图缺失回退和 original=1；群史 date ASC/sort_order ASC；创建 ID、数据库失败、软删恢复 |
| A07 文章 | status NULL/draft/published、all/includeDeleted 各角色；列表作者 id 与详情作者名差异；images 脏 JSON；更新发布、删除不存在、恢复；分页 limit 1～100 |
| A08 日志 | 原接口筛选/分页、+08:00 时间、用户缺失、编辑统计动作集；公开字段脱敏；超大 details、恶意令牌、SQL 错误、非正数分页的批准新边界 |
| E01 草稿归属 | 两位游客同 IP/不同 IP、同游客多个草稿、猜 EID、跨访客上传、失效/篡改证明、BFF 重启；公开状态和草稿访问范围 |
| E02 内容 | 五种 UI 类型及历史 general、未知管理字段、嵌套 person.id、游客禁止保护字段、重复图片引用、图片失败不发布、重复提交、超时结果未知不自动重发 |
| E03 报名 | STG/则则与其他类型；published/ongoing；重复报名更新；user_id NULL；同 IP 两账号；游客登录后报名；冲突目标不同；回显/取消与写入身份一致 |
| E04 截止/竞态 | deadline 有效/无效/空值，北京时区边界；time 不作截止；并发报名/取消/改状态；事务后唯一性和最后结果符合明确顺序 |
| E05 状态 | 下表全部转换；不存在资源；并发结果与结算不丢字段；旧 admin/review 与新入口分别核对审计和通知；永久删除级联 |
| D01 数据盘点 | 双库 schema/index/FK/PRAGMA/SQLite 引擎版本；行数、关键分布、JSON/NULL/日期、孤儿；敏感内容脱敏 |
| D02 迁移 | 空库全建；真实旧 schema 副本 adopt；缺列/多列/未知表漂移；重复运行；checksum 改动；并发 migrator；失败原子回滚 |
| D03 双库/版本 | 主库成功日志库失败；重启检查版本；旧应用读扩展结构；不自动忽略 no such column；AUTOINCREMENT/索引/cascade 保持 |
| D04 事务 | 两连接 SQLITE_BUSY、超时、回滚、提交前进程中断；事务外请求不混入；主库与日志库失败不宣称跨库原子 |
| F01 上传 | JPEG/PNG/GIF/WebP/SVG；伪 MIME/扩展名、魔数截断、巨大像素、50MiB 边界、缺 file/多 file/异常 fields、客户端中断、并发资源上限 |
| F02 文件 URL | 原图/缩略图配对、重名、重复引用、外部 URL、History 大小写、活动/事件目录；暂存 TTL 后正式文件仍在 |
| F03 失败补偿 | rename/EXDEV/copy/chmod/sharp/DB 提交失败；提交前后崩溃；无引用文件清理；共享引用保留；任务重试不删新版本文件 |
| F04 路径/静态 | ../、编码/反斜杠、同前缀兄弟目录、绝对路径、symlink；未验证文件不公开；SVG sandbox/nosniff；静态 Range/HEAD/缓存行为 |
| B01 备份 | 双库+public+manifest；缺库/缺 CLI/权限不足/磁盘满必须失败；在线单库一致；整体停写点；hash 与归档匹配 |
| B02 恢复 | 全量包与历史包格式；先验证全部再落盘；拒绝 traversal/绝对路径/symlink；恢复到新目录，integrity_check=ok、foreign_key_check 无异常或已登记历史差异；资源哈希/数量一致 |
| B03 调度/下载 | 02:30 按批准时区；手动与定时互斥、跨日/重启/子进程超时、唯一包名、保留期；100MiB 字节相等、HEAD、Range 策略、取消/半流错误不追加 JSON |
| X01 AstrBot | 三个事件的 event/data/actor/source/timestamp；Bearer 是出站凭据，入站仍是管理员 JWT；未配置、超时、非2xx、大响应；业务成功通知失败；自动重试与人工重发的去重边界 |
| X02 Umami | 两登录路径、token 401 刷新一次、未配置 503、失败 502；daterange、envType 缓存隔离、超时、无效 JSON、响应/缓存容量上限 |
| Z01 契约 | Zod3→4 输入/输出样本差分；undefined/null/空串/数字字符串/未知键；shared CJS/ESM 安装消费；纯包不导入 Node/Nuxt |
| L01 启动 | import 无 I/O、app 可重复创建；数据库/迁移准备完才 listen；关键配置错误退出非0；测试退出无遗留句柄 |
| L02 退出 | SIGTERM 停接新请求、处理在途/限时终止、停止调度和子进程、关闭双库；端口占用启动失败；健康状态不谎报 ready |
| N01 代理 | 直连/可信链/伪造头/IPv6/不同路径长度；BFF 重建 XFF；真实访客限流/封禁；Bot 跳过全局 limiter 的边界独立验证 |
| N02 镜像 | frozen clean build；sqlite3/sharp 可加载；非 root 可写持久目录；源码只读；容器重建数据仍在；docs/脚本存在；无密钥打包 |
| O01 观测 | request ID/耗时/错误分类/任务状态；密码/token/密文/QQ/IP 按访问级别过滤；audit 写失败不会未处理崩溃或误报可重试业务失败 |
| I01 真实 BFF | 登录→创建编辑→公开读取→缓存失效；草稿→上传→投稿→审核→报名→取消；软删恢复；浏览器不见 JWT；与固定上游路由逐一对应 |
| I02 会话 | /me 实时复核、修改密码撤销、管理员删除、全局版本、登出、重启需重登；BFF 单进程限制不能描述成多实例连续性 |
| I03 旧入口 | 无 Nuxt 消费的旧审核/物理删除/Bot 接口仍验证；备份二进制、static、sitemap、docs、404/error 中间件均覆盖 |
| R01 差分 | 旧/新应用各用独立等价副本；比较响应及双库/文件副作用；时间、随机名、ID 仅按明确映射归一化，不忽略状态/字段/权限 |
| R02 性能 | 同 OS/镜像资源/数据规模/负载；预热与冷启动分开；列表/登录/上传/报名/备份并发；p50/p95/p99、事件循环、CPU/RSS/WAL/磁盘 |
| R03 恢复发布 | 旧镜像读新结构；新写入后回退演练；明确 RPO/RTO、维护窗口、负责人、失败阈值、恢复点、观察时长 |

## Event 现状转换表（实现依据，不代表目标全部允许）

| 操作 | 当前源状态条件 | 目标状态/影响 | 迁移注意 |
| --- | --- | --- | --- |
| POST draft | 无 | draft，type 默认 general | 可匿名，写 visitor_ip |
| PUT id，submit=true | 匿名仅被禁止修改 published | pending | 未校验 owner；必须安全修复 |
| PUT id，submit 非 true | 同上 | 保留状态，修改真值字段 | 空 title/type 当前不更新；不要默认改成 patch 语义 |
| POST admin | 需管理员、type | draft 插入，搬图后指定合法状态或 published | 失败删新记录；文件补偿另验 |
| approve / admin review approve | 只查记录是否存在 | published | 旧 review 没有 Event hook，审计 action 也不同 |
| reject / admin review reject | 只查记录是否存在 | rejected | 不应在纯重构中突然只允许 pending |
| status | 八种枚举之一 | 请求状态 | 允许从 deleted 改回其他状态，无专用 event restore |
| delete | 记录存在 | deleted | 与 activities.deleted_at 不同 |
| settle | 记录存在 | 请求 status 或 settled，浅合并 payload | 当前 status 未枚举校验，读改写有竞争 |
| set_result | STG/则则、results 是数组 | ended，更新 results 与时间 | 会覆盖并发读改写内容，需事务/版本策略 |
| signup | STG/则则且 published/ongoing | UPSERT participant | 当前后端不校验 deadline |
| avatar upload | published/ongoing/ended/settled | 写文件 | 当前后端不限制类型；BFF 限 STG/则则 |
| admin DELETE event | super_admin、记录存在 | 永久删除+参与者级联+文件清理 | 不属于 recycle-bin/purge |

## 兼容例外与放行标准

每个 EX 至少包含源码证据、可复现输入、旧响应/副作用、目标行为、消费者清单、批准依据、迁移/回滚和测试。首批候选：游客归属、内部配置键、公开日志/IP、过期身份、数据库错误 fail closed、上传路径与 SVG、群史 ID、deadline、状态约束、密码撤销。候选不是已获批准。

性能候选门槛：相同负载下 p95 同时超过旧基线 20% 且增加超过 50ms 时阻断；错误率不得出现新增系统性错误；RSS 在连续负载中不得持续无界增长。BM-35 用部署环境数据确认阈值和负载，不把该建议写成已有 SLA。RPO/RTO 必须由实测填写具体数值；未填写不放行。

每个 API 台账行最终追加 test IDs、旧/新结果、EX、通过提交。需要下载、文件写入或通知的接口必须验证副作用，不能只断言 status 200。全部证据指向当前候选 SHA/digest；过期 CI artifact 必须重跑或说明不可取得。
