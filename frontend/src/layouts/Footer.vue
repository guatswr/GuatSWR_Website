<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

const footerRef = ref(null)
let footerObserver = null

const setFooterHeightVar = () => {
  if (!footerRef.value) return
  const h = footerRef.value.offsetHeight || 0
  document.documentElement.style.setProperty('--footer-h', `${h}px`)
}

onMounted(() => {
  setFooterHeightVar()
  if (window.ResizeObserver && footerRef.value) {
    footerObserver = new ResizeObserver(() => setFooterHeightVar())
    footerObserver.observe(footerRef.value)
  } else {
    window.addEventListener('resize', setFooterHeightVar)
  }
})

onUnmounted(() => {
  if (footerObserver) {
    footerObserver.disconnect()
    footerObserver = null
  }
  window.removeEventListener('resize', setFooterHeightVar)
})
</script>

<template>
  <footer ref="footerRef" class="bg-gray-800 text-white dark:bg-slate-950 dark:text-gray-200 py-10">
    <div class="max-w-7xl mx-auto px-4">
      <div class="border-t border-white/10 dark:border-white/5 pt-6">
        <div class="flex flex-col items-center gap-2 text-center">
          <p class="text-sm tracking-wide">© 2026 桂航绯想天同好会. All rights reserved.</p>
          <p class="text-xs text-gray-400 dark:text-gray-500">Designed by Taropoi</p>
          <a
            href="https://beian.miit.gov.cn/"
            target="_blank"
            rel="noopener noreferrer"
            class="text-xs text-gray-400 dark:text-gray-500 hover:text-white dark:hover:text-gray-200 transition-colors"
          >
            晋ICP备2026001481号
          </a>
        </div>
      </div>
    </div>
  </footer>
</template>