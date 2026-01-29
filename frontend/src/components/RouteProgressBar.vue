<script setup>
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const isRouteLoading = ref(false)
const routeProgress = ref(0)
const progressTotal = ref(0)
const progressDone = ref(0)
const hasRealProgress = ref(false)
const isProgressDebug = ref(false)

// 资源计数
let pendingResources = 0

// 定时器与引用
let finishTimer = null
let idleFinishTimer = null
let hardFinishTimer = null
let imageObserver = null
let animationFrameId = null // 替换 setInterval
let debounceTimer = null    // 用于防抖

// 路由钩子移除函数
let removeBeforeHook = null
let removeAfterHook = null
let removeErrorHook = null

// 调试日志
const debugLog = (...args) => {
  if (!isProgressDebug.value) return
  console.debug('[route-progress]', ...args)
}

// 缓动函数
const easeOutFast = (t) => 1 - Math.pow(1 - t, 3)

const isProgressDisabled = (route) => Boolean(route?.meta?.disableRouteProgress)

// ----------------------
// 1. 核心动画循环优化 (使用 rAF)
// ----------------------
const updateProgressLoop = () => {
  if (!isRouteLoading.value) return

  // 1. 处理“真实”进度 (图片/资源加载)
  if (hasRealProgress.value && progressTotal.value > 0) {
    const ratio = Math.min(1, progressDone.value / progressTotal.value)
    const eased = easeOutFast(ratio)
    const target = Math.round(12 + eased * 82)
    if (target > routeProgress.value) {
      routeProgress.value = target
    }
    if (ratio >= 1) {
      finishRouteProgress()
      return
    }
  } 
  // 2. 处理“虚假”进度 (自动缓慢增加)
  else if (routeProgress.value < 60) {
    const next = routeProgress.value + (60 - routeProgress.value) * 0.05 // 简单的平滑插值
    routeProgress.value = Math.min(60, next)
  }

  // 继续下一帧
  animationFrameId = requestAnimationFrame(updateProgressLoop)
}

const startAnimation = () => {
  if (animationFrameId) cancelAnimationFrame(animationFrameId)
  updateProgressLoop()
}

const stopAnimation = () => {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId)
    animationFrameId = null
  }
}

// ----------------------
// 2. 资源管理逻辑
// ----------------------
const handleResourceStart = () => {
  if (!isRouteLoading.value) return
  pendingResources += 1
  progressTotal.value += 1
  hasRealProgress.value = true
  // 移除 updateProgressFromReal，逻辑合并进 Loop 中
}

const handleResourceDone = () => {
  if (!isRouteLoading.value) return
  if (pendingResources > 0) pendingResources -= 1
  progressDone.value += 1
  
  if (pendingResources === 0) {
    if (idleFinishTimer) clearTimeout(idleFinishTimer)
    idleFinishTimer = setTimeout(() => {
      finishRouteProgress()
    }, 200)
  }
}

// ----------------------
// 3. DOM 扫描优化 (防抖 + 限制频率)
// ----------------------
const scanImages = () => {
  const main = document.querySelector('main') // 建议给你的 main 加个 id 比如 #app-main 性能会更好
  if (!main) return
  
  // 这里的 querySelectorAll 依然耗时，所以必须依赖外部的防抖
  const imgs = main.querySelectorAll('img:not([data-progress-tracked])')
  
  if (imgs.length === 0) return
  
  debugLog('scan images', { newImages: imgs.length })

  imgs.forEach((img) => {
    img.dataset.progressTracked = '1'
    
    // 如果图片已经加载完成（缓存命中），直接跳过，不要增加进度条负担
    if (img.complete && img.naturalWidth > 0) return 

    handleResourceStart()
    
    let finished = false
    let timeoutId = null
    
    const done = () => {
      if (finished) return
      finished = true
      if (timeoutId) clearTimeout(timeoutId)
      
      // 清理事件，避免内存泄漏
      img.removeEventListener('load', done)
      img.removeEventListener('error', done)
      handleResourceDone()
    }

    img.addEventListener('load', done, { once: true })
    img.addEventListener('error', done, { once: true })
    // 缩短超时时间，6秒太长，图片加载通常不会这么久
    timeoutId = setTimeout(done, 4000) 
  })
}

// 防抖函数：避免 MutationObserver 频繁触发导致卡顿
const debouncedScan = () => {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    scanImages()
  }, 100) // 100ms 的缓冲期
}

// ----------------------
// 4. 流程控制
// ----------------------
const startRouteProgress = () => {
  // 清理上一轮可能残留的定时器
  cancelRouteProgress()
  
  isRouteLoading.value = true
  routeProgress.value = 0 // 从0开始，样式上有过渡
  progressTotal.value = 0
  progressDone.value = 0
  hasRealProgress.value = false
  pendingResources = 0
  
  // 启动动画循环
  startAnimation()
  
  // 兜底强制结束
  hardFinishTimer = setTimeout(() => {
    finishRouteProgress()
  }, 8000)
}

