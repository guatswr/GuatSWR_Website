<script setup lang="ts">
import { computed } from 'vue'
import type { PublicActivitiesPage } from '@guatswr/shared'
import ClubIcon from '~/components/ClubIcon.vue'
import ProgressiveImage from '~/components/ProgressiveImage.vue'
import HomeSocialLinks from '~/components/HomeSocialLinks.vue'
import HomeHero from '~/components/home/HomeHero.vue'
import HomeSectionBackdrop from '~/components/home/HomeSectionBackdrop.vue'
import { getThumbUrl } from '~/utils/image-url'
import { formatArchiveDate } from '~/utils/club-date'
import { normalizedGroupNumber } from '~/utils/site-config'
import { HOME_INTERESTS } from '~/utils/home-content'
import { vScrollReveal } from '~/utils/scroll-motion'

// Keep below-fold markup in SSR; hydrate its motion only when the browser is idle.
const HomeInterests = defineLazyHydrationComponent('idle', () => import('~/components/home/HomeInterests.vue'))
const HomeAbout = defineLazyHydrationComponent('idle', () => import('~/components/home/HomeAbout.vue'))

const { config, socialLinks, ready } = usePublicConfig()
const archivesRequest = useFetch<PublicActivitiesPage>('/api/activities', {
  key: 'home-archives',
  query: { page: 1, limit: 3 },
  default: () => ({ total: 0, page: 1, limit: 3, items: [] })
})
const {
  data: archives,
  error: archivesError,
  pending: archivesPending,
  refresh: reloadArchives
} = archivesRequest

// Both requests must settle before the server renders the first screen.
await Promise.all([ready, archivesRequest])

const groupNumber = computed(() => normalizedGroupNumber(config.value.qq_group_number))
const visibleLinks = computed(() =>
  socialLinks.value.filter((link) => link.showOnHome !== false)
)

usePublicSeo({
  title: '首页',
  path: '/',
  description: '桂航绯想天首页',
  image: config.value.home_bg
})
</script>

