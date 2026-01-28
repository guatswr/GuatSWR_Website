<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { getThumbUrl } from '../../utils/image'
import HomeSocialLinks from '../../components/HomeSocialLinks.vue'
import ProgressiveImage from '../../components/ProgressiveImage.vue'
import axios from 'axios'

const router = useRouter()
const activities = ref([])
const loading = ref(true) // 默认开启加载状态
const gridRef = ref(null)
const containerWidth = ref(typeof window !== 'undefined' ? window.innerWidth : 1280)
let gridObserver = null
let resizeHandler = null

// 全局配置状态
const siteConfig = ref({
  home_bg: '', 
  banner_text: '',
  badge_image: '',
  mascot_image: '' 
})

const bgImage = computed(() => siteConfig.value.home_bg || '')
const badgeImage = computed(() => siteConfig.value.badge_image || '')
const mascotImage = computed(() => siteConfig.value.mascot_image || '')
const bgStyle = computed(() => {
  if (bgImage.value) {
    return { backgroundImage: `url('${bgImage.value}')` }
  }
  return { background: 'linear-gradient(135deg, #0f172a 0%, #1f2937 40%, #111827 100%)' }
})
const bannerText = computed(() => siteConfig.value.banner_text || 'Guat Touhou Fans Club')
const socialLinks = computed(() => {
  if (siteConfig.value.home_links) {
    try {
      const parsed = JSON.parse(siteConfig.value.home_links)
      if (Array.isArray(parsed)) {
        return parsed.filter((item) => item?.showOnHome !== false)
      }
    } catch (e) {
      // ignore
    }
  }
  return [
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
})

// 获取配置
const fetchConfig = async () => {
  try {
    const res = await axios.get('/api/config')
    if (res.data) siteConfig.value = res.data
  } catch (error) {
    console.error("加载全局配置失败:", error)
  }
}

// 获取活动
const fetchActivities = async () => {
  try {
    const res = await axios.get('/api/activities', { params: { page: 1, limit: 3 } })
    activities.value = res.data?.items || []
  } catch (error) {
    console.error("加载活动失败", error)
    activities.value = [] 
  }
}

const goJoin = () => {
  router.push('/join')
}

const displayCount = computed(() => {
  const width = containerWidth.value
  if (width < 640) return 2
  const minCardWidth = 260
  const count = Math.max(1, Math.floor(width / minCardWidth))
  return count
})

const visibleActivities = computed(() => {
  return activities.value.slice(0, displayCount.value)
})

// 移除原生加载层的辅助函数
const removePreLoader = () => {
  const loader = document.getElementById('pre-loading-screen')
  if (loader) {
    loader.style.opacity = '0'
    setTimeout(() => {
      loader.remove()
    }, 400) // 等待 CSS transition 动画结束
  }
}

onMounted(async () => {
  // 优先并行执行所有初始化数据请求
  try {
    await Promise.all([fetchConfig(), fetchActivities()])
  } finally {
    // 数据一旦返回，立即关闭 Vue 内部的 loading 状态
    loading.value = false
    // 同时移除 index.html 中的原生加载层
    removePreLoader()
  }

  if (typeof window !== 'undefined') {
    const updateWidth = () => {
      if (gridRef.value) {
        containerWidth.value = gridRef.value.offsetWidth || window.innerWidth
      } else {
        containerWidth.value = window.innerWidth
      }
    }

    updateWidth()

    if (window.ResizeObserver) {
      gridObserver = new ResizeObserver(() => updateWidth())
      if (gridRef.value) gridObserver.observe(gridRef.value)
    } else {
      resizeHandler = updateWidth
      window.addEventListener('resize', resizeHandler)
    }
  }
})

onUnmounted(() => {
  if (gridObserver) {
    gridObserver.disconnect()
    gridObserver = null
  }
  if (typeof window !== 'undefined') {
    if (resizeHandler) {
      window.removeEventListener('resize', resizeHandler)
      resizeHandler = null
    }
  }
})
</script>

<template>
  <div class="w-full bg-[#fdfdfd] dark:bg-slate-950 overflow-x-hidden font-sans">
    
    <!-- 这里不再需要重复的加载 HTML，逻辑已转移至 index.html 和 removePreLoader -->

    <!-- 主体内容 (载入完成后立即显示) -->
    <div v-if="!loading" class="animate-[fadeIn_0.4s_ease-out]">
      <!--Banner-->
      <div class="relative min-h-[calc(100svh-4rem)] flex items-center justify-center overflow-hidden">
        
        <!-- 背景 -->
        <ProgressiveImage
          v-if="bgImage"
          :src="bgImage"
          :thumb="getThumbUrl(bgImage)"
          alt="Background"
          wrapperClass="absolute inset-0"
          imgClass="w-full h-full object-cover transition-all duration-1000 scale-105 blur-sm"
        />
        <div
          v-else
          class="absolute inset-0 bg-cover bg-center transition-all duration-1000 scale-105 blur-sm"
          :style="bgStyle"
        ></div>
        
        <div class="absolute inset-0 bg-gradient-to-br from-blue-900/30 via-gray-900/20 to-red-900/30 mix-blend-multiply"></div>
        <div class="absolute inset-0 bg-black/20"></div>

        <!-- 装饰 -->
        <div class="absolute top-20 left-[15%] text-2xl animate-bounce text-blue-200 drop-shadow-md opacity-40">❄️</div>
        <div class="absolute bottom-32 right-[20%] text-3xl animate-pulse text-blue-100 drop-shadow-md opacity-40">❄️</div>

        <!-- 内容区域 -->
        <div class="relative z-10 text-center px-4 max-w-5xl mx-auto pt-10 flex flex-col items-center">
            <div class="mb-8 w-24 h-24 md:w-32 md:h-32 rounded-full border-[6px] border-white/90 shadow-[0_0_30px_rgba(255,255,255,0.4)] overflow-hidden transform -rotate-12 bg-white dark:bg-slate-900 z-10 transition duration-500 hover:scale-110 hover:rotate-0 flex items-center justify-center text-gray-400">
              <ProgressiveImage
                v-if="badgeImage"
                :src="badgeImage"
                :thumb="getThumbUrl(badgeImage)"
                alt="Badge"
                wrapperClass="w-full h-full"
                imgClass="w-full h-full object-cover"
              />
              <span v-else class="text-xs">未配置</span>
          </div>

          <div class="mb-6 relative">
              <h1 class="text-6xl md:text-8xl font-bold text-white tracking-widest" 
                  style="font-family: 'Noto Serif SC', serif; text-shadow: 0 4px 15px rgba(0,0,0,0.9), 0 0 2px rgba(0,0,0,0.5);">
              桂航绯想天
              </h1>
          </div>
          
          <p class="text-xl md:text-2xl text-blue-50 mb-8 font-serif tracking-wider uppercase border-y-2 border-blue-200/80 py-2 inline-block font-bold"
             style="text-shadow: 0 2px 4px rgba(0,0,0,0.9);">
            {{ bannerText }}
          </p>

          <div class="max-w-3xl mx-auto mb-12 p-4">
            <p class="text-lg md:text-2xl text-white leading-loose font-bold text-center" 
               style="text-shadow: 0 2px 8px rgba(0,0,0,0.95), 0 0 2px black;">
               跨越现世的境界,<br>
               我们因为热爱而相遇。<br>
               弹幕、格斗、音乐、二创,<br>
               一切热爱都能共鸣。
            </p>
          </div>

          <button 
            @click="goJoin"
            class="group inline-flex items-center gap-3 bg-[#12b7f5] hover:bg-[#0ea5e9] text-white px-10 py-4 rounded-full font-bold shadow-[0_0_20px_rgba(18,183,245,0.6)] transition transform hover:scale-105 border-2 border-white/50 relative overflow-hidden"
          >
              <span class="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 ease-in-out"></span>
              <svg class="w-7 h-7" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
                 <path d="M824.8 613.2c-16-51.4-34.4-94.6-62.7-165.3C766.5 262.2 689.3 112 511.5 112 331.7 112 256.2 265.2 261 447.9c-28.4 70.8-46.7 113.7-62.7 165.3-34 109.5-23 154.8-14.6 155.8 18 2.2 70.1-82.4 70.1-82.4 0 49 25.2 112.9 79.8 159-26.4 8.1-85.7 29.9-71.6 53.8 11.4 19.3 196.2 12.3 249.5 6.3 53.3 6 238.1 13 249.5-6.3 14.1-23.8-45.2-45.7-71.6-53.8 54.6-46.2 79.8-110.1 79.8-159 0 0 52.1 84.6 70.1 82.4 8.5-1.1 19.5-46.4-14.5-155.8z" />
              </svg>
              <span class="text-lg">欢迎入群~</span>
          </button>
        </div>
      </div>

      <!-- 社团介绍 & 动态展示 -->
      <section class="py-16 relative bg-gradient-to-b from-blue-50 to-white dark:from-slate-900 dark:to-slate-950">
          <div class="max-w-6xl mx-auto px-4 relative z-10">
              <div class="flex flex-col md:flex-row gap-10">
                  <!-- 左侧：公告文本 -->
                  <div class="md:w-3/5 space-y-8">
                        <div class="bg-white dark:bg-slate-900 p-8 rounded-2xl shadow-sm border-l-4 border-red-400 relative overflow-hidden">
                          <h2 class="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-4 flex items-center">
                            <span class="text-3xl mr-2">⛩️</span> 欢迎来到桂航一角的幻想乡
                          </h2>
                          <div class="prose text-gray-600 dark:text-gray-300 leading-relaxed">
                            <p class="mb-2">这里是本校东方众的聚集地：手残但瘾大的正作玩家、沉迷非想天则的格斗达人、只会喊“卧槽好听”的音乐爱好者、以及二创/磕CP设定党——统统欢迎。</p>
                            <p class="mb-2">你可以光明正大地讨论幻想乡的八卦，不用担心被当成中二病。我们社团活动包括但不限于：线下聚会（拼酒量堪比萃香？）、联机对战、甚至一起出C炸街（。</p>
                              <p class="mt-4 p-3 bg-blue-50 dark:bg-slate-800 rounded-lg border border-blue-100 dark:border-slate-700 text-blue-800 dark:text-blue-200 text-sm">
                              <span class="font-bold">小提示：</span>新人加群后可以联系管理，获取一枚<span class="font-bold">社团定制吧唧</span>哦~
                              </p>
                          </div>
                      </div>

                        <HomeSocialLinks :links="socialLinks" />
                  </div>

                  <!-- 右侧：看板娘区域 -->
                  <div class="md:w-2/5 flex items-center justify-center relative">
                      <div class="relative w-full aspect-[3/4] rounded-2xl overflow-hidden shadow-2xl transition duration-500 group">
                           <ProgressiveImage
                             v-if="mascotImage"
                             :src="mascotImage"
                             :thumb="getThumbUrl(mascotImage)"
                             alt="Mascot"
                             wrapperClass="w-full h-full"
                             imgClass="w-full h-full object-cover"
                           />
                           <div v-else class="w-full h-full flex items-center justify-center text-gray-300">未配置</div>
                          
                          <div class="absolute inset-0 bg-gradient-to-t from-blue-900/80 to-transparent flex flex-col justify-end p-6">
                              <div class="text-white">
                                  <div class="text-xs uppercase tracking-widest mb-1 text-blue-200">看起来很聪明的看板娘~</div>
                                  <h3 class="text-3xl font-bold mb-1 font-serif">琪露诺⑨</h3>
                                  <p class="text-blue-100 text-sm">"幻想乡最强!"</p>
                              </div>
                          </div>
                      </div>
                  </div>
              </div>
          </div>
      </section>

      <!-- 近期动态展示 -->
      <section class="py-20 bg-gray-900 text-white relative overflow-hidden min-h-[calc(100svh-var(--footer-h))]">
        <div class="max-w-7xl mx-auto px-4 relative z-10">
          <div class="flex flex-col md:flex-row justify-between items-end mb-12 border-b border-gray-700 pb-4">
            <div>
              <h2 class="text-3xl font-bold text-red-500 font-serif">近期异变</h2>
              <p class="text-sm text-gray-400 mt-1">Recent Activities</p>
            </div>
            <router-link to="/activities" class="text-sm text-gray-300 hover:text-white transition mt-4 md:mt-0">
              查看全部记录 <span class="ml-1 text-red-500">>></span>
            </router-link>
          </div>
          
          <div ref="gridRef" class="grid gap-6 grid-cols-[repeat(auto-fit,minmax(260px,1fr))]">
            <div v-for="activity in visibleActivities" :key="activity.id" 
                 class="group relative cursor-pointer bg-gray-800 rounded-lg overflow-hidden flex flex-col h-64"
                 @click="$router.push(`/activity/${activity.id}`)"
            >
              <div class="h-46 overflow-hidden">
                <ProgressiveImage
                  :src="activity.cover_image"
                  :thumb="getThumbUrl(activity.cover_image)"
                  alt="Event"
                  wrapperClass="w-full h-full"
                  imgClass="w-full h-full object-cover transition duration-700 group-hover:scale-110 opacity-80 group-hover:opacity-100"
                />
              </div>
              
              <div class="p-3 flex flex-col flex-1">
                <div class="flex items-center text-xs text-red-400 mb-2 font-mono">
                  <span>{{ activity.date }}</span>
                </div>
                <h3 class="text-lg font-bold text-gray-200 group-hover:text-red-500 transition font-serif line-clamp-1">{{ activity.title }}</h3>
                <p class="text-sm text-gray-500 mt-2 line-clamp-2">
                  {{ activity.description }}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* 移除 Vue 内部原有的加载层样式，现在由 index.html 处理 */
</style>
