# PostgreSQL 测试与恢复验收

更新：2026-11-08。开发、测试应用和生产运行时均使用 PostgreSQL 18.6。历史 SQLite 仅用于离线迁移输入，不是当前应用驱动。

## 本地入口

要求 Node 24.16、pnpm 11.25、Python 3、可运行 Linux 容器的 Docker。Windows 使用 Docker Desktop Linux engine。先安装锁定依赖并构建 shared：

```sh
pnpm install --frozen-lockfile
pnpm --filter @guatswr/shared build
pnpm --filter guiair-backend test:unit
pnpm --filter guiair-backend test
pnpm test:database
pnpm test:release
pnpm test:postgres
```

- `test:unit`：不需要数据库的单测和内容存储测试，Windows/Linux 均执行。
- backend `test`：干净构建，运行全部后端业务、契约、生命周期及 PG schema 回归。需要 Docker。
- `test:database`：真实 PG store 契约、断连/排队/取消等专项和离线源清单检查。
- `test:release`：完整历史源迁移、失败回滚、PG 原生备份、空库恢复、应用启动、BYTEA/文件/序列及 BFF 状态回归。
- `test:postgres`：构建 backend 与真实 Nuxt 产物，运行上述业务及真实 BFF 集成和恢复测试。

同一 checkout 的 backend 测试运行期间不要重建 dist；干净构建会删除旧目录。CI 的不同 job 使用独立 checkout，job 内步骤顺序执行。

## 隔离边界

harness 固定 PostgreSQL 18.6 镜像 digest，绑定随机 loopback 端口，使用合成凭据和带标签的临时容器。每个应用从完整 schema template 克隆独立数据库；应用账号无 DDL 权限，故障注入使用单独的夹具管理连接。

夹具要求管理/运行 URL 都指向 harness 的 loopback 地址、相同端口和受管根库，不读取生产 `.env`。关闭时先排空应用连接，再删除本用例数据库；删除容器和卷前检查所有权标签。没有测试环境时明确失败，不跳过或改用内存数据库。

旧 callback 辅助方法只服务测试数据准备，不翻译生产 SQL。新的测试直接使用 `context.sql.main/audit`；不要重新使用 `context.db`、PRAGMA 或 SQLite 返回码。测试期禁用真实机器人、通知和外部备份服务。

## 干净构建与打包冷恢复

backend build 在编译前删除自身 dist，防止已删除的 SQLite engine/adapter 残留。`.dockerignore` 排除宿主 dist，Docker 从源码重新编译。测试不依赖宿主陈旧产物。

```sh
docker build -f backend/Dockerfile --build-arg SOURCE_REVISION=workspace-review -t guatswr-backend:pg-review .
```

获取该本地镜像的完整 `sha256:` ID，注入 `PG_RELEASE_CLIENT_IMAGE`，再运行：

```sh
node scripts/postgres/test-adapters.mjs --business --suite packaged
```

打包测试要求固定镜像 ID，使用真实非 root backend、持久卷、内置 pg_dump/pg_restore 和私有 PG 测试网络：启动原应用并写文章，创建并校验 32 表备份，停止原容器，恢复到另一个空 PG 库和新卷，启动候选并验证登录、文章、图片、隔离区和日志字节，以及下一次自增写入。容器与资源均由测试创建并清理，不连接生产。

## CI 门禁

- `backend`：Linux/Windows 单测和离线历史源的 Python 校验。
- `postgres`：Linux Docker 上的原生 store、全部业务/契约/生命周期，以及备份恢复；输出真实 Vitest JSON。
- `real-bff`：新构建 Nuxt 对接 PG backend，验证鉴权撤销、草稿持久化、真实进程崩溃和重放。
- `container`：从干净上下文构建生产镜像，验证非 root 权限并运行打包冷恢复。
- `quality` / `web` / `web-container`：保留类型、lint、前端单测、浏览器预算和前端交付检查。使用合成 HTTP 上游的 UI 夹具明确选择 memory 状态，不冒充 PG 事务验证。
- `result`：必须等待 postgres 等所有应执行的 job；缺报告、失败、取消或未声明跳过均阻止通过。只有 Windows 的 POSIX 进程组测试可按既有策略排除。

本地通过不等同于远端 GitHub Actions 已运行；本轮不提交、不推送、不部署。生产割接历史见 [PG-07](evidence/stability/PG-07.md)，本轮证据见 [修复验证](evidence/stability/PRODUCTION-REVIEW-FIXES.md)。异地加密包取回、生产调度和告警投递仍需目标环境验收。
