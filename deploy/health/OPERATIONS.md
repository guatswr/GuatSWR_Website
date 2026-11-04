# 核心业务健康与有界恢复

## 探针语义

| 服务 | 地址 | 检查范围 |
| --- | --- | --- |
| Web | `/api/health/live` | 本进程 HTTP/事件循环是否响应，不访问上游 |
| Web | `/api/health/ready`、`/api/health` | 后端就绪；绕过业务 SWR 缓存实际读取公开配置 |
| Backend | `/api/health/live` | 本进程是否响应；关闭期间返回 503 |
| Backend | `/api/health/ready` | 主库 site_config 和审计库 audit_logs 可实际读取 |

就绪返回 200/`ready` 或 503/`not_ready`，存活返回 200/`ok`。响应不缓存，
不包含数据库路径、SQL、原始异常或凭据。`/api/version` 保留兼容语义，不能再用作健康探针。
Docker HEALTHCHECK 已指向就绪地址，因此依赖故障会显示 unhealthy。

检查每次有 1.2 秒期限，完成结果缓存 1 秒，并发合并。即使依赖忽略取消，
每个检查仍最多保留一个在途操作；超时监听器会清理，后续请求不会无限堆积 SQL/HTTP 工作。
探针不建库、不迁移、不备份、不尝试业务写入。主站核心读取与第三方统计、
资源存储的完整功能可用性应分别监控，公网/CDN/整机中断需要主机外部探测。

## 自动恢复边界

宿主机 systemd 定时运行 `scripts/health_watchdog.py`，只管理同时满足这些条件的容器：

- Compose 项目精确为 `guatswr`，服务为 `web` 或 `backend`；
- 显式标签 `io.guatswr.health-recovery.enabled=true`；
- running、未暂停、未处于重启中，restart policy 为 unless-stopped；
- 已过 120 秒启动宽限，Docker 健康状态为 unhealthy。

随后探测容器自身的 `/api/health/live`。存活为正常时记为 dependency_unavailable，
不重启；连续 3 次存活失败才考虑恢复，观测间隔至少 30 秒。
执行前重新核对容器身份、启动时间、状态和存活响应，避免重启已经恢复或被人工停止的实例。

watchdog 对同服务触发的恢复有 5 分钟冷却，每小时最多 3 次尝试。预算在调用 Docker 前先持久化，
失败的重启也计入预算；容器重建不重置预算。状态文件损坏、时钟倒退或存在多个活动同名服务时停止自动恢复。
进程退出仍由原有 unless-stopped 策略恢复，该策略的重启不计入 watchdog 预算。
watchdog 不拉起人工停止的容器，不触碰数据库卷。

## 部署与启用（本轮未执行生产变更）

先部署配套的前后端镜像，确认就绪地址返回正确结果，再安装恢复定时器。
仅修改宿主源码不会更新已经运行的 Docker HEALTHCHECK。

```sh
docker compose build backend web
docker compose up -d --no-build backend web
curl --fail http://127.0.0.1:3100/api/health/ready
docker compose exec -T backend node scripts/healthcheck.cjs

install -m 0644 deploy/health/guatswr-health-watchdog.service /etc/systemd/system/
install -m 0644 deploy/health/guatswr-health-watchdog.timer /etc/systemd/system/
systemd-analyze verify /etc/systemd/system/guatswr-health-watchdog.service /etc/systemd/system/guatswr-health-watchdog.timer
systemctl daemon-reload
# 观察模式不重启容器；单独保存观察状态。发现业务不可用时退出码为 1。
python3 scripts/health_watchdog.py --project guatswr --state /var/lib/guatswr-health-observe/state.json
systemctl enable --now guatswr-health-watchdog.timer
```

状态位于 `/var/lib/guatswr-health-watchdog/state.json`，权限 0600；日志进入 journal。
每轮完成后等待 60 秒再检查，systemd 和文件锁均防止并发执行。
不会自动发送外部通知；监控可采集 readiness 的 503、Docker unhealthy 和 watchdog 的失败状态。

```sh
systemctl status guatswr-health-watchdog.timer guatswr-health-watchdog.service
journalctl -u guatswr-health-watchdog.service --since '1 hour ago'
# 计划维护、手动停机或回退前，先停止定时器及当前巡检。
systemctl stop guatswr-health-watchdog.timer guatswr-health-watchdog.service
```

不要用清空状态文件来绕过恢复次数限制。持续 dependency_unavailable、restart_limit、
watchdog_failed 时应定位依赖、磁盘、配置或状态损坏原因；不自动重建数据库或反复重启。

## 本地验收

```sh
python scripts/health_watchdog_test.py
# 显式选择本地已有 Node 镜像。脚本拒绝远程 Docker context，使用随机项目名、
# 无网络、无宿主端口和无业务卷的容器，结束时仅清理本次创建的资源。
python scripts/health_watchdog_docker_test.py --image guatswr-security-fix:web
```

后端集成测试用合成数据库模拟表不可用，验证 503、存活 200 及修复后恢复；
前端测试覆盖上游拒绝、无效响应和缓存不能掩盖故障；容器演练覆盖依赖故障不重启、
无响应后重启恢复、人工停止后保持停止。
