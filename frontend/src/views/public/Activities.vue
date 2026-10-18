<script setup>
import { ref, onMounted, computed } from 'vue'
import axios from 'axios'
import { getThumbUrl } from '../../utils/image'
import ProgressiveImage from '../../components/ProgressiveImage.vue'

const activities = ref([])
const errorMsg = ref('')
const loading = ref(true)
const page = ref(1)
const limit = ref(12)
const total = ref(0)

const fetchActivities = async () => {
  errorMsg.value = ''
  try {
    const res = await axios.get('/api/activities', {
      params: { page: page.value, limit: limit.value }
    })
    activities.value = res.data?.items || []
    total.value = res.data?.total || 0
  } catch (error) {
    console.error('加载失败', error)
    errorMsg.value = '活动记录暂时无法加载，请稍后重试。'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  fetchActivities()
})

const totalPages = computed(() =>
  Math.max(1, Math.ceil(total.value / limit.value))
)
const canPrev = computed(() => page.value > 1)
const canNext = computed(() => page.value < totalPages.value)

const pageItems = computed(() => {
  const totalP = totalPages.value
  if (totalP <= 1) return [1]

  const current = page.value
  const items = [1]

  let start = Math.max(2, current - 1)
  let end = Math.min(totalP - 1, current + 1)

  if (current <= 3) {
    start = 2
    end = Math.min(totalP - 1, 4)
  } else if (current >= totalP - 2) {
    start = Math.max(2, totalP - 3)
    end = totalP - 1
  }

  if (start > 2) items.push('...')
  for (let i = start; i <= end; i += 1) items.push(i)
  if (end < totalP - 1) items.push('...')

  items.push(totalP)
  return items
})

const changePage = async (nextPage) => {
  if (nextPage < 1 || nextPage > totalPages.value) return
  page.value = nextPage
  loading.value = true
  await fetchActivities()
  window.scrollTo({ top: 0, behavior: 'smooth' })
}
</script>

<template>
  <div class="club-paper min-h-screen">
    <div class="club-container py-12 sm:py-20">
      <header
        class="mb-12 flex flex-wrap items-end justify-between gap-6 border-b border-slate-200 pb-10 dark:border-slate-800"
      >
        <div>
          <p class="club-eyebrow">OUR SHARED MEMORIES</p>
          <h1 class="club-page-title mt-4">社团活动记录</h1>
          <p class="mt-5 text-sm leading-7 text-slate-500 dark:text-slate-400">
            一场聚会，一段故事。翻翻我们一起走过的日子。
          </p>
        </div>
        <RouterLink to="/events" class="club-text-link"
          >看看近期活动 <span aria-hidden="true">↗</span></RouterLink
        >
      </header>
      <p
        v-if="loading"
        class="py-20 text-center text-sm text-slate-500"
        role="status"
      >
        正在翻阅活动记录…
      </p>
      <div v-else>
        <p
          v-if="errorMsg"
          class="py-10 text-sm text-red-600 dark:text-red-400"
          role="status"
        >
          {{ errorMsg }}
          <button
            type="button"
            class="club-text-link ml-3"
            @click="fetchActivities"
          >
            重新加载
          </button>
        </p>
        <p v-else-if="!activities.length" class="py-16 text-sm text-slate-500">
          活动记录将在这里更新。
        </p>
        <div v-else class="grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          <RouterLink
            v-for="activity in activities"
            :key="activity.id"
            :to="'/activity/' + activity.id"
            class="group min-w-0 border-b border-slate-200 pb-6 dark:border-slate-800"
          >
            <ProgressiveImage
              rise
              :src="getThumbUrl(activity.cover_image)"
              :fallbackSrc="activity.cover_image"
              :alt="activity.title"
              wrapperClass="aspect-[4/3] overflow-hidden bg-slate-100 dark:bg-slate-800"
              imgClass="h-full w-full object-cover transition-transform duration-500 motion-safe:group-hover:scale-[1.03]"
            />
            <div
              class="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500 dark:text-slate-400"
            >
              <time :datetime="activity.date">{{ activity.date }}</time
              ><span
                v-if="activity.tag"
                class="text-sky-700 dark:text-sky-300"
                >{{ activity.tag }}</span
              >
            </div>
            <h2
              class="mt-3 break-words font-serif text-xl font-semibold leading-8 group-hover:text-sky-700 dark:group-hover:text-sky-300"
            >
              {{ activity.title }}
            </h2>
            <p
              v-if="activity.description"
              class="mt-3 line-clamp-3 text-sm leading-7 text-slate-500 dark:text-slate-400"
            >
              {{ activity.description }}
            </p>
            <span
              class="mt-5 inline-flex min-h-11 items-center gap-3 text-xs font-semibold text-sky-700 dark:text-sky-300"
              >翻开这段回忆
              <span
                class="transition-transform motion-safe:group-hover:translate-x-1"
                aria-hidden="true"
                >→</span
              ></span
            >
          </RouterLink>
        </div>
        <nav
          v-if="total > 0"
          class="mt-12 flex flex-wrap items-center justify-between gap-5 border-t border-slate-200 pt-6 dark:border-slate-800"
          aria-label="活动记录分页"
        >
          <p class="text-xs text-slate-500 dark:text-slate-400">
            共 {{ total }} 条 · 第 {{ page }}/{{ totalPages }} 页
          </p>
          <div class="flex flex-wrap items-center gap-2">
            <button
              type="button"
              class="club-pagination"
              :disabled="!canPrev"
              @click="changePage(page - 1)"
            >
              上一页
            </button>
            <template v-for="(item, idx) in pageItems" :key="item + '-' + idx"
              ><span v-if="item === '...'" class="px-1 text-slate-400">···</span
              ><button
                v-else
                type="button"
                class="club-pagination"
                :aria-current="item === page ? 'page' : undefined"
                @click="changePage(item)"
              >
                {{ item }}
              </button></template
            >
            <button
              type="button"
              class="club-pagination"
              :disabled="!canNext"
              @click="changePage(page + 1)"
            >
              下一页
            </button>
          </div>
        </nav>
      </div>
    </div>
  </div>
</template>
