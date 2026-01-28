<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import axios from 'axios'
import { MdPreview } from 'md-editor-v3'
import { getThumbUrl } from '../../utils/image'
import ProgressiveImage from '../../components/ProgressiveImage.vue'
import { ElMessage } from 'element-plus'
import 'md-editor-v3/lib/preview.css'

const route = useRoute()
const router = useRouter()
const activity = ref(null)
const loading = ref(true)

// 灯箱状态
const lightboxOpen = ref(false)
const currentImage = ref('')

// 编辑器 ID
const id = 'preview-only'
const siteTitle = '桂航绯想天 | 车万同好会'
const defaultDescription = '桂航绯想天，车万同好会交流社区，提供群活动、成员、历史与社交链接等信息。'

const setMetaTag = (selector, attrs) => {
  let el = document.head.querySelector(selector)
  if (!el) {
    el = document.createElement('meta')
    document.head.appendChild(el)
  }
  Object.entries(attrs).forEach(([key, value]) => {
    el.setAttribute(key, value)
  })
}

const setCanonicalLink = (href) => {
  let link = document.head.querySelector('link[rel="canonical"]')
  if (!link) {
    link = document.createElement('link')
    link.setAttribute('rel', 'canonical')
    document.head.appendChild(link)
  }
  link.setAttribute('href', href)
}

const updateSeoFromActivity = (data) => {
  if (!data?.title) return
  const title = `${data.title} | 桂航绯想天`
  const description = data.description || defaultDescription
  const url = new URL(route.fullPath, window.location.origin).toString()
  const image = data.cover_image ? new URL(data.cover_image, window.location.origin).toString() : null

  document.title = title
  setMetaTag('meta[name="description"]', { name: 'description', content: description })
  setMetaTag('meta[property="og:title"]', { property: 'og:title', content: title })
  setMetaTag('meta[property="og:description"]', { property: 'og:description', content: description })
  setMetaTag('meta[property="og:url"]', { property: 'og:url', content: url })
  setMetaTag('meta[property="og:site_name"]', { property: 'og:site_name', content: siteTitle })
  setMetaTag('meta[property="og:type"]', { property: 'og:type', content: 'article' })
  setMetaTag('meta[name="twitter:card"]', { name: 'twitter:card', content: 'summary' })
  setMetaTag('meta[name="twitter:title"]', { name: 'twitter:title', content: title })
  setMetaTag('meta[name="twitter:description"]', { name: 'twitter:description', content: description })
  if (image) {
    setMetaTag('meta[property="og:image"]', { property: 'og:image', content: image })
    setMetaTag('meta[name="twitter:image"]', { name: 'twitter:image', content: image })
  }
  setCanonicalLink(url)
}

// 移除 index.html 中的原生预加载层
const removePreLoader = () => {
  const loader = document.getElementById('pre-loading-screen')
  if (loader) {
    loader.style.opacity = '0'
    setTimeout(() => {
      if (loader) loader.remove()
    }, 400)
  }
}

// 获取活动详情
const fetchDetail = async () => {
  loading.value = true
  try {
    const res = await axios.get(`/api/activities/${route.params.id}`)
    activity.value = res.data
    updateSeoFromActivity(activity.value)
  } catch (error) {
    console.error('获取活动详情失败:', error)
    ElMessage.error('活动不存在或已删除')
    router.push('/activities')
  } finally {
    loading.value = false
    removePreLoader()
  }
}

const openLightbox = (src) => {
  currentImage.value = src
  lightboxOpen.value = true
}

onMounted(() => {
  fetchDetail()
  document.documentElement.classList.add('activity-detail-bg')
  document.body.classList.add('activity-detail-bg')
})

onUnmounted(() => {
  document.documentElement.classList.remove('activity-detail-bg')
  document.body.classList.remove('activity-detail-bg')
})
</script>

