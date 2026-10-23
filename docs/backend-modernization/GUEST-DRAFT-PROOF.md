# 游客草稿证明协议与切换

BM-24a 为兼容扩展：当前 GUEST_DRAFT_PROOF_MODE 缺省为 optional。此模式接受原受信 bridge 请求，但一旦携带证明就必须验证，不能用错误证明降级。required 模式会拒绝缺失证明。最终启用与事件 content 提取尚未完成，不能把本扩展当作 EX-02 已关闭。

| 请求 | scope | 绑定 EID |
| --- | --- | --- |
| POST /api/event/draft | draft | 0（仅用于申请新ID） |
| PUT /api/event/:id | save | 路由中规范正整数ID |
| POST /api/upload/visitor | upload | 签名中的ID；private multipart解析后必须与eid字段一致 |

公开读取、报名、报名头像不属于草稿证明范围，继续使用原网关/身份/状态边界。当前数据库中现查的admin/super_admin继续走管理权限；伪造JWT角色不构成该旁路。

证明为服务端专用 `x-bff-draft-proof` 头，格式 `v1.eid.scope.expires.signature`。expires是Unix秒，签发寿命30秒；接收端要求尚未过期且不超过当前时间60秒，拒绝非规范数字/base64url。signature为使用BFF_BRIDGE_SECRET的HMAC-SHA256，对shared定义的JSON数组 `[purpose,eid,scope,expires,ip]` 签名，purpose固定为guatswr:bff:guest-draft-proof:v1。签名用常量时间比较。桥接密钥、证明和原始请求头不进入浏览器响应或诊断。

BFF仍须先校验CSRF/origin和opaque cookie对应的草稿记录，再为固定上游操作签名；upload先验证归属再转发文件。后端先验证原bridge密钥、实际代理peer和单值XFF，再验证证明。ip用于绑定受信请求上下文，不用于认定草稿归属；归属由现有BFF opaque记录背书，EID/操作绑定阻止同NAT另一个草稿复用证明。这是BFF签发的短期委托，未新增数据库owner列或改变历史业务记录。

上传证明在Multer之前校验。multipart中的eid在解析后核对，错配只清理private暂存文件，不发布到任何事件目录。证明不是一次性令牌；重复提交收据/并发意图保护继续由BFF已有store负责，不承诺exactly-once。BFF的六小时、单进程、限容量记录语义保留；多实例持久归属不在本扩展中解决。

已验证的部署顺序：先部署能发证明的新BFF，再将后端切到required。旧BFF→optional接收端、新BFF→required接收端、新BFF→BM-23旧接收端均在隔离环境以真实Nuxt生产输出、Express和SQLite联测。这里的旧接收端是3825f1c工程基线，不是线上Node20旧镜像。

生产切换仍由BM-35/36统一执行：确认实际直连消费者、旧BFF实例已更新、代理链/共享密钥/时钟一致，验证required的缺失/跨EID/过期拒绝和正常上传/提交。optional兼容窗口不得留作最终安全验收。原始库、现有服务和正式流量尚未切换。
