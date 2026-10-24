# 后端迁移进度

更新：2026-10-24（Asia/Shanghai）。实施分支：`codex/backend-modernization`。

M0～M2工程节点及远程门禁已通过，当前推进M3逐模块迁移（config/history/members/activities及报名已完成本地节点；BM-26审查补验已完成）。生产网络、旧客户端及最终发布门禁仍开放。

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
| BM-32～39 | TODO | 仍按执行表前置条件推进；36 生产发布须后续明确授权 |

M0远程验收：`f89777d`，Actions run `39827544551`，4个job全通过。BM-06d远程run39831366762、BM-07远程run39832294837全部通过。生产代理链/旧直连消费者仍需发布前核验；依赖门禁沿用BM-15统一补丁及0未解决审计，不代表发布例外已全部关闭。

阶段调整：原 BM-00 同时要求运行响应，而原系统 import 会打开默认库，BM-01 又依赖 BM-00。因此先验收纯静态 BM-00a，再建立隔离入口；BM-00b 的运行基线随 BM-02 验收。不得将静态登记当作运行验证。

3100未执行启停或主目录依赖重装；最新只读探测未发现监听（IPv4/IPv6均ECONNREFUSED），本轮无开始时在线基线，不推断原因。BM-17已对工作区来源做只读快照并在副本上统计，原始记录仅保存在Git忽略的私有目录，原库未应用迁移，正式配置与流量未切换。前端尚未关闭的发布事项继续见 [前端状态](../revamp/STATUS.md)。

每个完成节点均提交并推送；精确提交以 Git 历史为准，证据报告记录输入 SHA、命令、失败和未运行项。后续从本文件及对应 evidence 接续。

最新验证：BM-24完成节点本地双平台1859项、真实BFF/包/镜像/历史诊断副本读取通过。BM-25a deadline本地Windows专项3项/Linux全套1862项、shared79/前端730通过；BM-25完成双平台全套1873项及新BFF/生产镜像报名链路；BM-26完成双平台1879项、BFF审核结果结算与生产镜像验证；BM-26c双平台1885项/BFF/新生产镜像通过；BM-31a已完成双平台1890项与生产命令验证；接续BM-27文件一致性。BFF内存草稿排空/重启处置及旧直连消费者仍须发布前验证。主工作区既有node_modules未原地重装，3100最新未监听；安装验证位于隔离副本/容器。

质量复核：见 [2026-10-24审查](evidence/REVIEW-2026-10-24.md)。游客保存覆盖审核已由BM-26c修复并转为正式回归；purge误删共享图片已由BM-27b2引用复核关闭，启动提权已由BM-31a关闭。d428a7a精确提交远程run39990010617已全部成功。后续按PLAN 2.1补充执行。

最新节点：BM-27b1显式upgrade及历史版本/checksum校验、失败整体回滚、最新空库初始化已通过；真实main manifest现为v2（audit v1），已完成兼容桥与持久清理执行器；27c1已补隔离区备份恢复；后续27c搬图补偿/最终保留继续，BM-28等独立节点可并行序列推进。

BM-28已完成本地门禁，下一步BM-29 logs/Umami；BM-27搬图补偿/最终保留仍开放，不因独立节点完成标记整体迁移完成。

BM-29本地完成，接续BM-30备份调度；BM-27剩余搬图补偿和最终保留、BM-31其余及32～35仍未完成。

BM-30c完成本地门禁：真实Python/Node验证标记与v3隔离身份双平台互操作通过，生产镜像b92a59a79118恢复/并发/私有根检查通过。后续继续BM-31认证管理与剩余JS业务，以及BM-27搬图补偿；整体尚未工程完成，未进行生产发布。

最新远程：67ed1e7 run40045189143容器成功，但Windows/Linux/real-bff的共用check:security因6条新依赖公告失败，本地已复现。BM-15f已独立更新3个上游补丁及锁文件，审计恢复0未解决，双平台后端、新Nuxt+BFF及生产恢复通过；远程精确SHA仍待核验。BM-31b1认证纯迁移已留证，后续接续用户版本与可靠审计的兼容Expand。

最新精确SHA远程门禁：fe61541aeeb23cad140827e469cfa5ab3813e493，run40047409515全部成功（Windows/Linux/container/真实BFF），覆盖依赖安全修复、兼容桥和管理类型迁移。31c本地完成：Windows17+1937=1954、Linux17+1938=1955及新BFF双会话撤销通过；此新节点远程结果待后续核验。下步31d剩余JS业务收口/封禁时长缺陷、BM-27搬图补偿与保留，随后32～35，未宣布迁移或生产完成。

BM-27c2本地完成：输入93ed64a，Windows17+1976=1993、Linux17+1977=1994、Python各20、真实BFF及新生产镜像恢复通过。隔离区默认keep-all，最终销毁不启用；后续31d逐项适配复核→32 Express5→33镜像→34/35候选验收。原库、正式资源和生产流量未操作。

BM-31最终收口：proxy和Bot控制器strict TS、遗留31个物理JS逐项审阅完成。当前进入BM-32 Express5，随后33～35；生产网络/发布仍开放。
