# 后端迁移进度

更新：2026-10-23（Asia/Shanghai）。实施分支：`codex/backend-modernization`。

M0远程验收已通过；M1安全/恢复的本地工程节点已齐，当前推进M2基础工程。生产网络、旧客户端及最终发布门禁仍开放。

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
| BM-16 Zod4 | DONE（本地） | 11组wire迁入shared；1521差分+11 HTTP、Linux1777/Windows回归、shared77/前端726/BFF及产物通过；见 [证据](evidence/BM-16.md) |
| BM-17～39 | TODO | 仍按执行表前置条件推进；36 生产发布须后续明确授权 |

M0远程验收：`f89777d`，Actions run `39827544551`，4个job全通过。当前推进 BM-11～19及剩余依赖安全；BM-06d远程run39831366762、BM-07远程run39832294837全部通过。生产代理链/旧直连消费者仍需发布前核验，依赖审计剩余项另分批修复。

阶段调整：原 BM-00 同时要求运行响应，而原系统 import 会打开默认库，BM-01 又依赖 BM-00。因此先验收纯静态 BM-00a，再建立隔离入口；BM-00b 的运行基线随 BM-02 验收。不得将静态登记当作运行验证。

现有开发服务 3100 保留；未读取原业务记录、未迁移原库、未更改正式配置或流量。前端尚未关闭的发布事项继续见 [前端状态](../revamp/STATUS.md)。

每个完成节点均提交并推送；精确提交以 Git 历史为准，证据报告记录输入 SHA、命令、失败和未运行项。后续从本文件及对应 evidence 接续。

最新验证：BM-15 f2a0ed8远程run39898446801全通过。BM-16本地双平台/纯解析与HTTP/独立包/生产闭包/BFF门禁通过，本提交远程待核验。主工作区既有node_modules未原地重装以保留3100，安装验证位于隔离副本/容器。
