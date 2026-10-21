# guatswr_web

## Nuxt 改版工作区（并行开发中）

新版位于 `web/`，契约类型与校验位于 `packages/shared/`。`frontend/`、`backend/` 保留原有构建和部署方式，不参与新 workspace。进度与验收证据见 [STATUS.md](docs/revamp/STATUS.md)，基础设施操作前先审阅 [预发布方案](docs/revamp/STAGING.md)。

目录职责、两种 shared 的边界和测试夹具规则见 [架构说明](docs/ARCHITECTURE.md)；两组备份脚本的部署场景见 [脚本说明](scripts/README.md)。

新版使用 Node **24.16.0**（`.node-version`）与 pnpm **11.25.0**。24.15.0 存在已知的 Windows TCP 原生崩溃，项目内运行时、CI 与新版镜像统一升级，系统 Node 无需替换。公开页 SSR/数据 SWR、BFF 会话和管理工作台已接入；完整迁移验收仍在继续，具体范围以 STATUS 为准。生产不生成 sourcemap，`next.guatswr.top` 默认禁止索引，当前仅本地测试。

```powershell
pnpm install --frozen-lockfile
pnpm dev # http://127.0.0.1:3100
pnpm -r typecheck
pnpm check:boundaries
pnpm -r lint
pnpm -r test
pnpm -r build
pnpm check:artifacts
pnpm --filter @guatswr/web exec playwright install chromium
npm --prefix frontend ci
npm --prefix frontend run build # 只读视觉参考，不修改旧站源码
pnpm test:e2e
pnpm --filter @guatswr/web test:performance
```

开发环境按 `web/.env.example` 设置变量；生产从服务环境注入 `NUXT_API_BASE` 和随机 `NUXT_SESSION_PASSWORD`。不要将密钥写入仓库。E2E 使用内存 API fixture，不连接真实后端、不写真实账户或业务数据。视觉回归在同一浏览器内直接比较新旧站组件，覆盖桌面/手机及日间/夜间。当前仅本地开发测试，预计 2026 年 11 月 11 日上线，部署操作另行确认。

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