<template>
  <div class="min-h-screen relative font-sans overflow-x-hidden bg-transparent dark:bg-slate-950">

    <!-- [局部加载动画] -->
    <Transition name="fade-fast">
      <div v-if="loading" class="fixed inset-0 z-[100] bg-white dark:bg-slate-950 flex flex-col items-center justify-center">
        <div class="loader-unit flex flex-col items-center animate-[floating_3s_ease-in-out_infinite]">
          <div class="taiji-spinner relative w-20 h-20 mb-6">
            <div class="absolute inset-0 border-4 border-gray-100 dark:border-slate-800 rounded-full"></div>
            <div class="absolute inset-0 border-4 border-red-600 rounded-full border-t-transparent animate-spin"></div>
            <div class="absolute inset-0 flex items-center justify-center text-4xl text-red-600">☯</div>
          </div>
          <svg class="w-60 h-10" viewBox="0 0 240 40">
            <text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" class="font-serif font-bold text-xl fill-gray-700 dark:fill-gray-200">
              少女祈祷中<tspan class="dot-1">·</tspan><tspan class="dot-2">·</tspan><tspan class="dot-3">·</tspan>
            </text>
          </svg>
        </div>
      </div>
    </Transition>

    <!-- [动态背景] -->
    <div v-if="activity" class="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
      <ProgressiveImage
        :src="activity.cover_image"
        :thumb="getThumbUrl(activity.cover_image)"
        alt="Background"
        wrapperClass="absolute inset-0"
        imgClass="w-full h-full object-cover blur-2xl scale-110 opacity-70 transition-all duration-1000"
      />
      <div class="absolute inset-0 bg-white/10 dark:bg-black/30 backdrop-brightness-95 dark:backdrop-brightness-75"></div>
    </div>

    <!-- [内容展示] -->
    <Transition name="fade-content">
      <div v-if="!loading && activity" class="relative z-10 w-full md:max-w-5xl mx-auto my-6 md:my-12 bg-white/80 dark:bg-slate-900/90 backdrop-blur-md backdrop-saturate-150 md:rounded-2xl shadow-2xl overflow-hidden min-h-[calc(100vh-3rem)] md:min-h-0">
        
        <!-- 封面 -->
        <div class="h-[300px] md:h-[550px] w-full relative group overflow-hidden">
          <ProgressiveImage
            :src="activity.cover_image"
            :thumb="getThumbUrl(activity.cover_image)"
            alt="Cover"
            wrapperClass="w-full h-full"
            imgClass="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
          />
          <div class="absolute inset-0 bg-black/40"></div>
          
          <div class="absolute inset-0 flex items-end p-6 md:p-12">
            <div class="w-full max-w-4xl">
              <div class="flex flex-col items-start gap-4 animate-[slideUp_0.6s_ease-out]">
                <div class="flex flex-wrap items-center gap-3 text-white/90 text-sm font-mono tracking-wider drop-shadow-md">
                  <span class="inline-flex items-center gap-2">
                    <span class="bg-red-600 w-2 h-4 rounded-sm shadow-sm"></span>
                    <span>{{ activity.date }}</span>
                  </span>
                  <span class="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1 rounded-full bg-white/15 text-white border border-white/20 backdrop-blur">
                    <span class="text-[10px]">🏷️</span>
                    {{ activity.tag || '未标注' }}
                  </span>
                </div>
                <h1 class="text-3xl md:text-5xl lg:text-6xl font-bold !text-white font-serif tracking-wide leading-tight drop-shadow-lg">
                  {{ activity.title }}
                </h1>
              </div>
            </div>
          </div>

          <button @click="router.back()" class="absolute top-4 left-4 md:top-8 md:left-8 bg-black/20 hover:bg-black/40 text-white px-4 py-2 md:px-5 md:py-2.5 rounded-full backdrop-blur-md transition border border-white/20 flex items-center gap-2 group/back shadow-lg z-20">
            <span class="transform group-hover/back:-translate-x-1 transition text-sm md:text-base">← 返回</span> 
          </button>
        </div>

        <!-- 正文 -->
        <div class="p-6 md:p-12 bg-transparent relative">
          
          <div class="flex flex-wrap items-center gap-6 mb-8 pb-6 border-b border-gray-200/60 dark:border-slate-700/70">
            <div class="flex items-center gap-3">
              <ProgressiveImage
                v-if="activity.created_by_avatar"
                :src="activity.created_by_avatar"
                :thumb="getThumbUrl(activity.created_by_avatar)"
                alt="Avatar"
                wrapperClass="w-10 h-10"
                imgClass="w-10 h-10 rounded-full border border-gray-200 dark:border-slate-700 object-cover shadow-sm"
              />
              <div v-else class="w-10 h-10 rounded-full bg-blue-100 dark:bg-slate-800 text-blue-500 dark:text-blue-200 flex items-center justify-center font-bold shadow-sm text-sm">
                {{ (activity.created_by || 'A').charAt(0).toUpperCase() }}
              </div>
              <div>
                <p class="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-bold">发布者</p>
                <p class="text-sm font-bold text-gray-800 dark:text-gray-100">{{ activity.created_by || '未知用户' }}</p>
              </div>
            </div>

            <div v-if="activity.updated_by" class="flex items-center gap-3 pl-6 border-l border-gray-200/60 dark:border-slate-700/70">
              <ProgressiveImage
                v-if="activity.updated_by_avatar"
                :src="activity.updated_by_avatar"
                :thumb="getThumbUrl(activity.updated_by_avatar)"
                alt="Avatar"
                wrapperClass="w-10 h-10"
                imgClass="w-10 h-10 rounded-full border border-gray-200 dark:border-slate-700 object-cover shadow-sm"
              />
              <div v-else class="w-10 h-10 rounded-full bg-orange-100 dark:bg-slate-800 text-orange-500 dark:text-orange-200 flex items-center justify-center font-bold shadow-sm text-sm">
                {{ activity.updated_by.charAt(0).toUpperCase() }}
              </div>
              <div>
                <p class="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-bold">最后编辑</p>
                <p class="text-sm font-bold text-gray-800 dark:text-gray-100">{{ activity.updated_by }}</p>
              </div>
            </div>
          </div>

          <div v-if="activity.description" class="bg-gray-50/80 dark:bg-slate-800/80 border-l-4 border-red-500 p-5 md:p-8 mb-10 text-gray-600 dark:text-gray-200 italic rounded-r-xl shadow-sm leading-relaxed text-sm md:text-base backdrop-blur-sm">
            {{ activity.description }}
          </div>

          <div class="markdown-body bg-white dark:bg-slate-900 border border-gray-100/60 dark:border-slate-700 rounded-xl p-5 md:p-8">
            <!-- [样式修复] md-editor-v3 预览组件 -->
            <MdPreview :editorId="id" :modelValue="activity.content" />
          </div>
          
          <div v-if="activity.images && activity.images.length > 0" class="mt-16 pt-10 border-t border-gray-200/60 dark:border-slate-700/70">
            <h3 class="text-xl font-bold mb-6 font-serif text-gray-800 dark:text-gray-100 flex items-center gap-2">
              <span>📷</span> 活动剪影 (Highlights)
            </h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div 
                v-for="(img, idx) in activity.images" 
                :key="idx" 
                class="overflow-hidden rounded-xl shadow-md group cursor-zoom-in relative aspect-video bg-gray-100 dark:bg-slate-800"
                @click="openLightbox(img)"
              >
                <div class="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition z-10 flex items-center justify-center">
                  <span class="text-white opacity-0 group-hover:opacity-100 transition text-sm bg-black/50 px-3 py-1.5 rounded-full backdrop-blur-sm border border-white/20">🔍 点击查看大图</span>
                </div>
                <ProgressiveImage
                  :src="img"
                  :thumb="getThumbUrl(img)"
                  alt="Gallery image"
                  wrapperClass="w-full h-full"
                  imgClass="w-full h-full object-cover transform group-hover:scale-105 transition duration-700"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <!-- 灯箱 -->
    <div v-if="lightboxOpen" 
         class="fixed inset-0 z-[110] bg-black/95 backdrop-blur-md flex items-center justify-center p-2 md:p-4 transition-opacity duration-300" 
         @click="lightboxOpen = false">
      <div class="relative max-w-7xl max-h-full flex flex-col items-center justify-center w-full h-full">
        <img :src="currentImage" class="max-w-full max-h-[85vh] rounded-lg shadow-2xl object-contain select-none animate-[zoomIn_0.3s_ease-out]" @click.stop alt="Full view">
        <button class="absolute top-4 right-4 md:-top-2 md:-right-12 text-white/70 hover:text-white text-4xl font-light transition focus:outline-none bg-black/20 md:bg-transparent rounded-full w-10 h-10 flex items-center justify-center" @click.stop="lightboxOpen = false">&times;</button>
        <p class="text-white/50 text-sm mt-4 font-mono hidden md:block">点击任意处关闭</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