const cancelRouteProgress = () => {
  stopAnimation()
  if (debounceTimer) clearTimeout(debounceTimer)
  if (idleFinishTimer) clearTimeout(idleFinishTimer)
  if (hardFinishTimer) clearTimeout(hardFinishTimer)
  if (finishTimer) clearTimeout(finishTimer)
  
  if (imageObserver) {
    imageObserver.disconnect()
    imageObserver = null
  }
  
  isRouteLoading.value = false
  routeProgress.value = 0
  pendingResources = 0
}

const finishRouteProgress = () => {
  // 即使结束，也先停止动画循环和观察者
  stopAnimation()
  if (imageObserver) {
    imageObserver.disconnect()
    imageObserver = null
  }
  
  routeProgress.value = 100
  
  if (finishTimer) clearTimeout(finishTimer)
  finishTimer = setTimeout(() => {
    isRouteLoading.value = false
    // 延迟重置，等待透明度动画完成
    setTimeout(() => { routeProgress.value = 0 }, 200)
  }, 300)
}

// ----------------------
// 5. 生命周期与钩子
// ----------------------
const handleRequestStart = () => handleResourceStart()
const handleRequestEnd = () => handleResourceDone()

onMounted(() => {
  // Debug 开关逻辑保持不变
  isProgressDebug.value = localStorage.getItem('route-progress-debug') === '1'
  window.__setRouteProgressDebug = (value) => { /* ...保持原样... */ }
  
  window.addEventListener('route-progress:request-start', handleRequestStart)
  window.addEventListener('route-progress:request-end', handleRequestEnd)

  removeBeforeHook = router.beforeEach((to) => {
    if (isProgressDisabled(to)) return true
    startRouteProgress()
    return true
  })

  removeAfterHook = router.afterEach(async (to) => {
    if (isProgressDisabled(to)) {
      cancelRouteProgress()
      return
    }
    
    // 立即进行一次扫描（针对同步渲染的内容）
    await nextTick()
    scanImages() 

    // 设置观察者监听异步内容
    const main = document.querySelector('main')
    if (main) {
      if (imageObserver) imageObserver.disconnect()
      imageObserver = new MutationObserver((mutations) => {
        // 性能优化：检查是否真的有节点被添加，忽略属性变化
        const hasAddedNodes = mutations.some(m => m.addedNodes.length > 0)
        if (hasAddedNodes) {
          debouncedScan()
        }
      })
      // 依然监听 subtree，但依靠 debouncedScan 保护性能
      imageObserver.observe(main, { childList: true, subtree: true })
      
      // 3秒后停止监听 DOM，认为页面已稳定
      setTimeout(() => {
        if (imageObserver) {
          imageObserver.disconnect()
          imageObserver = null
        }
      }, 3000) 
    }
    
    // 如果没有检测到任何资源，短时间后自动结束
    idleFinishTimer = setTimeout(() => {
      if (!hasRealProgress.value || progressTotal.value === 0) {
        finishRouteProgress()
      }
    }, 500)
  })

  removeErrorHook = router.onError(() => finishRouteProgress())
})

onUnmounted(() => {
  window.removeEventListener('route-progress:request-start', handleRequestStart)
  window.removeEventListener('route-progress:request-end', handleRequestEnd)
  cancelRouteProgress()
  if (removeBeforeHook) removeBeforeHook()
  if (removeAfterHook) removeAfterHook()
  if (removeErrorHook) removeErrorHook()
})
</script>

<template>
  <div class="route-progress" aria-hidden="true">
    <div
      class="route-progress__bar"
      :style="{ 
        width: `${routeProgress}%`, 
        opacity: isRouteLoading ? 1 : 0 
      }"
    ></div>
  </div>
</template>

<style scoped>
/* 样式部分保持不变，或者可以移除 transition: width ... 
   因为 rAF 更新已经足够平滑，但保留它能起到插值作用，建议保留 */
.route-progress {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  z-index: 70;
  pointer-events: none;
}

.route-progress__bar {
  height: 100%;
  width: 0;
  background: linear-gradient(90deg, #e0f2fe 0%, #7dd3fc 55%, #38bdf8 100%);
  box-shadow: 0 0 6px rgba(56, 189, 248, 0.35);
  /* 优化：只对 opacity 做过渡，width 由 JS 高频控制，或者保留 width 过渡让 JS 更新频率降低 */
  transition: width 0.2s linear, opacity 0.25s ease;
}

:global(.dark) .route-progress__bar {
  background: linear-gradient(90deg, #0b2a3c 0%, #1e3a8a 45%, #38bdf8 100%);
  box-shadow: 0 0 8px rgba(56, 189, 248, 0.5);
}
</style>