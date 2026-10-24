# BM-36 待批准发布清单

状态：HOLD（用户于2026-10-25明确暂不部署；批准的v2.0.0 GitHub版本发行不改变本清单生产边界）。工程验证候选为8dd71383a8b8776f47c4bee0477e20a5c1caf6ce；本清单不记录已发布，不授权自行修改正式服务/流量/原数据库。按PLAN第2节区分工程完成、可发布候选和生产验收。前端独立发布门禁及现场事实未关闭前，不能把工程通过写成可直接上线。

| 冻结项 | 已验证值 |
| --- | --- |
| Git代码提交 | 8dd71383a8b8776f47c4bee0477e20a5c1caf6ce |
| 本地镜像tag | guatswr-backend-candidate-8dd7138 |
| OCI index | sha256:60f63ca19e7335156a58ba0f4c7925fb49e1f777e99d00bc2bab0774e707008a |
| 运行config digest | sha256:4f80cadf63ac7c5a0b8701f51a6f296f0dd97527cab840cd1d3c023c10a58b6b |
| 编译dist目录摘要 | 7ba9be4b8e3d43a73e6ceb396d43f1935c2f89e973665fe8dabf702b6746472f |
| 本地交付归档 | .tools/bm35-release/guatswr-backend-8dd7138.tar，118260736字节 |
| 归档SHA256 | 56d74729537414488544621762193b358962878e094ec92a8f012f0c4e289e80 |
| 平台 | Linux amd64，Node24.16.0/pnpm11.25.0，Express5.3.0，sqlite3驱动5.1.7、SQLite3.44.2、CLI3.40.1、sharp0.35.5 |
| 用户/结构 | UID/GID1000；main3/audit2；SQL校验见evidence/BM-35-migration-checksums.json |
| 最低只读回退 | b343784兼容桥，配套本候选read-only-server.cjs及新备份恢复工具；不能直接启动旧CMD写入 |

归档留在忽略目录，未推送镜像仓库。跨主机传输/加载后核验归档SHA、revision label、运行config及编译产物；provenance外层index可因重新构建而不同，不能只认相同tag。保留冻结归档，避免用当天新的apt结果替代已经验收的运行层。

## 发布前必须具备的现场信息

- 批准的目标主机/Compose项目、维护窗口（Asia/Shanghai起止）、执行与值守负责人、回退批准者：待填写。
- 正式DATA/PUBLIC/BACKUP绝对路径、实际schema/迁移账本指纹、挂载来源、UID/ACL和剩余容量：待现场核验。新data/public/quarantine必须同文件系统；不对原目录盲目递归chown。优先在新状态目录完成恢复/迁移，保留原点。
- 实际BFF→反代→Express每跳地址与CIDR、各入口req.ip、loopback端口绑定、防止公网直连、旧静态前端/直连/Bot消费者的适配清单：待核验。CIDR不得用全信任或固定跳数替代。
- JWT_SECRET/TWOFA_SECRET保留现有字节；BFF bridge双方匹配、域名/HTTPS/Origin/Cookie/会话配置及当前前端精确SHA：待核验。不在文档/日志中填写凭据。需要旧前端过渡时先使用既定兼容桥，不直接跳过required证明。
- 前端独立发布门禁按docs/revamp/STATUS.md和现有工作流核验；本候选已补730单元/79 shared/103 tooling/类型/真实BFF，未替代其未关闭的无障碍、性能、生产配置等事项。
- 单后端实例、单BFF进程；备份调度app/external二选一。容量须覆盖状态副本、验包恢复工作目录、保留备份及keep-all隔离区；未知占用不能按测试70MB外推。

## 窗口内执行顺序（获准后才执行）

1. 冻结新游客草稿创建入口POST /api/bff/guest/events/draft，允许已有归属完成提交；按实际BFF六小时TTL排空。禁止在未排空时滚动扩多实例或把未知cookie当新owner。无法排空则须明确接受未提交草稿需重新创建，已提交数据和图片保留。
2. 停止全部写入口、后台清理、备份cron/调度及其他写库进程，等待在途请求/子进程退出；核实原服务写围栏。未停写的包只能标online-per-resource，不能伪标一致恢复点。
3. 使用本候选备份工具建立并完整verify双库/public/quarantine恢复点，记录真实恢复点路径、hash、revision、时间和consistency。验证恢复到新目录并核验关键公开/管理读取；只有成功才继续，不覆盖已有目标。
4. 在核准的新状态目录检查原schema、仅显式adopt/upgrade到main3/audit2，保留未知历史列/NULL/凭据，不重写SQL/checksum。双库分别验证；部分完成仍保持维护状态，不让应用自动修DDL。
5. 核验node UID权限、私有路径布局、镜像归档/revision及匹配的BFF配置；启动候选，逐项验证登录/用户撤销、公开内容、游客证明/上传/报名/审核、备份与HEAD下载、缓存失效和健康探针，再恢复写流量。
6. 写入后如需回退，先停写并生成新的已验证点；优先用最低兼容桥+query_only启动器读取当前3/2状态。不得把发布前旧快照覆盖已有新写入的目录。需恢复时仅恢复到新目标，校验新写入后再切挂载。
7. 记录观察窗口指标及结论，关闭维护模式；保留原数据、冻结镜像、最后有效恢复点和隔离字节。正式完成后再将BM36置DONE。

## 可审阅的默认观察方案（尚待窗口批准）

建议观察30分钟，至少覆盖真实代理链和一次备份；任意错误授权/私有字段泄露、schema/integrity异常、恢复点缺失、错误公开目录立即维持/恢复维护状态。性能沿用同负载p95同时高于基线20%且+50ms的阻断规则；5分钟>=20请求时持续5xx>1%作为建议调查阈值。流量不足时用固定合成探测补充，不能以零请求错误率声称通过。

本地演练负责人Codex：受控停写RPO0、70.5MB恢复包RTO3.924秒；该数值不承诺生产恢复时间。生产RPO/RTO目标、可接受停机和最终回退阈值由窗口负责人核准，未填写不发布。未授权本轮执行此清单的正式操作。