<template>
  <div class="club-home club-paper">
    <HomeHero :config="config" />

    <HomeInterests :items="HOME_INTERESTS" />

    <HomeAbout :mascot="config.mascot_image" />

    <section
      class="club-home-section club-home-archive py-16 sm:py-20"
      aria-labelledby="archive-title"
    >
      <HomeSectionBackdrop variant="archive" />
      <div class="club-container">
        <div
          v-scroll-reveal
          class="mb-8 flex flex-wrap items-end justify-between gap-4"
        >
          <div>
            <p class="club-eyebrow">OUR SHARED MEMORIES</p>
            <h2 id="archive-title" class="club-section-title mt-3">
              把相遇，留在这里
            </h2>
            <p
              class="mt-3 text-sm leading-7 text-slate-500 dark:text-slate-400"
            >
              从校园走向更大的同好圈，每一段回忆都有迹可循。
            </p>
          </div>
          <NuxtLink to="/activities" class="club-text-link"
            >活动回顾 <ClubIcon name="arrow" class="h-4 w-4"
          /></NuxtLink>
        </div>
        <div
          v-if="archivesPending"
          class="grid gap-6 md:grid-cols-3"
          role="status"
          aria-label="正在加载活动回顾"
        >
          <div
            v-for="n in 3"
            :key="n"
            class="border-b border-slate-200 pb-6 dark:border-slate-700"
          >
            <div
              class="aspect-[16/10] bg-slate-100 motion-safe:animate-pulse dark:bg-slate-900"
            />
            <div
              class="mt-5 h-3 w-24 bg-slate-100 motion-safe:animate-pulse dark:bg-slate-900"
            />
            <div
              class="mt-4 h-6 w-3/4 bg-slate-100 motion-safe:animate-pulse dark:bg-slate-900"
            />
            <div
              class="mt-3 h-3 w-full bg-slate-100 motion-safe:animate-pulse dark:bg-slate-900"
            />
            <div
              class="mt-2 h-3 w-5/6 bg-slate-100 motion-safe:animate-pulse dark:bg-slate-900"
            />
          </div>
        </div>
        <div v-else-if="archivesError" class="club-empty" role="status">
          <p>回忆暂时没有加载出来。</p>
          <button class="club-text-link mt-3" @click="reloadArchives()">
            重新加载 <ClubIcon name="arrow" class="h-4 w-4" />
          </button>
        </div>
        <div v-else-if="archives.items.length" class="grid gap-6 md:grid-cols-3">
          <NuxtLink
            v-for="(activity, index) in archives.items"
            :key="activity.id"
            v-scroll-reveal="{ variant: 'card', delay: index * 100 }"
            :to="`/activity/${activity.id}`"
            class="group flex h-full min-w-0 flex-col border-b border-slate-200 pb-6 dark:border-slate-700"
          >
            <ProgressiveImage
              rise
              :src="getThumbUrl(activity.cover_image)"
              :fallback-src="activity.cover_image"
              :alt="activity.title"
              wrapper-class="aspect-[16/10] overflow-hidden bg-slate-100 dark:bg-slate-800"
              img-class="h-full w-full object-cover transition-transform duration-500 motion-safe:group-hover:scale-105"
            />
            <div class="flex flex-1 flex-col pt-5">
              <div
                class="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400"
              >
                <time :datetime="activity.date">{{
                  formatArchiveDate(activity.date)
                }}</time
                ><span
                  v-if="activity.tag"
                  class="text-sky-700 dark:text-sky-300"
                  >{{ activity.tag }}</span
                >
              </div>
              <h3
                class="mt-3 text-lg font-semibold leading-7 group-hover:text-sky-700 dark:group-hover:text-sky-300"
              >
                {{ activity.title }}
              </h3>
              <p
                v-if="activity.description"
                class="mt-3 line-clamp-2 text-sm leading-7 text-slate-500 dark:text-slate-400"
              >
                {{ activity.description }}
              </p>
              <span
                class="mt-auto flex items-center justify-between pt-6 text-xs font-medium text-slate-500 dark:text-slate-400"
                >翻开这段回忆
                <ClubIcon
                  name="arrow"
                  class="h-4 w-4 text-sky-600 transition-transform motion-safe:group-hover:translate-x-1 dark:text-sky-400"
              /></span>
            </div>
          </NuxtLink>
        </div>
        <div v-else class="club-empty">
          我们的故事正在继续，活动记录将在这里更新。
        </div>
      </div>
    </section>

    <section
      class="club-home-section club-home-community py-16 sm:py-20"
      aria-labelledby="community-title"
    >
      <HomeSectionBackdrop variant="community" />
      <div class="club-container">
        <div class="grid gap-10 lg:grid-cols-[.85fr_1.15fr] lg:gap-20">
          <div v-scroll-reveal>
            <p class="club-eyebrow">STAY CONNECTED</p>
            <h2 id="community-title" class="club-section-title mt-3">
              在这里，找到我们
            </h2>
            <p
              class="mt-4 text-sm leading-8 text-slate-500 dark:text-slate-400"
            >
              关注社团动态，分享你的创作，或者来语音频道坐坐。选择你习惯的方式保持联系。
            </p>
            <NuxtLink to="/social" class="club-text-link mt-5"
              >全部社群渠道 <ClubIcon name="arrow" class="h-4 w-4"
            /></NuxtLink>
          </div>
          <HomeSocialLinks :links="visibleLinks" />
        </div>
        <div
          v-scroll-reveal
          class="mt-14 grid gap-8 border-t border-slate-300 pt-10 sm:grid-cols-[1fr_auto] sm:items-center dark:border-slate-700"
        >
          <div>
            <p class="club-eyebrow">YOUR NEXT CHAPTER</p>
            <!-- `sm:leading-9` reproduces the archived rendering: Tailwind 3's
                 `sm:text-3xl` carried its own `line-height: 2.25rem` and won the
                 cascade, while Tailwind 4 routes the line height through
                 `--tw-leading`, so `leading-relaxed` would otherwise win above
                 `sm` (48.75px instead of the archived 36px). -->
            <h2
              class="club-display mt-3 text-2xl font-semibold leading-relaxed sm:text-3xl sm:leading-9"
            >
              幻想乡的下一页，和我们一起写。
            </h2>
            <p
              class="mt-3 text-sm leading-7 text-slate-500 dark:text-slate-400"
            >
              无需入坑门槛，带上你的热爱就好。
              <span v-if="groupNumber">
                也欢迎先加 QQ 群
                <span class="font-mono text-slate-700 dark:text-slate-200">{{
                  groupNumber
                }}</span>
                打个招呼。
              </span>
            </p>
          </div>
          <NuxtLink
            to="/join"
            class="club-button club-button-primary shrink-0"
            >加入桂航绯想天 <span aria-hidden="true">↗</span></NuxtLink
          >
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.dark .club-button-primary {
  background-color: #0369a1;
}

/* Quiet color fields and shared seam stops keep chapter transitions gentle. */
.club-home {
  --home-interests-background: #f4f5f2;
  --home-interests-about-seam: #f5f4ef;
  --home-about-background: #f5f3ed;
  --home-about-archive-seam: #f7f4ed;
  --home-archive-community-seam: #f2f4f0;
}
:global(.dark .club-home) {
  --home-interests-background: #19232c;
  --home-interests-about-seam: #1a242c;
  --home-about-background: #1b252c;
  --home-about-archive-seam: #1f2425;
  --home-archive-community-seam: #1b2627;
}
.club-home-section {
  position: relative;
  isolation: isolate;
  background-color: var(--section-background);
  scroll-margin-top: 4rem;
}
.club-home-section > .club-container {
  position: relative;
  z-index: 1;
}
.club-home-about {
  --section-background: var(--home-about-background);
  --section-edge-top: var(--home-interests-about-seam);
  --section-edge-bottom: var(--home-about-archive-seam);
}
.club-home-archive {
  --section-background: #f8f5ee;
  --section-edge-top: var(--home-about-archive-seam);
  --section-edge-bottom: var(--home-archive-community-seam);
}
.club-home-community {
  --section-background: #eef4f3;
  --section-edge-top: var(--home-archive-community-seam);
  --section-edge-bottom: #eef4f3;
}
:global(.dark .club-home-archive) {
  --section-background: #212321;
}
:global(.dark .club-home-community) {
  --section-background: #17282a;
  --section-edge-bottom: #17282a;
}
</style>
