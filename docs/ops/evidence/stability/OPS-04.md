# OPS-04 部署边界与健康契约证据

## 1. 任务背景与目标

- 任务编号：`OPS-04`
- 依赖：`BASE-01`（已满足）
- 实施入口：
  - `docker-compose.yml`：拓扑定义、长格式 bind 挂载与分服务资源配额
  - `.dockerignore`：生产运行时数据与地理数据库构建排除
  - `scripts/revamp/container-smoke.mjs`：镜像 inspect Healthcheck 契约断言与容器烟测
  - `web/scripts/healthcheck.mjs` 与 `backend/scripts/healthcheck.cjs`：运行时双向健康探针契约
  - `scripts/test_deployment_boundaries.py`：部署边界与健康探针专用测试套件

## 2. 设计与防护机制

1. **长格式 Bind 挂载与防止静默空目录初始化**：
   - 生产环境中若主机持久化目录未挂载或因路径拼写错误丢失，短格式 `- host:container` 会由 Docker 守护进程在宿主机静默创建空目录，从而启动一个丢失既有历史数据的空数据库。
   - `docker-compose.yml` 中所有持久化服务（`backend` 数据与备份、`umami` 地理文件、`umami-db` 数据、`komari` 数据）全部升级为长格式 `type: bind`，并配置 `bind: create_host_path: false`；
   - 宿主机缺失对应目录时直接抛出错误启动失败，绝不静默新建空库。
2. **分级独立资源预算（Resource Budgets）**：
   - 避免机械使用统一配置导致不同负载相互争抢或 OOM 崩溃；
   - 依据组件特征分立预算并记录环境变量兜底：
     - `backend`: `mem_limit: 1g`, `pids_limit: 256`, `cpus: 1.5`
     - `web`: `mem_limit: 1g`, `pids_limit: 256`, `cpus: 1.5`
     - `umami`: `mem_limit: 512m`, `pids_limit: 128`, `cpus: 1.0`
     - `umami-db` (Postgres): `mem_limit: 512m`, `pids_limit: 128`, `cpus: 1.0`
     - `komari`: `mem_limit: 256m`, `pids_limit: 64`, `cpus: 0.5`
   - 全局网络隔离：除 Web 对外暴露反代端口外，后端、数据库与监控容器均通过内部 compose bridge 通信。
3. **构建上下文边界保护（.dockerignore）**：
   - 排除 `deploy/**/data`、`deploy/umami/geo/*.mmdb`、`deploy/umami/geo/*.tar.gz` 等生产真实数据；
   - 完整保留 `.gitkeep`、配置文件示例及构建必要文件，避免大文件污染镜像层或泄漏敏感生产数据。
4. **容器镜像 Healthcheck 审查与探针故障退出非零**：
   - 在 `scripts/revamp/container-smoke.mjs` 中增加真实 `docker inspect` 断言，确保产出的镜像内置了合法声明的 `Healthcheck.Test`；
   - 探针脚本（`web/scripts/healthcheck.mjs` 与 `backend/scripts/healthcheck.cjs`）严格实现双向契约：
     - 请求 `/api/health/ready`；
     - 必须返回 HTTP 200、`status === 'ready'` 且 `service` 符合预期；
     - 服务降级（503）、服务名不符、500 异常或网络断连时，`process.exitCode = 1` 立即退出非零，驱动 Docker 标记容器为 `unhealthy` 并触发重启恢复策略。

## 3. 验证结果

- 测试文件：`scripts/test_deployment_boundaries.py`
  - `test_docker_compose_bind_mounts_prevent_host_path_auto_creation`：核验 5 大关键数据卷全部具备 `create_host_path: false`（PASSED）
  - `test_docker_compose_resource_budgets_specified_per_service`：核验 5 个服务的内存/CPU/PIDs 独立预算声明（PASSED）
  - `test_dockerignore_excludes_data_and_geo_archives`：核验数据与地理包构建排除（PASSED）
  - `test_web_healthcheck_success`：Web 探针正常 200 ready 退出码 0（PASSED）
  - `test_web_healthcheck_fails_on_degraded_503`：Web 探针降级 503 退出码 1（PASSED）
  - `test_web_healthcheck_fails_on_wrong_service`：Web 探针服务名错误退出码 1（PASSED）
  - `test_web_healthcheck_fails_on_500_html`：Web 探针 HTML 报错退出码 1（PASSED）
  - `test_web_healthcheck_fails_on_connection_refused`：Web 探针连不上服务退出码 1（PASSED）
  - `test_backend_healthcheck_success`：Backend 探针正常 200 ready 退出码 0（PASSED）
  - `test_backend_healthcheck_fails_on_degraded_503`：Backend 探针降级退出码 1（PASSED）
- 测试输出：
  - `python scripts/test_deployment_boundaries.py` 10 项测试全部通过（Ran 10 tests in 1.752s, OK）
  - `pnpm lint` 0 错误通过

## 4. 生产验收边界

- 代码与本地测试通过（`CODE_VERIFIED`）。
- 生产环境主机部署时需确认生产宿主机各 bind 宿主目录（`./backend/data`、`./deploy/umami/data/db` 等）在启动前已由运维脚本预先创建并授权，确保符合无静默自动初始化的安全防线。
