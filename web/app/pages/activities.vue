<script setup lang="ts">
/**
 * `/activities` - archived `views/public/Activities.vue`.
 *
 * Server-rendered from the public activities adapter; pagination is ordinary
 * `?page=N` links so page 2 works on a direct request without JavaScript. The
 * page keeps the archived card layout, cover/thumbnail fallback, date and tag
 * semantics, and the archived pagination sequence.
 */
import type { PublicActivitiesPage } from '@guatswr/shared'
import { ACTIVITIES_PAGE_SIZE } from '#shared/content'
import { usePublicPageSeo } from '~/composables/usePublicPageSeo'
import { displayImageSource, displayThumbSource } from '~/utils/public-image'
import { parsePageParam } from '~/utils/public-query'
import { totalPageCount } from '~/utils/public-pagination'

const route = useRoute()
const requestedPage = computed(() => parsePageParam(route.query.page))
const page = computed(() => requestedPage.value ?? 1)

const { data, error, status, refresh } = await useFetch<PublicActivitiesPage>('/api/activities', {
  // Keyed by the normalized page so each page has its own cache slot.
  key: () => `public-activities-${page.value}`,
  query: computed(() => ({ page: page.value, limit: ACTIVITIES_PAGE_SIZE })),
  default: (): PublicActivitiesPage => ({ total: 0, page: 1, limit: ACTIVITIES_PAGE_SIZE, items: [] }),
})

const total = computed(() => data.value.total)
const items = computed(() => data.value.items)
const totalPages = computed(() => totalPageCount(total.value, ACTIVITIES_PAGE_SIZE))
const loading = computed(() => status.value === 'pending')
const failed = computed(() => Boolean(error.value))
const outOfRange = computed(() => total.value > 0 && page.value > totalPages.value)

if (import.meta.server) {
  // A malformed page is a client error; an existing list with an impossible
  // page is a missing resource. Both answer with a real status instead of a
  // successful empty page.
  if (requestedPage.value === null) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid page parameter' })
  }
  if (outOfRange.value) {
    throw createError({ statusCode: 404, statusMessage: 'Page not found' })
  }
  if (failed.value) setResponseStatus(502)
}

// A getter, so the canonical URL follows client-side page changes.
usePublicPageSeo(() => ({
  title: '社团活动记录',
  description: '一场聚会，一段故事。翻翻我们一起走过的日子。',
  path: '/activities',
  query: page.value > 1 ? { page: page.value } : {},
}))
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
        <NuxtLink to="/events" class="club-text-link">
          看看近期活动 <span aria-hidden="true">↗</span>
        </NuxtLink>
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
          v-if="failed"
          class="py-10 text-sm text-red-600 dark:text-red-400"
          role="status"
        >
          活动记录暂时无法加载，请稍后重试。
          <button
            type="button"
            class="club-text-link ml-3"
            @click="refresh()"
          >
            重新加载
          </button>
        </p>
        <p v-else-if="outOfRange" class="py-16 text-sm text-slate-500">
          这一页没有活动记录。
          <NuxtLink to="/activities" class="club-text-link ml-2">回到第一页</NuxtLink>
        </p>
        <p v-else-if="!items.length" class="py-16 text-sm text-slate-500">
          活动记录将在这里更新。
        </p>
        <div v-else class="grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          <NuxtLink
            v-for="activity in items"
            :key="activity.id"
            :to="`/activity/${activity.id}`"
            class="group min-w-0 border-b border-slate-200 pb-6 dark:border-slate-800"
          >
            <ProgressiveImage
              v-if="displayThumbSource(activity.cover_image)"
              rise
              :src="displayThumbSource(activity.cover_image) ?? ''"
              :fallback-src="displayImageSource(activity.cover_image) ?? ''"
              :alt="activity.title"
              wrapper-class="aspect-[4/3] overflow-hidden bg-slate-100 dark:bg-slate-800"
              img-class="h-full w-full object-cover transition-transform duration-500 motion-safe:group-hover:scale-[1.03]"
            />
            <!-- Coverless rows keep the archived 4:3 placeholder box, and no
                 empty `src` is ever rendered. -->
            <div
              v-else
              class="aspect-[4/3] overflow-hidden bg-slate-100 dark:bg-slate-800"
              aria-hidden="true"
            />
            <div
              class="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500 dark:text-slate-400"
            >
              <time :datetime="activity.date">{{ activity.date }}</time>
              <span
                v-if="activity.tag"
                class="text-sky-700 dark:text-sky-300"
              >{{ activity.tag }}</span>
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
            >
              翻开这段回忆
              <span
                class="transition-transform motion-safe:group-hover:translate-x-1"
                aria-hidden="true"
              >→</span>
            </span>
          </NuxtLink>
        </div>

        <PublicPagination
          v-if="total > 0"
          base-path="/activities"
          :page="page"
          :total="total"
          :limit="ACTIVITIES_PAGE_SIZE"
          label="活动记录分页"
        />
      </div>
    </div>
  </div>
</template>
