<script setup>
import { ref } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const isCollapsed = ref(false)

const toggleSidebar = () => {
  isCollapsed.value = !isCollapsed.value
}

// 导航菜单配置
const menus = [
  { name: '悬赏令', path: '/events/bounty', icon: '💰', desc: '赏金猎人' },
  { name: '对赌协议', path: '/events/betting', icon: '⚖️', desc: '达成契约' },
  { name: 'STG', path: '/events/stg', icon: '✈', desc: '打飞机' },
  { name: '则则', path: '/events/zetime', icon: '🏆', desc: 'ymyz' },
  { name: '聚会', path: '/events/party', icon: '🎉', desc: '线下面基' },
]
</script>

<template>
  <!-- 
    Layout Container 
    桌面端 (md): 去掉 pt-16，让侧边栏可以贴顶 (top-0)
    移动端: 保留 pt-16，因为移动端导航栏是 fixed 的，内容需要避开
  -->
  <div class="min-h-screen bg-gray-50 dark:bg-[#313338] pt-16 md:pt-0 flex flex-col md:flex-row">
    
    <!-- 桌面端侧边栏 (Desktop Sidebar) -->
    <!-- 
      Modified: 
      1. sticky top-0 h-screen: 让侧边栏充满全屏高度并吸顶
      2. pt-16: 内部增加内边距来避开顶部导航栏 (这样背景和边框能延伸到顶部)
    -->
    <aside 
      class="hidden md:flex flex-col bg-gray-100 dark:bg-[#2b2d31] border-r border-gray-200 dark:border-[#1e1f22] sticky top-0 h-screen pt-16 transition-all duration-300 ease-in-out flex-shrink-0 z-30"
      :class="isCollapsed ? 'w-20' : 'w-64'"
    >
      <!-- Header Area (包含缩放按钮) -->
      <div 
        class="h-16 flex items-center border-b border-gray-200 dark:border-[#1e1f22] overflow-hidden whitespace-nowrap shrink-0"
        :class="isCollapsed ? 'justify-center' : 'justify-between px-4'"
      >
        <!-- 标题文字 (收起时隐藏) -->
        <transition name="fade">
          <div v-show="!isCollapsed" class="flex flex-col min-w-[120px]">
            <h1 class="font-bold text-gray-700 dark:text-gray-100 text-lg leading-tight">活动导航</h1>
            <p class="text-[10px] text-gray-500 dark:text-gray-400">Current Events</p>
          </div>
        </transition>

        <!-- 缩放切换按钮 -->
        <button 
          @click="toggleSidebar"
          class="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-[#35373c] text-gray-500 dark:text-gray-400 transition-colors focus:outline-none"
          :title="isCollapsed ? '展开侧边栏' : '收起侧边栏'"
        >
          <!-- 图标：展开时向左，收起时向右 -->
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            fill="none" 
            viewBox="0 0 24 24" 
            stroke-width="1.5" 
            stroke="currentColor" 
            class="w-5 h-5 transition-transform duration-300"
            :class="isCollapsed ? 'rotate-180' : ''"
          >
            <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>
      </div>
      
      <!-- Navigation Items -->
      <nav class="flex-1 p-2 space-y-1 overflow-y-auto custom-scrollbar">
        <router-link
          v-for="menu in menus"
          :key="menu.path"
          :to="menu.path"
          class="flex items-center px-3 py-3 rounded-md transition-all group relative overflow-hidden whitespace-nowrap"
          :class="[
            route.path.includes(menu.path)
              ? 'bg-white text-sky-600 shadow-sm dark:bg-[#404249] dark:text-white'
              : 'text-gray-600 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-[#35373c] dark:hover:text-gray-200',
            isCollapsed ? 'justify-center' : ''
          ]"
          :title="isCollapsed ? menu.name : ''"
        >
          <!-- Icon -->
          <span class="text-xl flex-shrink-0 transition-transform duration-300" :class="isCollapsed ? 'scale-110' : 'mr-3'">{{ menu.icon }}</span>
          
          <!-- Text Content -->
          <div class="flex flex-col transition-opacity duration-200" :class="isCollapsed ? 'w-0 opacity-0 hidden' : 'w-auto opacity-100'">
            <span class="font-medium text-sm">{{ menu.name }}</span>
            <span class="text-[10px] opacity-70" v-if="!route.path.includes(menu.path)">{{ menu.desc }}</span>
          </div>

          <!-- Active Indicator -->
          <div 
            v-if="route.path.includes(menu.path)"
            class="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-sky-500 dark:bg-white rounded-r-full"
          ></div>
          
          <!-- Hover Tooltip (收起时显示) -->
          <div 
            v-if="isCollapsed" 
            class="absolute left-16 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity z-50 pointer-events-none whitespace-nowrap shadow-lg"
          >
            {{ menu.name }}
          </div>
        </router-link>
      </nav>
    </aside>

    <!-- 移动端顶部导航 (Mobile Top Nav) - 保持不变 -->
    <div class="md:hidden bg-white dark:bg-[#2b2d31] border-b border-gray-200 dark:border-[#1e1f22] sticky top-16 z-40 overflow-x-auto">
      <div class="flex px-4 py-3 space-x-3 min-w-max">
        <router-link 
          v-for="menu in menus" 
          :key="menu.path" 
          :to="menu.path"
          class="flex items-center px-3 py-1.5 rounded-full text-sm border transition-colors"
          :class="[
            route.path.includes(menu.path)
             ? 'bg-sky-50 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400 border-sky-200 dark:border-sky-700/50' 
             : 'bg-gray-50 dark:bg-[#35373c] text-gray-600 dark:text-gray-300 border-gray-200 dark:border-[#1e1f22]'
          ]"
        >
          <span class="mr-1.5">{{ menu.icon }}</span>
          {{ menu.name }}
        </router-link>
      </div>
    </div>

    <!-- 主内容区域 (Main Content) -->
    <!-- Modified: md:mt-16 用于补偿桌面端移除的 pt-16，确保内容不被导航栏遮挡 -->
    <main class="flex-1 p-4 md:p-8 md:mt-16 overflow-x-hidden w-full">
      <!-- 内容容器 -->
      <div class="max-w-6xl mx-auto bg-white dark:bg-[#2b2d31] min-h-[500px] rounded-xl shadow-sm border border-gray-200 dark:border-[#1e1f22] p-6 transition-all duration-300">
        <router-view v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </div>
    </main>
  </div>
</template>

<style scoped>
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