<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import axios from 'axios'
import HomeHero from '../../components/home/HomeHero.vue'
import HomeEventCard from '../../components/home/HomeEventCard.vue'
import ClubIcon from '../../components/ClubIcon.vue'
import ProgressiveImage from '../../components/ProgressiveImage.vue'
import HomeSocialLinks from '../../components/HomeSocialLinks.vue'
import { useSiteConfigStore } from '../../stores/siteConfig'
import { getThumbUrl } from '../../utils/imageUrl'
import { upcomingEvents } from '../../utils/community'
import { vScrollReveal } from '../../directives/scrollMotion'

const site = useSiteConfigStore()
const { config, socialLinks } = storeToRefs(site)
const archives = ref([])
const events = ref([])
const archivesLoading = ref(true)
const eventsLoading = ref(true)
const archivesError = ref(false)
const eventsError = ref(false)
const now = ref(Date.now())
const upcoming = computed(() =>
  upcomingEvents(events.value, now.value).slice(0, 3)
)
const controller = new AbortController()
let clock

const interests = [
  {
    number: '01',
    icon: 'game',
    title: '非想天则',
    subtitle: '在对局中认识彼此',
    description:
      '从第一发弹幕到第一场对战，和同好一起练习、切磋，分享每一次进步。',
    path: '/events/zetime',
    color: 'sky'
  },
  {
    number: '02',
    icon: 'sparkles',
    title: '东方 STG',
    subtitle: '再来一把，就这一把',
    description:
      '正作通关、符卡挑战、路线交流。无论初见还是打分，都能找到一起玩的人。',
    path: '/events/stg',
    color: 'violet'
  },
  {
    number: '03',
    icon: 'music',
    title: '音乐与现场',
    subtitle: '一首歌，连接幻想乡',
    description: '交换循环播放的东方曲目，分享演奏与翻唱，在熟悉的旋律里相遇。',
    path: '/social',
    color: 'rose'
  },
  {
    number: '04',
    icon: 'pen',
    title: '同人创作',
    subtitle: '让喜欢，有自己的形状',
    description:
      '画画、摄影、文字、Cosplay……欢迎展示作品，也欢迎从一个小小的灵感开始。',
    path: '/social',
    color: 'amber'
  }
]

async function loadEvents() {
  if (controller.signal.aborted) return
  eventsLoading.value = true
  eventsError.value = false
  try {
    const { data } = await axios.get('/api/event', {
      params: { limit: 100 },
      timeout: 10000,
      signal: controller.signal
    })
    events.value = Array.isArray(data?.items) ? data.items : []
    now.value = Date.now()
  } catch (error) {
    if (!axios.isCancel(error)) eventsError.value = true
  } finally {
    eventsLoading.value = false
  }
}

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
  void loadEvents()
  void loadArchives()
  clock = window.setInterval(() => {
    now.value = Date.now()
  }, 60000)
})
onBeforeUnmount(() => {
  controller.abort()
  window.clearInterval(clock)
})
</script>

