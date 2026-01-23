<script setup>
import { computed, ref, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  links: {
    type: Array,
    default: () => []
  }
})

const clamp = (value, min, max) => Math.min(Math.max(value, min), max)

const hexToRgb = (color) => {
  if (!color || typeof color !== 'string') return null
  const hex = color.trim().replace('#', '')
  if (![3, 6].includes(hex.length)) return null
  const full = hex.length === 3
    ? hex.split('').map((c) => c + c).join('')
    : hex
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  if ([r, g, b].some((v) => Number.isNaN(v))) return null
  return { r, g, b }
}

const rgbToHex = ({ r, g, b }) => {
  const toHex = (v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

const mixWith = (rgb, target, ratio) => {
  const w = clamp(ratio, 0, 1)
  return {
    r: rgb.r * (1 - w) + target.r * w,
    g: rgb.g * (1 - w) + target.g * w,
    b: rgb.b * (1 - w) + target.b * w
  }
}

const getAutoCardColors = (iconBg, isDark) => {
  const rgb = hexToRgb(iconBg)
  if (!rgb) return null
  const bg = isDark
    ? mixWith(rgb, { r: 0, g: 0, b: 0 }, 0.65)
    : mixWith(rgb, { r: 255, g: 255, b: 255 }, 0.86)
  const border = isDark
    ? mixWith(bg, { r: 255, g: 255, b: 255 }, 0.18)
    : mixWith(rgb, { r: 255, g: 255, b: 255 }, 0.72)
  return {
    bg: rgbToHex(bg),
    border: rgbToHex(border)
  }
}

const getAutoTextColor = (iconBg) => {
  const rgb = hexToRgb(iconBg)
  if (!rgb) return null
  const text = mixWith(rgb, { r: 0, g: 0, b: 0 }, 0.78)
  return rgbToHex(text)
}

const isDarkMode = ref(false)
let classObserver = null

const updateDarkMode = () => {
  if (typeof document === 'undefined') return
  isDarkMode.value = document.documentElement.classList.contains('dark')
}

onMounted(() => {
  updateDarkMode()
  classObserver = new MutationObserver(updateDarkMode)
  classObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
})

onUnmounted(() => {
  if (classObserver) classObserver.disconnect()
})

const themedLinks = computed(() => {
  return (props.links || []).map((item, index) => {
    const isPink = index % 2 === 0
    const autoColors = item?.cardBgAuto ? getAutoCardColors(item.iconBg, isDarkMode.value) : null
    const cardBg = autoColors?.bg || item?.cardBg || ''
    const cardBorder = autoColors?.border || ''
    const autoText = item?.textColorAuto ? getAutoTextColor(item.iconBg) : null
    const textColor = autoText || item?.textColor || ''
    const hasCustomCard = Boolean(cardBg)
    return {
      ...item,
      _styles: {
        card: hasCustomCard
          ? {
              backgroundColor: cardBg,
              borderColor: cardBorder || undefined
            }
          : {}
        ,
        extra: textColor ? { color: textColor } : {}
      },
      _classes: isPink
        ? {
            card: hasCustomCard
              ? 'hover:shadow-sm dark:hover:shadow-black/20'
              : 'bg-pink-50 border-pink-100 hover:bg-pink-100 dark:bg-slate-800/80 dark:border-slate-700 dark:hover:bg-slate-800',
            icon: 'bg-pink-400 dark:bg-pink-500',
            accent: 'text-pink-500 dark:text-pink-300'
          }
        : {
            card: hasCustomCard
              ? 'hover:shadow-sm dark:hover:shadow-black/20'
              : 'bg-purple-50 border-purple-100 hover:bg-purple-100 dark:bg-slate-800/80 dark:border-slate-700 dark:hover:bg-slate-800',
            icon: 'bg-purple-500 dark:bg-purple-400',
            accent: 'text-purple-500 dark:text-purple-300'
          }
    }
  })
})
</script>

<template>
  <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
    <a
      v-for="(link, idx) in themedLinks"
      :key="idx"
      :href="link.url"
      target="_blank"
      class="flex items-center p-4 border rounded-xl transition group"
      :class="link._classes.card"
      :style="link._styles.card"
    >
      <div
        class="w-10 h-10 rounded-full flex items-center justify-center text-white text-lg font-bold transition"
        :class="link._classes.icon"
        :style="{
          backgroundColor: link.iconBg || undefined,
          color: link.iconColor || undefined
        }"
      >
        <img
          v-if="link.iconUrl"
          :src="link.iconUrl"
          alt="icon"
          class="w-6 h-6 object-contain"
        >
        <span v-else>{{ link.iconText || '◆' }}</span>
      </div>
      <div class="ml-4">
        <div class="text-sm text-gray-500 dark:text-gray-300">{{ link.title }}</div>
        <div class="font-bold text-gray-800 dark:text-gray-100">{{ link.subtitle }}</div>
        <div
          class="text-xs mt-1"
          :class="link._classes.accent"
          :style="link._styles.extra"
        >{{ link.extra }}</div>
      </div>
    </a>
  </div>
</template>
