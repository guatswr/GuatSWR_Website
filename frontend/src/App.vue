<script setup>
import { onMounted } from 'vue'
import { useRoute } from 'vue-router'
// 修改为相对路径并添加 .js 后缀，确保 Docker 构建能精确找到文件
import { useSeo } from './composables/useSeo.js'
import { useTheme } from './composables/useTheme.js'
import TheNavbar from './layouts/Navbar.vue'
import TheFooter from './layouts/Footer.vue'
import RouteProgressBar from './components/RouteProgressBar.vue'
import { useSiteBranding } from './composables/useSiteBranding'

// 1. 初始化 SEO 逻辑 (自动监听路由)
useSeo()
useSiteBranding()
const route = useRoute()

// 2. 初始化主题逻辑
const { initThemeListener } = useTheme()

onMounted(() => {
  // 启动主题监听
  initThemeListener()

  // 移除 index.html 的原生 Loading 遮罩
  const loader = document.getElementById('pre-loading-screen')
  if (loader) {
    loader.style.opacity = '0'
    setTimeout(() => loader.remove(), 400)
  }
})

// 注意：useTheme 的清理逻辑通常不需要在 App.vue 卸载时调用，因为 App.vue 卸载意味着页面关闭
// 但如果这是一个子应用，可以加上: onUnmounted(cleanupThemeListener)
</script>

<template>
  <div
    class="min-h-screen flex flex-col font-sans bg-white text-gray-900 dark:bg-slate-950 dark:text-gray-100 transition-colors"
  >
    <a href="#main-content" class="skip-link">跳到主要内容</a>

    <!-- 独立的进度条组件 -->
    <RouteProgressBar />

    <!-- 独立的导航栏 -->
    <TheNavbar />

    <!-- 页面内容 -->
    <main
      id="main-content"
      tabindex="-1"
      class="flex-grow"
      :class="{ 'pt-16': route.path !== '/' }"
    >
      <router-view v-slot="{ Component }">
        <transition name="fade" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </main>

    <!-- 独立的页脚 -->
    <TheFooter />
  </div>
</template>

<style scoped>
/* 页面切换动画 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