<template>
  <div class="club-home club-paper">
    <HomeHero :config="config" />

    <section
      id="upcoming"
      class="club-home-section club-home-upcoming py-16 sm:py-20"
      aria-labelledby="upcoming-title"
    >
      <div class="club-container">
        <div
          v-scroll-reveal
          class="mb-8 flex flex-wrap items-end justify-between gap-4"
        >
          <div>
            <p class="club-eyebrow">LET'S MEET</p>
            <h2 id="upcoming-title" class="club-section-title mt-3">
              下一次相遇
            </h2>
            <p
              class="mt-3 text-sm leading-7 text-slate-500 dark:text-slate-400"
            >
              一场对局，一次聚会。看看有什么可以一起参与。
            </p>
          </div>
          <RouterLink to="/events" class="club-text-link"
            >全部活动 <ClubIcon name="arrow" class="h-4 w-4"
          /></RouterLink>
        </div>
        <div
          v-if="eventsLoading"
          class="grid gap-5 md:grid-cols-3"
          role="status"
          aria-label="正在加载活动"
        >
          <div
            v-for="n in 3"
            :key="n"
            class="h-48 bg-slate-100 motion-safe:animate-pulse dark:bg-slate-900"
          />
        </div>
        <div v-else-if="eventsError" class="club-empty" role="status">
          <p>活动暂时没有加载出来。</p>
          <button class="club-text-link mt-3" @click="loadEvents">
            重新加载 <ClubIcon name="arrow" class="h-4 w-4" />
          </button>
        </div>
        <div
          v-else-if="upcoming.length"
          class="grid gap-5 md:grid-cols-2 lg:grid-cols-3"
        >
          <div
            v-for="(event, index) in upcoming"
            :key="event.id"
            v-scroll-reveal="index * 24"
          >
            <HomeEventCard :event="event" />
          </div>
        </div>
        <div
          v-else
          v-scroll-reveal
          class="flex flex-col gap-5 border-y border-slate-200 py-6 sm:flex-row sm:items-center sm:justify-between dark:border-slate-700"
        >
          <div class="flex items-start gap-4">
            <span
              class="flex h-10 w-8 shrink-0 items-center justify-center text-sky-600 dark:text-sky-300"
              ><ClubIcon name="calendar" class="h-6 w-6"
            /></span>
            <div>
              <h3 class="font-semibold text-slate-800 dark:text-slate-100">
                下一场活动，等你一起来
              </h3>
              <p
                class="mt-2 text-sm leading-7 text-slate-500 dark:text-slate-400"
              >
                目前暂无可参与的公开活动。加入同好群，交流日常，也留意下一次相约。
              </p>
            </div>
          </div>
          <RouterLink to="/join" class="club-text-link shrink-0"
            >先来认识大家 <ClubIcon name="arrow" class="h-4 w-4"
          /></RouterLink>
        </div>
      </div>
    </section>

    <section
      class="club-home-section club-home-interests py-16 sm:py-20"
      aria-labelledby="interests-title"
    >
      <div class="club-container">
        <div v-scroll-reveal class="mb-10 max-w-xl">
          <p class="club-eyebrow">SOMETHING WE LOVE</p>
          <h2 id="interests-title" class="club-section-title mt-3">
            总有一种热爱，与你同频
          </h2>
          <p class="mt-3 text-sm leading-7 text-slate-500 dark:text-slate-400">
            擅长什么并不重要。愿意分享喜欢的事，就是成为同好的开始。
          </p>
        </div>
        <div class="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <RouterLink
            v-for="(interest, index) in interests"
            :key="interest.number"
            v-scroll-reveal="index * 24"
            :to="interest.path"
            class="club-interest-card group relative border-t border-slate-300 py-6 dark:border-slate-700"
            :data-tone="interest.color"
          >
            <div class="flex items-center justify-between">
              <span class="club-interest-icon flex h-8 w-8 items-center"
                ><ClubIcon :name="interest.icon" class="h-6 w-6" /></span
              ><span class="font-mono text-xs text-slate-400">{{
                interest.number
              }}</span>
            </div>
            <h3 class="mt-6 text-xl font-semibold">{{ interest.title }}</h3>
            <p
              class="mt-2 text-xs font-medium text-slate-500 dark:text-slate-400"
            >
              {{ interest.subtitle }}
            </p>
            <p
              class="mt-4 text-sm leading-7 text-slate-500 dark:text-slate-400"
            >
              {{ interest.description }}
            </p>
            <span
              class="mt-6 inline-flex items-center gap-2 text-sm font-medium text-sky-700 dark:text-sky-300"
              >一起探索
              <ClubIcon
                name="external"
                class="h-4 w-4 transition-transform motion-safe:group-hover:-translate-y-0.5"
            /></span>
          </RouterLink>
        </div>
      </div>
    </section>

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
            class="h-72 bg-slate-100 motion-safe:animate-pulse dark:bg-slate-900"
          />
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
            v-scroll-reveal="{ variant: 'card', offset: index * 24 }"
            :to="'/activity/' + activity.id"
            class="group flex h-full min-w-0 flex-col border-b border-slate-200 pb-6 dark:border-slate-700"
          >
            <ProgressiveImage
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
                <time :datetime="activity.date">{{ activity.date }}</time
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
                  name="external"
                  class="h-4 w-4 text-sky-600 dark:text-sky-400"
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
      class="club-home-section club-home-about py-16 sm:py-20"
      aria-labelledby="about-title"
    >
      <div
        class="club-container grid items-center gap-10 lg:grid-cols-[.85fr_1.15fr] lg:gap-20"
      >
        <div
          v-scroll-reveal="{ variant: 'image' }"
          class="relative overflow-hidden bg-sky-100 dark:bg-slate-800"
        >
          <ProgressiveImage
            v-if="config.mascot_image"
            :src="getThumbUrl(config.mascot_image)"
            :fallbackSrc="config.mascot_image"
            alt="社团看板娘琪露诺"
            wrapperClass="aspect-[4/3]"
            imgClass="h-full w-full object-cover object-top"
          />
          <div
            v-else
            class="flex aspect-[4/3] items-center justify-center text-sky-400/50"
          >
            <ClubIcon name="snow" class="h-32 w-32" />
          </div>
          <div
            class="absolute bottom-4 left-4 rounded-lg bg-white/95 px-4 py-2 text-xs font-medium text-slate-700 shadow-sm dark:bg-slate-900/95 dark:text-slate-200"
          >
            我们的幻想乡一角 · 琪露诺⑨
          </div>
        </div>
        <div v-scroll-reveal="24">
          <p class="club-eyebrow">A LITTLE ABOUT US</p>
          <h2 id="about-title" class="club-section-title mt-3">
            因东方相识，<br class="hidden sm:block" />让同好成为朋友
          </h2>
          <p class="mt-5 text-sm leading-8 text-slate-600 dark:text-slate-300">
            桂航绯想天是桂林航天工业学院东方 Project
            爱好者的聚集地。正作玩家、非想天则爱好者、音乐与二创同好，都可以在这里找到自己的位置。
          </p>
          <p class="mt-3 text-sm leading-8 text-slate-600 dark:text-slate-300">
            我们也欢迎校外的朋友。聊一聊最近喜欢的曲子，约一场对战，或一起参加线下活动——每一次分享，都让幻想乡近一点。
          </p>
          <div class="mt-6 flex flex-wrap gap-6">
            <RouterLink to="/history" class="club-text-link"
              ><ClubIcon name="book" class="h-4 w-4" />读读我们的群史
              <ClubIcon name="arrow" class="h-4 w-4" /></RouterLink
            ><RouterLink to="/members" class="club-text-link"
              >认识同好 <ClubIcon name="arrow" class="h-4 w-4"
            /></RouterLink>
          </div>
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
          class="mt-14 grid gap-6 border-t border-slate-300 pt-10 sm:grid-cols-[1fr_auto] sm:items-center dark:border-slate-700"
        >
          <div>
            <p class="club-eyebrow">YOUR NEXT CHAPTER</p>
            <h2
              class="mt-3 font-serif text-2xl font-semibold leading-relaxed sm:text-3xl"
            >
              幻想乡的下一页，和我们一起写。
            </h2>
            <p
              class="mt-3 text-sm leading-7 text-slate-500 dark:text-slate-400"
            >
              无需入坑门槛，带上你的热爱就好。
            </p>
          </div>
          <RouterLink to="/join" class="club-text-link"
            >加入桂航绯想天 <ClubIcon name="arrow" class="h-4 w-4"
          /></RouterLink>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
/* Full-width color fields separate chapters, following SCTA's section rhythm. */
.club-home-section {
  background-color: var(--section-background);
  scroll-margin-top: 4rem;
}
.club-home-upcoming {
  --section-background: #fff;
}
.club-home-interests {
  --section-background: #eaf3f9;
}
.club-home-archive {
  --section-background: #faf6ee;
}
.club-home-about {
  --section-background: #f1eef8;
}
.club-home-community {
  --section-background: #e6f0ef;
}
:global(.dark .club-home-upcoming) {
  --section-background: #101923;
}
:global(.dark .club-home-interests) {
  --section-background: #162838;
}
:global(.dark .club-home-archive) {
  --section-background: #24231f;
}
:global(.dark .club-home-about) {
  --section-background: #211f32;
}
:global(.dark .club-home-community) {
  --section-background: #152b2c;
}
</style>
