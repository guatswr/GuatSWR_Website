<script setup lang="ts">
/**
 * Ordinary-link pagination for server-rendered public lists.
 *
 * Every enabled control is a real link (NuxtLink), so pagination works on a
 * direct request with JavaScript disabled. The current page keeps
 * `aria-current="page"`; unavailable controls are non-focusable spans marked
 * `aria-disabled` instead of dead buttons.
 */
import { buildPublicPath } from '~/utils/public-query'
import { pageItems, totalPageCount } from '~/utils/public-pagination'

const props = withDefaults(defineProps<{
  basePath: string
  page: number
  total: number
  limit: number
  label: string
  /** Additional allowlisted query state (filter selection) carried by links. */
  query?: Record<string, string>
  pageParam?: string
}>(), {
  query: () => ({}),
  pageParam: 'page',
})

const totalPages = computed(() => totalPageCount(props.total, props.limit))
const items = computed(() => pageItems(totalPages.value, props.page))
const canPrev = computed(() => props.page > 1)
const canNext = computed(() => props.page < totalPages.value)

const linkTo = (target: number): string =>
  buildPublicPath(props.basePath, {
    ...props.query,
    [props.pageParam]: target === 1 ? undefined : target,
  })
</script>

<template>
  <nav
    class="mt-12 flex flex-wrap items-center justify-between gap-5 border-t border-slate-200 pt-6 dark:border-slate-800"
    :aria-label="label"
  >
    <p class="text-xs text-slate-500 dark:text-slate-400">
      共 {{ total }} 条 · 第 {{ page }}/{{ totalPages }} 页
    </p>
    <div class="flex flex-wrap items-center gap-2">
      <NuxtLink
        v-if="canPrev"
        :to="linkTo(page - 1)"
        class="club-pagination public-pagination-link"
      >
        上一页
      </NuxtLink>
      <span v-else class="club-pagination public-pagination-disabled" aria-disabled="true">
        上一页
      </span>
      <template v-for="(item, index) in items" :key="`${item}-${index}`">
        <span v-if="item === 'ellipsis'" class="px-1 text-slate-400" aria-hidden="true">···</span>
        <NuxtLink
          v-else
          :to="linkTo(item)"
          class="club-pagination public-pagination-link"
          :aria-current="item === page ? 'page' : undefined"
        >
          {{ item }}
        </NuxtLink>
      </template>
      <NuxtLink
        v-if="canNext"
        :to="linkTo(page + 1)"
        class="club-pagination public-pagination-link"
      >
        下一页
      </NuxtLink>
      <span v-else class="club-pagination public-pagination-disabled" aria-disabled="true">
        下一页
      </span>
    </div>
  </nav>
</template>

<style scoped>
.public-pagination-link,
.public-pagination-disabled {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.public-pagination-disabled {
  opacity: 0.35;
  cursor: default;
}
</style>
