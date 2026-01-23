<script setup>
import { ref, onMounted } from 'vue'
import axios from 'axios'
import HomeSocialLinks from '../../components/HomeSocialLinks.vue'

const links = ref([])
const loading = ref(true)
const errorMsg = ref('')

const defaultLinks = [
  {
    title: 'Bilibili 官方账号',
    subtitle: 'UID: 444257435',
    extra: '投稿联系管理员: Taropoi',
    url: 'https://space.bilibili.com/444257435',
    iconText: 'B'
  },
  {
    title: 'QQ 直播频道',
    subtitle: '游戏直播分享',
    extra: '点击加入频道',
    url: 'https://pd.qq.com/s/fxsvvaqqt',
    iconText: '🎮'
  }
]

const fetchLinks = async () => {
  try {
    const res = await axios.get('/api/config')
    if (res.data?.home_links) {
      links.value = JSON.parse(res.data.home_links)
    } else {
      links.value = defaultLinks
    }
  } catch (e) {
    errorMsg.value = '后端连接异常，请联系管理员Taropoi'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  fetchLinks()
})
</script>

<template>
  <div class="min-h-screen bg-gradient-to-b from-purple-50 via-white to-pink-50 dark:from-slate-900 dark:via-slate-950 dark:to-slate-900 font-sans">
    <div class="max-w-6xl mx-auto px-4 py-14">
      <div class="text-center mb-10">
        <div class="inline-flex items-center gap-2 px-4 py-1 rounded-full bg-purple-100 dark:bg-slate-800 text-purple-700 dark:text-purple-200 text-xs font-bold border border-purple-200 dark:border-slate-700">
          幻想乡 · 外界通讯
        </div>
        <h1 class="text-4xl md:text-5xl font-bold text-gray-800 dark:text-gray-100 font-serif mt-4">
          🌸 幻想乡社交结界
        </h1>
        <p class="text-gray-500 dark:text-gray-400 mt-3">Touhou Social Links & Community Gateway</p>
      </div>

      <div v-if="loading" class="text-center py-16 text-gray-400 dark:text-gray-300">
        <div class="animate-spin text-3xl mb-2">⏳</div>
        <p>正在建立外界链接...</p>
      </div>

      <div v-else-if="errorMsg" class="text-center py-16 text-red-500">
        <p class="font-bold">{{ errorMsg }}</p>
      </div>

      <div v-else class="bg-white/70 dark:bg-slate-900/70 backdrop-blur rounded-2xl p-6 shadow-sm border border-purple-100 dark:border-slate-800">
        <HomeSocialLinks :links="links" />
      </div>

      <div class="mt-10 text-center text-xs text-gray-400 dark:text-gray-300">
        <span class="px-3 py-1 rounded-full bg-white/70 dark:bg-slate-900/70 border border-gray-200 dark:border-slate-700">结界提示：点击卡片即可前往</span>
      </div>
    </div>
  </div>
</template>
