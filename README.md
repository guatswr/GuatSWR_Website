# guatswr_web

桂航绯想天门户站点，包含前端（Vite + Vue 3）与后端（Express）。

## 社群门户与入群配置

首页将可参与事件（`/api/event`）与活动回顾（`/api/activities`）分别展示。事件的无时区日期按北京时间处理；已截止的已发布事件不进入首页推荐，进行中的事件则按明确的结束时间判断。

管理员可在「全局配置」维护 QQ 群号、HTTP(S) 加群链接和入群问题。旧配置不需要迁移；未填写群号或链接时，页面继续显示原有二维码。二维码上传保留原图，避免有损压缩影响识别。

本地前端默认将 `/api`、`/uploads` 代理到 `http://localhost:8080`；需要其他本地测试后端时，在启动 Vite 前设置 `DEV_API_TARGET`。该设置只影响开发代理，不改变生产 API 地址。

修改后可从仓库根目录运行契约检查，再构建前端：

```powershell
node --test backend/src/utils/eventContentStorage.test.js frontend/src/components/events/eventFormModel.test.js frontend/src/utils/community.test.js
cd frontend
npm ci
npm run build
```

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

## 门户动效维护

动画节奏参考 [SCTA 首页](https://github.com/F1Justin/SCTA-Homepage/blob/f9d1eadc620bae60444a987e42d74b01c15f4583/src/app/%5Blocale%5D/HomeClient.tsx) 和该仓库的 ActivityCard、SchoolCard、AppHeader（参考提交 `f9d1ead`）。在 Vue 中实现首屏分层入场、卡片错峰进入与菜单过渡；没有引入 React 或 Framer Motion，也没有搬用其插画资源。

- `frontend/src/styles/motion.css`：统一动画曲线、时长、悬停与菜单过渡。手机端缩短入场时间并停用背景循环；系统「减少动态效果」或打印时直接显示静态内容。
- `frontend/src/directives/motion.js`：`v-reveal` 使用共享 IntersectionObserver，元素进入视口后仅播放一次，支持异步列表。`v-motion-scene` 可用于需要离屏、后台或减少动态效果时暂停的循环装饰，组件卸载时清理监听；当前图片 Banner 仅保留一次入场动画。
- 新模块只需在 `<script setup>` 导入 `vReveal`，在原生元素或单根组件上加 `v-reveal="{ delay: 80, variant: 'scale' }"`；也可写 `v-reveal="80"` 使用向上淡入。延迟上限为桌面 240ms、手机 120ms。
- 缺少浏览器观察 API 时内容默认可见；键盘焦点进入卡片时立即显示，不等待入场延迟。

动效生命周期测试：`node --test frontend/src/directives/motion.test.js`。

首页恢复自由滚动，参考 Apple 产品页的层次渐入：桌面首屏插画轻微视差、文字随滚动淡出；后续标题逐步浮现、照片缩放归位，内容错峰进入。`directives/scrollMotion.js` 用共享的被动 scroll 监听、IntersectionObserver 和单帧 requestAnimationFrame 同步进度，`styles/scrollMotion.css` 只动画子元素的透明度、位移与缩放，避免测量反馈。不拦截滚轮、不自动改变滚动位置、不增加占位滚动长度。手机首屏保留无头像的文字排版，关闭首屏视差并减小内容位移；减少动态效果和打印模式直接展示完整内容。离开首页时自动清理观察器、监听和帧任务。

## 门户排版与品牌

首页首屏保留铺满背景的图片 Banner，桌面端（1024px 起）采用左侧文案、右侧大群头像，手机和平板端隐藏首屏群头像及⑨装饰，采用靠下、左对齐的纯文字排版：英文引题、中文主标题、社团介绍和学校信息按层级依次排列，以字号和间距区分层级；底部渐变衬托文字，上方保留插画；大头像优先加载原图，导航仍优先使用缩略图。首页活动、兴趣、回顾、简介、社群五个板块使用整片白、浅蓝、暖白、淡紫、青灰底色区分，并有对应深色主题。成员页保留原有居中人数分布图、学校筛选与头像卡片网格；群史页保留原有交错时间轴和月份导航。活动归档保留照片画廊，社群入口保留纯链接索引。后续调整以各页面已确认的布局为准，不统一替换所有页面的排版。

首屏不再摆放成对 CTA 或文字收集面板。`HomeAvatarToy.vue` 在群头像周围放置四枚小⑨；点击头像时，小⑨依次弹开、旋转、回落，并出现一圈冰蓝涟漪。Enter / 空格同样可触发，连续点击会重播，装饰节点数量固定，不使用循环动画或计时器；系统「减少动态效果」时保留静态符号。交互采用 Vue 状态与 CSS 实现，不增加动画依赖。

顶栏在首页顶部透明叠加于插画，滚动或展开手机菜单时显示纸色底板，其他页面保留占位间距。导航使用序号、细线和菱形状态标记，并保留原有活动下拉、主题切换、日志与管理入口。底边细线显示当前页面的阅读进度，卸载时清理滚动和尺寸监听。

后台「群头像 / 站点 Logo」的 `badge_image` 统一用于导航、首页署名与动态 favicon。`frontend/public/brand/` 保存当前群头像的轻量本地版本，作为首屏和资源加载失败时的回退；`favicon-64.png` 与 `apple-touch-icon.png` 供浏览器直接使用。历史社群链接配置中的配色字段保留，页面仅使用图标配色，不再据此渲染彩色卡片底板。