首页保持自由滚动，参考 [Apple Mac 页面](https://www.apple.com/mac/) 的淡入上浮节奏：普通图文进入视口后播放一次约 1–1.1 秒的缓出动画，同排错峰 90–100ms；停下滚动后仍会完成入场，返回阅读不重新淡出。`directives/scrollMotion.js` 复用共享的 IntersectionObserver 入场控制器；只有桌面首屏保留轻微滚动视差。`styles/scrollMotion.css` 调整透明度、位移、缩放，移动端缩小位移；减少动态效果和打印模式直接展示完整内容。不拦截滚轮、不自动改变滚动位置、不增加占位滚动长度。

`ProgressiveImage.vue` 提前 600px 预取图片，首屏使用高优先级。图片未就绪时保留原有画幅，优先显示模糊缩略图，否则显示柔和占位和扫光；超过 4.5 秒显示等待提示。`utils/imageLoader.js` 等待下载与 `Image.decode()` 完成后才让原图交叉淡入；首页照片和活动画廊支持小幅上浮，首屏背景只淡入。保留缺少缩略图时回退原图、最多 3 次自动重试、网络恢复后重试、旧请求与旧解码隔离，以及卸载清理。图片比例继续由调用方的 `wrapperClass` 或 `width` / `height` 预留，不新增动画依赖。

## 门户排版与品牌

首页首屏保留铺满背景的图片 Banner，桌面端（1024px 起）采用左侧文案、右侧大群头像，手机和平板端采用上方居中的大群头像和⑨装饰，下方依次居中排列中文主标题、英文副标题、社团介绍和学校信息；头像大小同时随屏宽和屏高调整，背景图铺满整个首屏，最小高度跟随动态视口，避免原先 92svh 留出下一板块空隙；底部渐变衬托文字并保留插画细节；大头像优先加载原图，导航仍优先使用缩略图。首页活动、兴趣、回顾、简介、社群五个板块使用整片白、浅蓝、暖白、淡紫、青灰底色区分，并有对应深色主题。成员页保留原有居中人数分布图、学校筛选与头像卡片网格；群史页保留原有交错时间轴和月份导航。活动归档保留照片画廊，社群入口保留纯链接索引。后续调整以各页面已确认的布局为准，不统一替换所有页面的排版。

首屏加入入口保留简洁文案、半透明细框和悬停流光，以四角对称细饰、字重和留白统一视觉比例；活动入口使用细线文字链接；顶栏加入入口使用「入社」小印，减少大面积实色块。共享排版与焦点反馈在 `styles/invitation.css`，首屏背景和悬停流光局限于 `HomeHero.vue`，顶栏配色随沉浸、纸色和深色状态调整。微交互参考[东方 LostWord 官网制作案例](https://www.skword.co.jp/work/20210224/)所强调的世界观与细节反馈，图形使用本地 SVG / CSS，装饰印记对辅助技术隐藏，按钮不增加图片请求或循环动画。向下引导使用细线箭头，每 3 秒轻轻下探 7px、微量拉伸后回弹并停顿，文字保持稳定；仅通过 transform 动画，不改变布局。减少动态效果时显示静态箭头，冻结期间随页面动画一起暂停。`HomeAvatarToy.vue` 保留头像周围的小⑨、BAKA 气泡和点击弹跳，Enter / 空格同样可触发；对话会提示距第 ⑨ 次点击还差几次，最后一次预告符卡，冻结后引导向下滑动解冻。气泡展示约 3.4 秒，窄屏气泡居中靠近头像上缘，减少动态效果模式保留静态提示。每第 9 次点击（也支持按数字 9）或输入 `baka` 会触发 `CirnoFreeze.vue` 的冻符「Perfect Freeze」：SVG 多面冰片从屏幕四周生长，配合霜枝和六枚冰翼棱晶，中间保留阅读空间。真实向下滚动约 120–240px 后，裂纹随进度延伸，原有冰片分别旋转坠落；保留滚轮、触摸滑动和滚动按键的原生行为，不锁定滚动，也不震动页面。只能通过向下滚动或 Esc 开始解冻；冻结到碎裂结束期间，`freezeInteraction.js` 将应用设为 inert、隔离焦点并在捕获阶段拦截点击、表单、编辑和快捷键操作，背景 CSS 动画也暂停。冰层内没有可点击的解冻按钮，Esc 仅作文字提示；浏览器自身快捷键仍可使用。卸载时恢复原有 inert 属性与键盘焦点，不跳回首屏。`iceGeometry.js` 生成可重复、随视口适配的冰层；`iceThaw.js` 合并帧更新并负责状态、减少动态效果和卸载清理。没有新增依赖或远程素材请求。造型参考[琪露诺冰翼同人图（hinoiti，原作链接见图页）](https://www.zerochan.net/4210309)，冰层、霜枝和碎片均为项目内绘制的 SVG。

手机和平板顶栏隐藏群头像 Logo，保留站名及导航入口。顶栏在首页顶部透明叠加于插画，滚动或展开手机菜单时显示纸色底板，其他页面保留占位间距。导航使用序号、细线和菱形状态标记，并保留原有活动下拉、主题切换、日志与管理入口。底边细线显示当前页面的阅读进度，卸载时清理滚动和尺寸监听。

后台「群头像 / 站点 Logo」的 `badge_image` 统一用于导航、首页署名与动态 favicon。`frontend/public/brand/` 保存当前群头像的轻量本地版本，作为首屏和资源加载失败时的回退；`favicon-64.png` 与 `apple-touch-icon.png` 供浏览器直接使用。历史社群链接配置中的配色字段保留，页面仅使用图标配色，不再据此渲染彩色卡片底板。

