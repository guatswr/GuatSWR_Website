<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from '../stores/user'
import { ElMessageBox } from 'element-plus'

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()

const isSuperAdmin = computed(() => userStore.isSuperAdmin)

const menus = [
  { path: '/admin/activities', label: '📝 异变管理' },
  { path: '/admin/events', label: '⚖️ 活动审核' },
  { path: '/admin/history', label: '📜 群史管理' },
  { path: '/admin/members', label: '👥 住民管理' },
  { path: '/admin/logs', label: '🔍 系统日志' },
  { path: '/admin/home-links', label: '🔗 首页外链' },
  { path: '/admin/config', label: '⚙️ 全局设置' },
  { path: '/admin/backups', label: '🗄️ 备份管理', super: true },
  { path: '/admin/profile', label: '👤 个人设置' },
  { path: '/admin/users', label: '🔑 账号权限', super: true },
  { path: '/api/docs', label: '📚 API 文档', external: true }
]

const handleLogout = async () => {
  try {
    await ElMessageBox.confirm('退出后将清除登录状态，是否继续', '确认退出', {
      type: 'warning',
      confirmButtonText: '退出',
      cancelButtonText: '取消'
    })
    userStore.clearAuth()
    router.push('/login')
  } catch (err) {
    if (err !== 'cancel') throw err
  }
}
</script>

<template>
  <div class="min-h-screen bg-gray-100 font-sans">
    <header class="bg-gray-800 text-white shadow-md sticky top-0 z-50">
      <div class="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
        <h1 class="text-xl font-bold font-serif">幻想乡管理事务所</h1>
        <div class="flex items-center gap-4 text-sm">
          <div class="flex items-center gap-2">
            <img v-if="userStore.avatar" :src="userStore.avatar" class="w-8 h-8 rounded-full border border-gray-600 object-cover">
            <div class="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center text-xs" v-else>{{ (userStore.username || '?').charAt(0) }}</div>
            <div class="flex flex-col items-end">
              <span class="font-bold">{{ userStore.username }}</span>
              <span class="text-xs px-2 rounded-full" :class="isSuperAdmin?'bg-blue-600':'bg-gray-600'">{{ isSuperAdmin?'站长':'管理员' }}</span>
            </div>
          </div>
          <button @click="handleLogout" class="text-red-400 hover:text-red-300">退出</button>
        </div>
      </div>
    </header>

    <main class="max-w-7xl mx-auto px-4 py-8">
      <div class="flex flex-wrap gap-2 mb-8 border-b border-gray-200 bg-white p-2 rounded-lg shadow-sm">
        <template v-for="item in menus" :key="item.path">
          <router-link
            v-if="!item.external"
            v-show="!item.super || isSuperAdmin"
            :to="item.path"
            class="px-4 py-2 rounded-md font-medium transition capitalize"
            :class="route.path === item.path ? 'bg-gray-800 text-white shadow' : 'text-gray-600 hover:bg-gray-100'"
          >
            {{ item.label }}
          </router-link>
          <a
            v-else
            v-show="!item.super || isSuperAdmin"
            :href="item.path"
            target="_blank"
            rel="noopener noreferrer"
            class="px-4 py-2 rounded-md font-medium transition capitalize text-gray-600 hover:bg-gray-100"
          >
            {{ item.label }}
          </a>
        </template>
      </div>

      <router-view />
    </main>
  </div>
</template>