:deep(.md-editor-preview-wrapper) { 
  padding: 0;
  background: transparent !important;
}
:deep(html.dark .md-editor-preview-wrapper) {
  background: transparent !important;
}
:deep(.md-editor-preview) { 
  font-family: inherit; 
  font-size: 1.05rem; 
  line-height: 1.8; 
  color: #374151; 
  /* [核心修复] 强制背景透明，消除突兀的白色色块 */
  background: transparent !important; 
}
:deep(html.dark .md-editor-preview) {
  color: #e5e7eb;
  background: transparent !important;
}

/* 适配暗色模式或自定义主题时的代码块背景 */
:deep(.md-editor-code) {
  background-color: #f3f4f6 !important; /* gray-100 */
  border-radius: 0.5rem;
}
:deep(html.dark .md-editor-code) {
:deep(.markdown-body .md-editor-preview-wrapper) {
  background: transparent !important;
}
:deep(.markdown-body .md-editor-preview) {
  background: transparent !important;
}
  background-color: #111827 !important;
}

@media (max-width: 768px) {
  :deep(.md-editor-preview) { font-size: 1rem; line-height: 1.6; }
}

:deep(h1), :deep(h2), :deep(h3) { margin-top: 1.5em; margin-bottom: 0.8em; font-weight: 700; color: #1f2937; }
:deep(html.dark h1), :deep(html.dark h2), :deep(html.dark h3) { color: #f3f4f6; }
:deep(p) { margin-bottom: 1.2em; }
:deep(ul), :deep(ol) { margin-bottom: 1.2em; padding-left: 1.5em; }
:deep(blockquote) { border-left-color: #ef4444; background-color: #f9fafb; padding: 0.5em 1em; color: #6b7280; }
:deep(html.dark blockquote) { background-color: #0f172a; color: #cbd5f5; }

.dot-1 { animation: ping-pong-dot-1 2.4s step-end infinite; }
.dot-2 { animation: ping-pong-dot-2 2.4s step-end infinite; }
.dot-3 { animation: ping-pong-dot-3 2.4s step-end infinite; }

@keyframes ping-pong-dot-1 { 0% { visibility: visible; } 50% { visibility: hidden; } 66.6% { visibility: visible; } }
@keyframes ping-pong-dot-2 { 0% { visibility: visible; } 33.3% { visibility: hidden; } 83.3% { visibility: visible; } }
@keyframes ping-pong-dot-3 { 0% { visibility: visible; } 16.6% { visibility: hidden; } }

@keyframes floating { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }

.fade-fast-leave-active { transition: opacity 0.3s ease; }
.fade-fast-leave-to { opacity: 0; }
.fade-content-enter-active { transition: opacity 0.4s ease-out; }
.fade-content-enter-from { opacity: 0; }

@keyframes zoomIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
@keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
</style>
