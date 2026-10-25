# 后端迁移进度

后台交互改造节点表见 [ADMIN-INTERACTION-ROADMAP](../revamp/ADMIN-INTERACTION-ROADMAP.md)。本轮增加可选 main6 加密 Token 副本及站长查看接口，保持旧摘要鉴权；日志新增写入和管理端读取时脱敏。主库最新扩展现为 **6**，Bot 操作现为 **39**，另有 1 个公共成员版本接口。下文 main5/38 项描述保留为此前阶段记录，部署前须显式升级并配置独立加密密钥。

更新：2026-10-25（Asia/Shanghai）。开发分支：`codex/backend-modernization`；交付主分支：`main`；正式软件版本：`v2.0.0`。

后续代码扩展：Bot 平台新增独立凭据、公开查询、订阅/可靠通知、提醒、绑定、报名与审核接口，详见 [接口文档](../../backend/docs/BOT-API.md) 和 [验证记录](evidence/BOT-PLATFORM-2026-10-25.md)。源代码最新主库迁移为 **5**（需显式执行），默认不开启平台或成员同步；下文 main3/audit2、冻结候选和测试数量描述的是已发行 v2.0.0，不是本次尚未发行的扩展。生产部署仍暂缓。

新增 QQ 群成员同步：定时异步请求、完整分批回传、QQ 唯一关联、头像发布、首次名册预览/关联、资料待办、管理员私信与回执、网站后台及公开成员缓存联动。Bot 扩展现为 38 个操作，另有一个公共成员版本接口。插件仍待后续实现；配置默认关闭，未操作原库或真实 Bot。见 [成员同步协议](../../backend/docs/MEMBER-SYNC.md) 和 [实现验证](evidence/MEMBER-SYNC-2026-10-25.md)。

管理面板现支持由站长在「系统 → Bot API」手动创建凭据并选择权限、授权群；密钥仅显示一次，可在同页撤销。成员同步设置从已创建的有效凭据中选择，不再手工填写凭据 UUID。复用现有站长后端接口，新增 BFF 当前角色与 CSRF 校验，无新增数据库迁移；启动、升级和读取页面均不自动生成密钥。Windows/Node 24.16.0 隔离验证：前端 748 项、共享包 79 项、Bot 集成/契约 17 项、真实生产构建 BFF 1 项和 Chromium UI 1 项通过；类型检查、改动文件 lint、生产构建和 134 文件模块边界检查通过。使用步骤见上述接口文档；未执行生产部署。

Bot 先前增加 `GET /api/bot/v1/on-this-day` 时扩展接口共 **24** 个（此后成员同步增至上述 38 个）：按北京时间同月同日查询往年活动文章与群史，返回分页条目和本页播报文本。该读取功能无额外迁移；当时新增功能及相关契约/集成 26 项通过，详见上述验证记录。

该接口已补齐图文播报：`items[].image_url/images/images_truncated` 和本页 `broadcast_images` 使用配置的公共资源 origin，过滤缺图/不安全路径并去重。按用户最新要求，**活动文章只返回封面，不扫描相册、正文或简介插图；无封面不使用其他图片兜底**。群史保留独立配图和描述插图。封面限定及平台/契约回归 29 项通过；仍未执行实际 Bot 群消息发送。启用说明见接口文档。

**BM-00～35必需工程节点已验收完成。生产未发布。** 用户已明确要求暂不部署生产，本轮仅合并main并发布Git标签/GitHub Release v2.0.0；未来BM36仍须现场事实、前端独立发布门禁和批准窗口；BM37～39已按Plan默认形成明确延期结论。没有迁移原数据库、搬原资源或切换正式流量。

