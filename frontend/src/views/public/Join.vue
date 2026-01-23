<script setup>
import { ref, onMounted, computed } from 'vue'
import axios from 'axios'

const loading = ref(true)
const siteConfig = ref({
  join_bg: '',
  qq_qr_image: ''
})


// 计算背景样式
const bgStyle = computed(() => {
  if (siteConfig.value.join_bg) {
    return {
      backgroundImage: `url('${siteConfig.value.join_bg}')`,
      backgroundSize: 'cover',
      backgroundPosition: 'center'
    }
  }
  // 如果没有配置背景图，使用默认的清新渐变背景
  return {
    background: 'linear-gradient(135deg, #e0c3fc 0%, #8ec5fc 100%)'
  }
})

// 计算二维码图片
const qrCode = computed(() => siteConfig.value.qq_qr_image || '')

const fetchConfig = async () => {
  try {
    const res = await axios.get('/api/config')
    if (res.data) {
      siteConfig.value = res.data
    }
  } catch (error) {
    console.error("加载配置失败", error)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  fetchConfig()
})
</script>

<template>
  <div class="min-h-screen flex flex-col items-center justify-center p-4 transition-all duration-700 relative overflow-hidden" :style="!siteConfig.join_bg ? bgStyle : {}">
    
    <!-- 背景图片层 (独立出来以便做模糊处理) -->
    <div v-if="siteConfig.join_bg" 
         class="absolute inset-0 bg-cover bg-center transition-all duration-1000 scale-105 blur-sm"
         :style="bgStyle">
    </div>
    
    <!-- 遮罩层: 统一色调，增加对比度 -->
    <div class="absolute inset-0 bg-gradient-to-br from-blue-900/10 to-pink-900/10 mix-blend-overlay"></div>
    <div v-if="siteConfig.join_bg" class="absolute inset-0 bg-black/20"></div>

    <!-- 卡片主体 (增加透明效果 bg-white/60) -->
    <div class="relative z-10 w-full max-w-md bg-white/60 backdrop-blur-xl p-8 rounded-3xl shadow-[0_8px_32px_0_rgba(31,38,135,0.2)] border border-white/40 text-center overflow-hidden transition-all duration-500 hover:shadow-[0_8px_40px_0_rgba(31,38,135,0.3)]">
      
      <!-- 顶部装饰光条 -->
      <div class="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-sky-400 via-pink-400 to-sky-400 opacity-80"></div>
      
      <!-- 装饰圆点 (增加氛围感) -->
      <div class="absolute -top-12 -right-12 w-40 h-40 bg-blue-400/20 rounded-full blur-3xl pointer-events-none"></div>
      <div class="absolute -bottom-12 -left-12 w-40 h-40 bg-pink-400/20 rounded-full blur-3xl pointer-events-none"></div>

      <!-- 标题区 -->
      <h1 class="text-3xl font-bold text-gray-800 mb-1 tracking-tight drop-shadow-sm">加入桂航绯想天</h1>
      <p class="text-gray-600 text-sm mb-8 font-serif tracking-widest uppercase font-medium">Guat Touhou Fans Club</p>

      <!-- 二维码容器 -->
      <div class="group relative w-64 h-64 mx-auto mb-8 bg-white/80 backdrop-blur-sm rounded-2xl p-3 shadow-inner border border-white/50">
        <div class="w-full h-full rounded-xl overflow-hidden relative">
            <div v-if="loading" class="absolute inset-0 flex items-center justify-center bg-gray-50/50 text-blue-400">
                <span class="animate-spin text-3xl">⏳</span>
            </div>
              <img v-else-if="qrCode" :src="qrCode" alt="QQ QR Code" 
                class="w-full h-full object-contain transition duration-500 group-hover:scale-105 cursor-pointer">
              <div v-else class="w-full h-full flex items-center justify-center text-sm text-gray-400">未配置二维码</div>
        </div>
        
        <!-- 扫码提示角标 (悬浮效果) -->
        <div class="absolute -bottom-4 -right-4 bg-gradient-to-r from-sky-500 to-blue-600 text-white text-xs font-bold px-4 py-1.5 rounded-full shadow-lg border-2 border-white/80 transform transition duration-300 group-hover:-translate-y-2 group-hover:scale-105 flex items-center gap-1">
          <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M3 3h18v18H3V3zm16 16V5H5v14h14zM7 7h4v4H7V7zm6 0h4v4h-4V7zM7 13h4v4H7v-4zm6 0h4v4h-4v-4z"/></svg>
          QQ 扫一扫
        </div>
      </div>

      <!-- 说明区 -->
      <div class="space-y-4">
        <div class="flex items-center justify-center gap-2 text-gray-700 bg-sky-50/60 p-3 rounded-xl border border-sky-100/50 backdrop-blur-sm shadow-sm">
          <svg class="w-5 h-5 text-sky-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          <span class="font-medium text-sm">入群问题：你是怎么入坑东方的？</span>
        </div>
        
        <div class="text-sm text-gray-700 bg-white/40 p-5 rounded-xl text-left leading-relaxed shadow-sm border border-white/40 backdrop-blur-md">
          <p class="font-bold text-gray-800 mb-2 flex items-center gap-1">
            <span class="w-1.5 h-1.5 rounded-full bg-pink-500 shadow-[0_0_8px_rgba(236,72,153,0.6)]"></span> 入群须知：
          </p>
          <ul class="space-y-2 pl-2">
            <li class="flex items-start gap-2">
                <span class="text-gray-500 mt-1">•</span>
                <span>不管是否来自桂航/桂林高校，均欢迎加入！</span>
            </li>
            <li class="flex items-start gap-2">
                <span class="text-gray-500 mt-1">•</span>
                <span>进群后可以先和群友说一下从哪里找到的群哦~</span>
            </li>
            <li class="flex items-start gap-2">
                <span class="text-gray-500 mt-1">•</span>
                <span class="text-pink-600 font-bold select-all bg-pink-50/80 px-1 rounded cursor-text border border-pink-100">禁止讨论政治敏感话题</span>
            </li>
          </ul>
        </div>
      </div>

      <!-- 底部返回 -->
      <div class="mt-8 pt-6 border-t border-gray-200/30">
        <router-link to="/" class="group inline-flex items-center gap-1 text-gray-600 hover:text-sky-600 transition font-medium text-sm bg-white/30 px-4 py-1.5 rounded-full hover:bg-white/50 backdrop-blur-sm">
          <span class="transform transition group-hover:-translate-x-1">←</span> 返回首页
        </router-link>
      </div>

    </div>
  </div>
</template>
