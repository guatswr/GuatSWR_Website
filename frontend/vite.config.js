import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
// 1. 引入 Sitemap 插件
import Sitemap from 'vite-plugin-sitemap'

// 定义需要生成 Sitemap 的静态路由
// 首页由插件自动加入，这里只列其余公共页面
const routerPaths = [
  '/events',     // 异变进行时
  '/activities', // 往期活动
  '/members',    // 成员列表
  '/history',    // 群史
  '/social',     // 社交外链
  '/join',       // 加入我们
  '/logs',       // 公开日志
]

export default defineConfig({
  plugins: [
    vue(),
    // 2. 配置 Sitemap 插件
    Sitemap({
      // 【重要】不要带末尾斜杠
      hostname: 'https://guatswr.top',
      dynamicRoutes: routerPaths,

      // 【关键修复】设置为 true，强制插件生成 robots.txt
      // 这样它就不会去读取不存在的文件，从而修复 ENOENT 报错
      generateRobotsTxt: true,

      robots: [{
        userAgent: '*',
        allow: '/',
        // 禁止爬虫抓取后台管理路径
        disallow: '/admin/'
      }]
    })
  ],
  // 3. 配置路径别名（修复 RollupError 构建错误的关键）
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  build: {
    sourcemap: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.DEV_API_TARGET || 'http://localhost:8088',
        changeOrigin: true,
      },
      '/uploads': {
        target: process.env.DEV_API_TARGET || 'http://localhost:8088',
        changeOrigin: true,
      }
    }
  }
})
