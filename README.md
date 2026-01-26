# guatswr_web

桂航绯想天门户站点，包含前端（Vite + Vue 3）与后端（Express）。

## 环境变量
项目根目录提供示例文件 .env.example，根据部署环境填写。

- Docker 部署（后端）：请将 .env.example 复制到 backend/.env
- 非 Docker/本地：也可放在 backend/.env 或按需导出环境变量

```
cp .env.example backend/.env
```

## 本地开发（可选）
- 后端
```
cd backend
npm install
npm run dev
```

- 前端
```
cd frontend
npm install
npm run dev
```

## 生产部署（Docker，后端）
后端已采用 Docker 方案。使用 backend/Dockerfile 与 backend/docker-compose.yml。

```
cd backend
cp ../.env.example ./.env
# 按需修改 .env

docker compose up -d --build
```

### APT 国内镜像配置（Docker 构建）
后端镜像构建默认使用国内 APT 镜像（阿里云，HTTP 以避免证书缺失导致的 TLS 报错）。如需切换，可通过构建参数覆盖：

```
cd backend
docker build --build-arg APT_MIRROR=http://mirrors.tuna.tsinghua.edu.cn/debian \
  --build-arg APT_SECURITY_MIRROR=http://mirrors.tuna.tsinghua.edu.cn/debian-security \
  -t guatswr_web_backend .
```

也可在 docker-compose.yml 的 build 中添加：

```
services:
  guiair-backend:
    build:
      context: .
      args:
        APT_MIRROR: http://mirrors.tuna.tsinghua.edu.cn/debian
        APT_SECURITY_MIRROR: http://mirrors.tuna.tsinghua.edu.cn/debian-security
```

端口映射：宿主机 8080 → 容器 3000（见 backend/docker-compose.yml）。

## 反向代理（Nginx 示例）
```
server {
  listen 80;
  server_name example.com;

  location / {
    root /var/www/frontend/dist;
    try_files $uri $uri/ /index.html;
  }

  location /api/ {
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
  }
}
```

## 备份与恢复
- 备份脚本：scripts/db_backup.sh、scripts/uploads_backup.sh
- 恢复脚本：scripts/restore.sh
- 定时任务模板：scripts/cron.example

### WAL 模式说明
本项目 SQLite 启用 WAL 模式：最新写入会先进入 -wal 文件，主库文件会在 checkpoint 时合并更新。
因此请勿仅依赖无后缀的 .db 时间判断“是否最新”，备份应使用脚本（会生成一致快照）。
一般不建议删除无后缀主库文件；-wal/-shm 可在服务停止时清理，运行中不应手动删除。

### 手动恢复流程（推荐）
1) 停止后端服务（避免写入）
2) （可选）校验备份完整性：

```
sha256sum -c /path/to/db_YYYYmmdd_HHMMSS.sha256
sha256sum -c /path/to/uploads_YYYYmmdd_HHMMSS.sha256
```

3) （可选）备份当前数据，便于回滚：

```
cp backend/data/guatswr_web_main.db /tmp/guatswr_web_main.db.bak
cp backend/data/guatswr_web_logs.db /tmp/guatswr_web_logs.db.bak
tar -czf /tmp/public.bak.tar.gz -C backend/data public
```

4) 执行恢复脚本（将“数据库备份包”和“上传备份包”作为两个参数）：

```
# 例：备份文件位于 /backups 目录
./scripts/restore.sh /backups/db_20260126_023000.tar.gz /backups/uploads_20260126_030000.tar.gz
```

5) （如有需要）修复权限（容器/宿主机不一致时）：

```
chown -R <运行用户>:<运行用户> backend/data
```

6) 启动后端服务，检查日志与数据是否一致

说明：
- 数据库备份为单个 tar.gz，包含 main.db 与 logs.db。
- 上传备份为 public 目录全量（含 img、icon_svg、upload 等）。

## 数据备份与防篡改策略
1) 备份策略
- DB：每日备份一次，保留 30 天
- 上传文件：每日备份一次，保留 30 天
- 异地存储：可通过 rsync/对象存储同步

2) 防篡改策略
- 备份包生成 SHA-256 清单
- 备份目录设置只读权限
- 建议定期校验哈希

3) 恢复验证
- 恢复后比对 SHA-256 清单
- 随机抽查文件可读性

## 健康检查
- 后端健康检查：/api/version