代码候选：`8dd71383a8b8776f47c4bee0477e20a5c1caf6ce`。精确Actions [run40109087665](https://github.com/guatswr/GuatSWR_Website/actions/runs/40109087665) 四job（Windows/Linux/container/real-bff）全部success；前置13a345d run40106461480也成功。后续文档收口提交不改变此候选运行代码。

本地最终：Windows17+1996=2013，Linux17+1997=2014（Windows1项POSIX不适用）；真实BFF、OpenAPI71/11 wire模型、shared79/前端730/工具103、类型/lint/安全0未解决通过。历史副本主库233行/audit1143行保留；14组新旧读取及523资源一致；只读回退双重禁写/用户版本保护通过。受控恢复RPO0、RTO3.924秒，两轮同负载性能无既定阻断；报名p95新增开销如实见指标，生产指标不得据此外推。

最终镜像：`guatswr-backend-candidate-8dd7138`，OCI index `sha256:60f63ca19e7335156a58ba0f4c7925fb49e1f777e99d00bc2bab0774e707008a`，非root UID1000、revision匹配代码候选。冻结归档/校验、schema、回退和放行条件见[发布清单](RELEASE-CHECKLIST.md)。仅本地保存镜像，未发布到镜像仓库。

| 节点 | 状态 | 交付与下一步 |
| --- | --- | --- |
| BM-00a 静态基线冻结 | DONE | 71 操作、源码/锁文件哈希、EX/环境台账；见 [证据](evidence/BM-00.md) |
| BM-00b 运行契约基线 | DONE | 71 操作首批运行基线；外部成功/完整恢复仍归后续任务 |
| BM-01 隔离启动 | DONE | Windows/Linux Node 24.16.0 各 17/17 通过；见 [证据](evidence/BM-01.md) |
| BM-02 行为测试 | DONE | Windows/Linux 各173项；真实BFF脚手架1项通过；见 [证据](evidence/BM-02.md) |
| BM-03 后端 CI | DONE | 精确提交 f89777d 的 Windows/Linux/容器/真实BFF 全通过；见 [证据](evidence/BM-03.md) |
| BM-04 Node24 | DONE | 运行时/兼容补丁通过；生产审计0，BM-15统一补丁门禁0未解决；见 [补丁证据](evidence/BM-04e.md) |
| BM-05 代理网络 | DONE（本地） | 默认不信任、显式CIDR、loopback发布；生产拓扑仍待实测；见 [证据](evidence/BM-05.md) |
| BM-06 上传安全 | DONE（本地） | 路径/私有暂存/资源限制/Multer/sharp已落地；Windows/Linux190项+BFF通过，新增并发测试通过；见 [证据](evidence/BM-06.md) |
| BM-07 最小认证 | DONE（本地） | 现查身份、原子版本/管理员保护、二步失败锁；201全套+BFF、认证11项通过；见 [证据](evidence/BM-07.md) |
| BM-08 游客边界 | DONE（本地） | 受信BFF入口、同IP双访客真实联测通过；EID证明仍归BM-24；见 [证据](evidence/BM-08.md) |
| BM-09 公开投影/配置 | DONE（本地） | 208项全套+BFF通过；与后台投影隔离；见 [证据](evidence/BM-09.md) |
| BM-10 恢复基础 | DONE（本地） | 两平台验包14项、双库9组、旧应用HTTP恢复与磁盘满通过；见 [证据](evidence/BM-10.md) |
| BM-11 TS 基础 | DONE（本地） | strict TS 纯环境/错误、混合编译、33项JS清单；Windows/Linux各232项通过；见 [证据](evidence/BM-11.md) |
| BM-12 生命周期 | DONE（本地） | 双平台各239项+BFF、生产镜像/真实SIGTERM/退出期限和双库完整性通过；见 [证据](evidence/BM-12.md) |
| BM-13 诊断日志 | DONE（本地） | Pino白名单、请求/任务ID、异步审计关联；双平台245项+BFF、prune后信号/双库通过；见 [证据](evidence/BM-13.md) |
| BM-14 shared双产物 | DONE（本地） | 4导出路径、双平台tarball独立消费/声明、shared73/前端726/BFF通过；见 [证据](evidence/BM-14.md) |
| BM-15 Workspace | DONE（本地） | 单pnpm锁；Windows1044+工具100/Linux后端245、双镜像/BFF/备份恢复通过；旧npm锁已移除；见 [证据](evidence/BM-15.md) |
| BM-15f 后续依赖安全 | DONE（本地） | 3个上游补丁关闭6条新公告，审计0未解决；等待期1440保留；双平台后端/新Nuxt+BFF/生产恢复通过；见 [证据](evidence/BM-15f.md) |
| BM-16 Zod4 | DONE（本地） | 11组wire迁入shared；1521差分+11 HTTP、Linux1777/Windows回归、shared77/前端726/BFF及产物通过；见 [证据](evidence/BM-16.md) |
| BM-17 数据实测 | DONE（本地） | 只读双库快照/结构与质量盘点、合成历史样本、双平台9项测试通过；保留旧审计表/bio/NULL；见 [证据](evidence/BM-17.md) |
| BM-18 版本迁移 | DONE（本地） | 双账本/checksum/显式adopt、自定义路径、启动拒绝缺库/漂移；Windows1790/Linux全套+增量、生产镜像/BFF/恢复通过；见 [证据](evidence/BM-18.md) 与 [手册](MIGRATIONS.md) |
| BM-19 事务接口 | DONE（本地） | 独立连接/参数绑定/有界busy/中断与真实进程崩溃回滚；双平台各1805项、生产闭包/信号通过；ADR-14审计策略已明确；见 [证据](evidence/BM-19.md) |
| BM-20 config模块 | DONE（本地） | controller/service/repository严格TS；双平台各1814项、真实BFF缓存失效、生产镜像鉴权写/公开读通过；文件补偿仍归BM-27；见 [证据](evidence/BM-20.md) |
| BM-21 history模块 | DONE（本地） | EX-06两次独立修复后完成严格TS拆分；双平台各1822项、BFF实际ID/本地Bot负载/生产镜像通过；见 [证据](evidence/BM-21.md) |
| BM-22 members模块 | DONE（本地） | 严格TS分层/投影；迁移前后行为对照、双平台各1831项、真实BFF缓存失效/Bot失败/生产镜像通过；见 [证据](evidence/BM-22.md) |
| BM-23 activities模块 | DONE（本地） | 两次独立缺陷修复后严格TS分层；新旧行为对照、双平台各1844项/BFF/Bot/生产镜像通过，文件补偿仍归BM-27；见 [证据](evidence/BM-23.md) |
| BM-24 游客草稿/内容 | DONE（本地） | 先Expand再required、内容严格TS与共用保护规则；双平台1859项/新旧BFF三组/前端730/shared77/纯包/镜像/历史副本读取通过；见 [证据](evidence/BM-24.md) |
| BM-25 报名并发 | DONE（本地） | 严格TS与事务资格检查、身份冲突兼容；双平台各1873项/真实BFF报名回显取消/生产镜像通过；见 [证据](evidence/BM-25.md) |
| BM-26 状态与结算 | DONE（本地） | BM-26c关闭游客保存覆盖已完成审核窗口；双平台1885项/BFF/新生产镜像通过；见 [证据](evidence/BM-26.md) |
| BM-31a 启动初始化分离（前移） | DONE（本地） | 常规启动不新增/提权；显式CLI创建/幂等/并发/凭据检查；双平台1890项/生产产物通过；见 [证据](evidence/BM-31a.md) |
| BM-27 文件一致性 | DONE（本地） | 复制准备/最终SQL与清理意图同事务、崩溃接续、引用保护及keep-all隔离保留完成；Win1993/Linux1994、Python各20、真实BFF/生产镜像/跨盘与磁盘满通过；见 [证据](evidence/BM-27.md) |
| BM-28 Bot集成 | DONE（本地） | 严格TS传输/三事件，64KiB响应/期限/重定向限制；双平台1917项/生产镜像通过；见 [证据](evidence/BM-28.md) |
| BM-29 logs/Umami | DONE（本地） | 严格TS/公开投影兼容；Umami缓存/内存/并发/期限与单次共享刷新；双平台1929项/BFF/生产镜像通过；见 [证据](evidence/BM-29.md) |
| BM-30 备份调度 | DONE（本地） | 路径/上海时钟、期限/互斥/事务设置、100MiB取消、异步文件管理及最后已验证恢复点保护完成；Win1941/Linux1942、Python双平台各19项、BFF/新生产镜像/原生恢复通过；见 [证据](evidence/BM-30.md) |
| BM-31其余认证管理 | DONE（本地） | bootstrap/用户撤销/可靠安全审计及剩余域逻辑strict TS完成；31个JS适配逐项登记，3项平台装配例外；BM27全量及本次双平台20专项通过；见 [收口证据](evidence/BM-31d-js-review.md) |
| BM-32 Express5 | DONE（本地） | 5.3.0/类型、query/body/私有下载适配；Win1999/Linux2000、shared79/web730/新Nuxt/BFF/生产信号通过；见 [证据](evidence/BM-32.md) |
| BM-33 生产镜像 | DONE（本地） | 非root/目录隔离/健康探针、真实卷重建与权限失败；Win2009/Linux2010、BFF/原生/恢复磁盘满通过，见 [证据](evidence/BM-33.md) |
| BM-34 真实集成 | DONE（本地） | OpenAPI71/11 wire模型对齐；独立Nuxt+Express双库/BFF备份/验证点/崩溃重启通过；见 [证据](evidence/BM-34.md) |
| BM-35 候选验收 | DONE（工程） | 历史副本/14读取差分/523资源、query_only回退、RPO0/RTO3.924s及两轮性能通过；8dd7138远程四job全通过；见 [证据](evidence/BM-35.md) |
| BM-36 生产发布 | DEFERRED（用户暂缓） | 2026-10-25用户明确暂不部署；仅批准合并main和正式Git版本v2.0.0。未来现场条件见 [清单](RELEASE-CHECKLIST.md) |
| BM-37 驱动POC | DEFERRED | 按Plan默认延期，未更换sqlite3；见 [决策](OPTIONAL-DECISIONS.md) |
| BM-38 Drizzle查询 | DEFERRED | 依赖37采用结论，继续一套参数化SQL/迁移账本；见 [决策](OPTIONAL-DECISIONS.md) |
| BM-39 凭据格式 | DEFERRED | 保留CBC/bcrypt和现有密钥格式，GCM双读桥另行授权；见 [决策](OPTIONAL-DECISIONS.md) |

接续入口：从[发布清单](RELEASE-CHECKLIST.md)核验BM36，不能再次把37～39延期分支当成阻断工程的TODO，也不能跳过现场审批自动上线。schema当前main3/audit2，最低只读回退b343784必须配套query_only启动器、禁后台任务和新恢复工具；已有新写入不得覆盖旧快照。

主工作区node_modules未原地重装；安装/测试均在隔离副本和容器。原服务未启停，3100本轮没有在线基线，不作在线连续性承诺。私有快照及响应摘要保留在Git忽略的.tools；Git仅保存聚合证据/合成指标。阶段历史移至[归档](evidence/STATUS-history-through-BM35a.md)，各节点详细失败与修复保留在对应evidence及提交中。

用户最新交付决定：暂不部署生产，合并已验收分支并发布v2.0.0正式Git版本。版本说明见[Release Notes](../releases/v2.0.0.md)，实际发行入口为[GitHub Release](https://github.com/guatswr/GuatSWR_Website/releases/tag/v2.0.0)。发布工作流只发行固定v2.0.0标签，并允许main上的该版本说明修订同步Release正文；发行前必须等待标签对应main精确提交的后端四项门禁，无部署步骤。

版本交付已完成（2026-10-25 00:24:59 Asia/Shanghai）：迁移分支已快进合并main，v2.0.0标签固定于d85ed1ce319b96d85f2599cff514a0383ea7d7b0；对应main后端门禁run40110958429四job全部success，Release发布run40110966317及说明修订run40111334030成功。GitHub Latest版本为v2.0.0，draft=false、prerelease=false。后续仅文档记录不改变该发行提交；生产部署仍按用户要求暂缓。
