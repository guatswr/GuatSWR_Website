<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import axios from 'axios'
import HomeHero from '../../components/home/HomeHero.vue'
import HomeAbout from '../../components/home/HomeAbout.vue'
import HomeInterests from '../../components/home/HomeInterests.vue'
import ClubIcon from '../../components/ClubIcon.vue'
import ProgressiveImage from '../../components/ProgressiveImage.vue'
import HomeSocialLinks from '../../components/HomeSocialLinks.vue'
import { useSiteConfigStore } from '../../stores/siteConfig'
import { getThumbUrl } from '../../utils/imageUrl'
import { formatClubDate } from '../../utils/community'
import { vScrollReveal } from '../../directives/scrollMotion'

const site = useSiteConfigStore()
const { config, socialLinks } = storeToRefs(site)
const archives = ref([])
const archivesLoading = ref(true)
const archivesError = ref(false)
const groupNumber = computed(() =>
  /^\d{5,12}$/.test(config.value.qq_group_number || '')
    ? config.value.qq_group_number
    : ''
)
const formatArchiveDate = (value) =>
  formatClubDate(value, { year: true, fallback: value })
const controller = new AbortController()

const interests = [
  {
    number: '01',
    icon: 'duel',
    title: '非想天则',
    subtitle: '在对局中认识彼此',
    description:
      '从第一发弹幕到第一场对战，和同好一起练习、切磋，分享每一次进步。',
    path: '/events/zetime',
    cta: '看看活动',
    color: 'sky'
  },
  {
    number: '02',
    icon: 'danmaku',
    title: '东方 STG',
    subtitle: '再来一把，就这一把',
    description:
      '正作通关、符卡挑战、路线交流。无论初见还是打分，都能找到一起玩的人。',
    path: '/events/stg',
    cta: '看看活动',
    color: 'violet'
  },
  {
    number: '03',
    icon: 'music',
    title: '音乐与现场',
    subtitle: '一首歌，连接幻想乡',
    description: '交换循环播放的东方曲目，分享演奏与翻唱，在熟悉的旋律里相遇。',
    path: '/social',
    cta: '去社群看看',
    color: 'rose'
  },
  {
    number: '04',
    icon: 'creation',
    title: '同人创作',
    subtitle: '让喜欢，有自己的形状',
    description:
      '画画、摄影、文字、Cosplay……欢迎展示作品，也欢迎从一个小小的灵感开始。',
    path: '/social',
    cta: '去社群看看',
    color: 'amber'
  }
]

async function loadArchives() {
  if (controller.signal.aborted) return
  archivesLoading.value = true
  archivesError.value = false
  try {
    const { data } = await axios.get('/api/activities', {
      params: { page: 1, limit: 3 },
      timeout: 10000,
      signal: controller.signal
    })
    archives.value = Array.isArray(data?.items) ? data.items : []
  } catch (error) {
    if (!axios.isCancel(error)) archivesError.value = true
  } finally {
    archivesLoading.value = false
  }
}

onMounted(() => {
  void site.load()
  void loadArchives()
})
onBeforeUnmount(() => {
  controller.abort()
})
</script>

<template>
  <div class="club-home club-paper">
    <HomeHero :config="config" />

    <HomeInterests :items="interests" />

    <HomeAbout :mascot="config.mascot_image" />

    <section
      class="club-home-section club-home-archive py-16 sm:py-20"
      aria-labelledby="archive-title"
    >
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
          <RouterLink to="/activities" class="club-text-link"
            >活动回顾 <ClubIcon name="arrow" class="h-4 w-4"
          /></RouterLink>
        </div>
        <div
          v-if="archivesLoading"
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
          <button class="club-text-link mt-3" @click="loadArchives">
            重新加载 <ClubIcon name="arrow" class="h-4 w-4" />
          </button>
        </div>
        <div v-else-if="archives.length" class="grid gap-6 md:grid-cols-3">
          <RouterLink
            v-for="(activity, index) in archives"
            :key="activity.id"
            v-scroll-reveal="{ variant: 'card', delay: index * 100 }"
            :to="'/activity/' + activity.id"
            class="group flex h-full min-w-0 flex-col border-b border-slate-200 pb-6 dark:border-slate-700"
          >
            <ProgressiveImage
              rise
              :src="getThumbUrl(activity.cover_image)"
              :fallbackSrc="activity.cover_image"
              :alt="activity.title"
              wrapperClass="aspect-[16/10] overflow-hidden bg-slate-100 dark:bg-slate-800"
              imgClass="h-full w-full object-cover transition-transform duration-500 motion-safe:group-hover:scale-105"
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
          </RouterLink>
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
            <RouterLink to="/social" class="club-text-link mt-5"
              >全部社群渠道 <ClubIcon name="arrow" class="h-4 w-4"
            /></RouterLink>
          </div>
          <HomeSocialLinks
            :links="socialLinks.filter((link) => link.showOnHome !== false)"
          />
        </div>
        <div
          v-scroll-reveal
          class="mt-14 grid gap-8 border-t border-slate-300 pt-10 sm:grid-cols-[1fr_auto] sm:items-center dark:border-slate-700"
        >
          <div>
            <p class="club-eyebrow">YOUR NEXT CHAPTER</p>
            <h2
              class="club-display mt-3 text-2xl font-semibold leading-relaxed sm:text-3xl"
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
          <RouterLink
            to="/join"
            class="club-button club-button-primary shrink-0"
            >加入桂航绯想天 <span aria-hidden="true">↗</span></RouterLink
          >
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
/* Full-width color fields separate chapters, following SCTA's section rhythm. */
.club-home {
  --home-about-background: #f5f3ed;
}
:global(.dark .club-home) {
  --home-about-background: #1d272d;
}
.club-home-section {
  background-color: var(--section-background);
  scroll-margin-top: 4rem;
}
.club-home-archive {
  --section-background: #faf6ee;
}
.club-home-about {
  --section-background: var(--home-about-background);
}
.club-home-community {
  --section-background: #e6f0ef;
}
:global(.dark .club-home-archive) {
  --section-background: #24231f;
}
:global(.dark .club-home-community) {
  --section-background: #152b2c;
}
</style>
