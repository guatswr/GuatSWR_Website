# Umami 统计与省级归属地分析运维手册

统计采集域名是 `stats.guatswr.top`，经过 Cloudflare；主站经过 ESA。
`cloudflare-realip.conf` 仅包含在统计域名的 TLS server 中。Nginx 重建单值
`X-Real-IP` 后，Umami 通过 `CLIENT_IP_HEADER=x-real-ip` 读取访客地址。
`SKIP_LOCATION_HEADERS=1` 避免仅有国家的 CDN 头跳过省市查询。

## 一、服务架构与集成

Umami 与 PostgreSQL 已统一合并入仓库根目录 [`docker-compose.yml`](../../docker-compose.yml)：

- **统一网络**：`backend`、`web`、`umami`、`umami-db` 统一加入 `app` 内部网络（`172.30.88.0/24`）。
  - `backend` 通过内部 DNS `http://umami:3000` 直接调用统计接口，无需外部网络中继。
  - `umami` 固定内网 IP `172.30.88.20`，通过 `umami-db:5432` 访问 PostgreSQL。
- **端口映射**：宿主机回环 `127.0.0.1:13036:3000` 供 Nginx (`stats.guatswr.top`) 反向代理。
- **持久化目录**：
  - PostgreSQL 数据目录：`${UMAMI_DB_DATA_DIR:-./deploy/umami/data/db}`（生产环境指向 `/opt/umami/umami-db-data`）。
  - GeoLite2 数据库目录：`${UMAMI_GEO_DIR:-./deploy/umami/geo}`（只读挂载至容器 `/geo:ro`，生产环境指向 `/opt/umami/geo`）。
- **统一运维**：
  ```sh
  # 启动全栈所有服务（Web + Backend + Umami + Umami-DB）
  docker compose up -d
  # 仅重启或查看 Umami 服务
  docker compose restart umami
  docker compose logs -f umami
  ```

## 二、功能与数据指标

- `/logs?env=region` 展示省级地区、已识别/未知访客数量。
- 覆盖率先汇总完整地区列表再截取榜单；超过 10000 个地区或统计不一致时不展示覆盖率。
- 历史记录不保存原始 IP，缺失省份保留未知。结果表示网络出口归属。

## 三、地理库自动更新

`guatswr-geo-update.timer` 每周二北京时间 04:40 后随机延迟最多 15 分钟运行。
数据源沿用 Umami 默认构建使用的 GitSquared GeoLite2 分发仓库，通过 GitHub
官方 API 下载同一归档。下载有大小、超时和重试上限；拒绝链接、重复数据库、
错误库类型、过期数据和版本倒退。成功后原子替换，保留上一份库并重启 Umami
加载内存中的新数据库。服务启动验证失败会恢复旧库。

```sh
systemctl status guatswr-geo-update.timer
journalctl -u guatswr-geo-update.service --since '7 days ago'
systemctl start guatswr-geo-update.service
python3 /opt/GuatSWR_Website/scripts/umami_geo_update_test.py
```

更新凭据不写入库文件；下载失败继续使用现有库，systemd 记录失败状态。
应检查更新日志及 `/opt/umami/geo/update.json`，数据源停止维护时更换获授权的数据源。
只替换文件不会刷新 Umami 已打开的数据库，需执行更新服务或重启统计容器。

## 四、部署与平滑迁移说明

1. **环境配置**：
   在 `/opt/GuatSWR_Website/.env` 中配置：
   ```ini
   UMAMI_DB_PASSWORD=<生产数据库密码>
   UMAMI_HASH_SALT=<生产密码盐>
   UMAMI_DB_DATA_DIR=/opt/umami/umami-db-data
   UMAMI_GEO_DIR=/opt/umami/geo
   ```
2. **容器平滑切换**：
   - 停止并移除旧独立 Compose 容器：`cd /opt/umami && docker compose down`（保留数据卷）
   - 在主仓库拉起统一栈：`cd /opt/GuatSWR_Website && docker compose up -d`
   - 验证服务：
     - `curl -fsSL http://127.0.0.1:13036/script.js`
     - `curl -fsSL https://stats.guatswr.top/script.js`
     - `curl -fsSL https://www.guatswr.top/api/logs/umami?startAt=1&endAt=9999999999999&envType=region`
