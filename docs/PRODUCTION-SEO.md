# 生产域名与搜索引擎索引配置

更新日期：2026-11-02

生产站点：**https://www.guatswr.top**。本文对应源码配置，部署命令沿用 [README](../README.md) 中既有项目名、环境文件和 Compose 参数。

## 已配置的行为

- Nuxt 的站点地址默认使用 www 域名；canonical、Open Graph、结构化数据、RSS 和 sitemap 从同一个受信任的站点地址生成，不根据请求的 Host 拼接。
- 生产环境的公开内容允许索引，开发环境保持 noindex。
- 登录、管理端、API 和内部工具继续发送 noindex；私有路径在 robots.txt 中屏蔽。
- 公开 JSON 接口允许抓取，便于页面渲染，但仍返回 noindex 响应头。
- /sitemap.xml 由 Nuxt Sitemap 生成，只包含公开页面和已发布文章；后台、登录、API、草稿和已删除内容不在其中。
- robots 文件的标准路径是 **/robots.txt**，不是 /robot.txt。目前由 Nuxt Robots 生成，不另建 web/public/robots.txt，避免两个规则来源冲突。

## 生产环境变量

将以下设置写进实际 Web 环境文件，根目录 Compose 默认使用 web/.env.production：

```dotenv
NUXT_SITE_URL=https://www.guatswr.top
NUXT_SITE_ENV=production
NUXT_SITE_INDEXABLE=true
NUXT_BFF_AUTH_ALLOWED_ORIGINS=["https://www.guatswr.top"]
NUXT_BFF_AUTH_ALLOW_INSECURE_LOOPBACK_COOKIES=false
```

后端实际环境文件补齐：

```dotenv
SITE_URL=https://www.guatswr.top
CORS_ORIGINS=https://www.guatswr.top
```

保持已有的会话密钥、JWT、桥接密钥和数据库配置，不要用环境模板覆盖现有密钥。现有部署中的 NUXT_SITE_*、SITE_URL、CORS_ORIGINS 或 Origin 白名单会覆盖源码默认值，特别检查是否还保留 next.guatswr.top、旧裸域名或 NUXT_SITE_INDEXABLE=false。

生产 Node 产物不会自动读取项目中的 .env。容器需要通过 env_file/environment 注入，systemd/PM2 则需要修改实际进程使用的环境设置。仅 restart 容器不会重新注入修改后的 env_file，需要重新创建 Web 容器。

## 裸域名统一到 www

参考 [Nginx 示例](../deploy/nginx/guatswr.conf.example)：

- HTTP 的 guatswr.top 和 www.guatswr.top 跳转到固定的 HTTPS www 地址。
- HTTPS 的 guatswr.top 也跳转到 www，保留路径和查询参数。
- www 域名代理到网站 Web 服务。
- TLS 证书必须同时覆盖两个域名，否则裸域名会在跳转之前就发生证书错误。
- 若代理前还有 CDN，同步检查域名跳转、缓存和响应头规则，移除对公开站点附加的全站 noindex。

示例使用宿主机 Nginx 和 127.0.0.1:3100 上游。如果代理运行在容器内，需要改用正确的网络服务地址。

## 重新构建与上线检查

更新源码后重建 Web 镜像，并按原来的 Compose 文件组合重新创建 Web。例如普通根目录部署：

```bash
docker compose build web
docker compose up -d --no-deps --force-recreate web
```

如果同时使用 compose.openlist.yml，沿用 [OpenList 部署手册](OPENLIST-UBUNTU.md) 的 dc 函数，避免遗漏资源网络。反向代理配置修改后先运行 nginx -t，通过后再重载。

```bash
curl -I https://www.guatswr.top/
curl -fsS https://www.guatswr.top/robots.txt
curl -fsS https://www.guatswr.top/sitemap.xml
curl -I https://www.guatswr.top/login
curl -I https://www.guatswr.top/admin/resources
curl -I https://guatswr.top/activities?page=2
```

预期：

- 公开页为 200，响应头不含 noindex，HTML 的 robots meta 允许索引，canonical 使用 https://www.guatswr.top。
- robots.txt 不包含阻止全站抓取的 Disallow: /；包含后台和私有接口规则，且 Sitemap 指向 www 域名。
- sitemap.xml 返回 XML，所有 loc 使用 www 域名，不出现后台或草稿链接。上游数据读取失败时应返回 503，不能伪装成成功的空 sitemap。
- 登录和后台响应保留 noindex。
- 裸域名返回 308，Location 为同一路径的 www 地址。

DNS、证书、代理和 CDN 的配置需要在真实服务器完成，源码配置不会替你修改这些外部服务。环境变量文件和本机开发用临时账号也不会自动迁移到服务器。

## 预览环境继续禁止收录

预览服务使用自己的环境变量，不复用生产索引开关：

```dotenv
NUXT_SITE_URL=https://preview.example.com
NUXT_SITE_ENV=staging
NUXT_SITE_INDEXABLE=false
NUXT_BFF_AUTH_ALLOWED_ORIGINS=["https://preview.example.com"]
```

生产构建不等于生产域名：同一份镜像可以通过以上运行时设置关闭预览环境的收录。网站仍需使用独立的密钥、数据库和公开数据范围。

## 搜索引擎提交

上线检查通过后，可在自己控制的搜索引擎站长平台验证 www 域名，并提交 https://www.guatswr.top/sitemap.xml。源码中不放假验证代码；获得平台提供的真实验证值后再添加。允许索引和提交 sitemap 不代表搜索引擎会立刻收录。

## 参考

- [Nuxt Site Config 的环境与运行时设置](https://nuxtseo.com/docs/site-config/guides/how-it-works)
- [Nuxt Robots 路由规则](https://nuxtseo.com/docs/robots/guides/route-rules)
- [Google 的 noindex 说明](https://developers.google.com/search/docs/crawling-indexing/block-indexing)
