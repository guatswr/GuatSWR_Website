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
