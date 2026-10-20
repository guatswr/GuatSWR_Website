<script setup lang="ts">
import { ref } from 'vue'

/** Port of the archived `layouts/EventsLayout.vue`: desktop rail + mobile chips. */
const route = useRoute()
const isCollapsed = ref(false)

const menus = [
  { name: '悬赏令', path: '/events/bounty', icon: '💰', desc: '赏金猎人' },
  { name: '对赌协议', path: '/events/betting', icon: '⚖️', desc: '达成契约' },
  { name: 'STG', path: '/events/stg', icon: '✈', desc: '打飞机' },
  { name: '则则', path: '/events/zetime', icon: '🏆', desc: 'ymyz' },
  { name: '聚会', path: '/events/party', icon: '🎉', desc: '线下面基' }
]

const isActive = (path: string): boolean => route.path.includes(path)

/**
 * The dark border colour is the archived *rendered* one, not the class literal:
 * the archived `style.css` carries `html.dark .border-gray-200 { border-color:
 * #334155 !important }`, which beats the `dark:border-[#1e1f22]` utility that
 * sits on the same elements. `web/app/assets/css/main.css` (not owned by this
 * workstream) restores the archived `bg-*` / `text-gray-*` overrides but not the
 * `border-gray-*` ones, so the three elements below pin the archived value.
 */
</script>

<template>
  <div class="club-paper min-h-screen flex flex-col md:flex-row">
    <!-- App 已为顶部导航预留高度；侧栏从导航下方开始吸顶。 -->
    <!-- 桌面端侧边栏 (Desktop Sidebar) -->
    <aside
      class="hidden md:flex flex-col border-r border-slate-200 dark:border-slate-800 sticky top-16 h-[calc(100svh-4rem)] transition-all duration-300 ease-in-out flex-shrink-0 z-30"
      :class="isCollapsed ? 'w-20' : 'w-64'"
    >
      <div
        class="h-16 flex items-center border-b border-gray-200 dark:border-[#334155] overflow-hidden whitespace-nowrap shrink-0"
        :class="isCollapsed ? 'justify-center' : 'justify-between px-4'"
      >
        <Transition name="fade">
          <div v-show="!isCollapsed" class="flex flex-col min-w-[120px]">
            <h2 class="font-bold text-gray-700 dark:text-gray-100 text-lg leading-tight">
              活动导航
            </h2>
            <p class="text-[10px] text-gray-500 dark:text-gray-400">Current Events</p>
          </div>
        </Transition>

        <button
          type="button"
          class="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-[#35373c] text-gray-500 dark:text-gray-400 transition-colors focus:outline-none"
          :title="isCollapsed ? '展开侧边栏' : '收起侧边栏'"
          :aria-expanded="!isCollapsed"
          aria-controls="desktop-events-rail"
          @click="isCollapsed = !isCollapsed"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width="1.5"
            stroke="currentColor"
            class="w-5 h-5 transition-transform duration-300"
            :class="isCollapsed ? 'rotate-180' : ''"
            aria-hidden="true"
          >
            <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>
      </div>

      <nav id="desktop-events-rail" class="flex-1 p-2 space-y-1 overflow-y-auto custom-scrollbar">
        <NuxtLink
          v-for="menu in menus"
          :key="menu.path"
          :to="menu.path"
          class="flex items-center px-3 py-3 rounded-md transition-all group relative overflow-hidden whitespace-nowrap"
          :class="[
            isActive(menu.path)
              ? 'bg-white text-sky-700 shadow-sm dark:bg-[#404249] dark:text-white'
              : 'text-gray-600 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-[#35373c] dark:hover:text-gray-200',
            isCollapsed ? 'justify-center' : ''
          ]"
          :title="isCollapsed ? menu.name : ''"
        >
          <span
            class="text-xl flex-shrink-0 transition-transform duration-300"
            :class="isCollapsed ? 'scale-110' : 'mr-3'"
            aria-hidden="true"
            >{{ menu.icon }}</span
          >

          <div
            class="flex flex-col transition-opacity duration-200"
            :class="isCollapsed ? 'w-0 opacity-0 hidden' : 'w-auto opacity-100'"
          >
            <span class="font-medium text-sm">{{ menu.name }}</span>
            <span v-if="!isActive(menu.path)" class="event-nav-description text-[10px] opacity-70">{{ menu.desc }}</span>
          </div>

          <div
            v-if="isActive(menu.path)"
            class="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-sky-500 dark:bg-white rounded-r-full"
            aria-hidden="true"
          />

          <div
            v-if="isCollapsed"
            class="absolute left-16 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity z-50 pointer-events-none whitespace-nowrap shadow-lg"
          >
            {{ menu.name }}
          </div>
        </NuxtLink>
      </nav>
    </aside>

    <!-- 移动端顶部导航 (Mobile Top Nav) -->
    <div
      class="md:hidden bg-white dark:bg-[#2b2d31] border-b border-gray-200 dark:border-[#334155] sticky top-16 z-40 overflow-x-auto"
    >
      <nav class="flex px-4 py-3 space-x-3 min-w-max" aria-label="活动种类">
        <NuxtLink
          v-for="menu in menus"
          :key="menu.path"
          :to="menu.path"
          class="flex items-center px-3 py-1.5 rounded-full text-sm border transition-colors"
          :class="[
            isActive(menu.path)
              ? 'bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400 border-sky-200 dark:border-sky-700/50'
              : 'bg-gray-50 dark:bg-[#35373c] text-gray-600 dark:text-gray-300 border-gray-200 dark:border-[#334155]'
          ]"
        >
          <span class="mr-1.5" aria-hidden="true">{{ menu.icon }}</span>
          {{ menu.name }}
        </NuxtLink>
      </nav>
    </div>

    <!-- 主内容区域 (Main Content) -->
    <div class="flex-1 min-w-0 p-4 md:p-8 overflow-x-hidden">
      <div class="max-w-6xl mx-auto min-h-[500px] py-6 md:px-4">
        <div class="club-page-stack">
          <NuxtPage :transition="{ name: 'club-page' }" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
html:not(.dark) .event-nav-description {
  color: #475569;
  opacity: 1;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* 自定义滚动条 */
.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: rgba(156, 163, 175, 0.5);
  border-radius: 2px;
}
.custom-scrollbar:hover::-webkit-scrollbar-thumb {
  background-color: rgba(156, 163, 175, 0.8);
}
</style>
