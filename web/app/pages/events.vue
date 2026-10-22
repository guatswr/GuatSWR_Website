<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import '~/assets/css/events.css'
import ClubIcon from '~/components/ClubIcon.vue'
import { EVENT_NAVIGATION, eventCategoryByPath } from '~/utils/event-center'

const route = useRoute()
const pageTransition = usePublicPageTransition()
const activeCategory = computed(() => eventCategoryByPath(route.path))
const isEntered = ref(false)

onMounted(() => {
  requestAnimationFrame(() => {
    isEntered.value = true
  })
})
</script>

<template>
  <div
    class="events-stage club-paper"
    :class="{ 'is-entered': isEntered }"
    :style="{
      '--active-cat-color': activeCategory.color,
      '--active-cat-dark': activeCategory.darkColor,
    }"
  >
    <!-- 背景博丽结界与八角星轨暗纹（纯装饰，不遮挡正文） -->
    <div class="events-ambient" aria-hidden="true">
      <div class="events-ambient-grid" />
      <svg class="events-ambient-watermark" viewBox="0 0 360 360" fill="none">
        <circle cx="180" cy="180" r="164" stroke="currentColor" stroke-width="0.75" stroke-dasharray="3 6" />
        <circle cx="180" cy="180" r="136" stroke="currentColor" stroke-width="0.6" />
        <polygon
          points="180,22 292,68 338,180 292,292 180,338 68,292 22,180 68,68"
          stroke="currentColor"
          stroke-width="0.7"
        />
        <polygon
          points="180,52 270,90 308,180 270,270 180,308 90,270 52,180 90,90"
          stroke="currentColor"
          stroke-width="0.5"
          stroke-dasharray="2 4"
        />
        <rect
          x="104"
          y="104"
          width="152"
          height="152"
          stroke="currentColor"
          stroke-width="0.55"
          transform="rotate(45 180 180)"
        />
        <circle cx="180" cy="180" r="36" stroke="currentColor" stroke-width="0.6" />
      </svg>
    </div>

    <div class="club-container events-container">
      <header class="events-heading">
        <div class="events-heading-main">
          <div class="events-heading-title-row">
            <span class="events-heading-seal" aria-hidden="true">集会</span>
            <h1>活动中心</h1>
          </div>
          <Transition name="events-fade" mode="out-in">
            <p :key="activeCategory.path" class="events-heading-subtitle">
              {{ activeCategory.subtitle }}
            </p>
          </Transition>
        </div>

        <NuxtLink to="/activities" class="events-archive-link">
          <span class="events-archive-seal" aria-hidden="true">旧卷</span>
          <span>往期活动回顾</span>
          <ClubIcon name="external" />
        </NuxtLink>
      </header>

      <nav class="events-navigation" aria-label="活动种类">
        <NuxtLink
          v-for="(item, index) in EVENT_NAVIGATION"
          :key="item.path"
          :to="item.path"
          class="events-category"
          :data-kind="item.kind"
          :style="{
            '--cat-color': item.color,
            '--cat-dark-color': item.darkColor,
            '--cat-tab-index': index,
          }"
          :aria-current="route.path.replace(/\/$/, '') === item.path ? 'page' : undefined"
        >
          <span class="events-category-swatch" aria-hidden="true" />
          <span class="events-category-label">{{ item.label }}</span>
          <span class="events-category-seal" aria-hidden="true">{{ item.seal }}</span>
        </NuxtLink>
      </nav>

      <div class="club-page-stack events-content">
        <NuxtPage :transition="pageTransition" />
      </div>
    </div>
  </div>
</template>
