<script setup lang="ts">
/**
 * `/members` — Editorial Gensokyo Residents Registry (`绯想天住民名录`).
 *
 * The selected school lives in the URL (`?school=桂航`), so the filtered list
 * is server-rendered and works without JavaScript. An empty `school` value is
 * treated as "全部", matching the backend's truthiness check. Pinyin sort keys
 * come from the server with the list, so no pinyin library is shipped to the
 * client and SSR order is replayed unchanged on hydration.
 */
import type { MembersContentResponse } from '#shared/content'
import type { PublicSchoolStat } from '@guatswr/shared'
import { START_LOCATION } from 'vue-router'
import { usePublicPageSeo } from '~/composables/usePublicPageSeo'
import { beijingDateString } from '~/utils/beijing-time'
import {
  buildMemberFilterTabs,
  buildParliamentData,
  formatMemberOrdinal,
  getMemberTags,
  getSchoolColor,
  getSchoolDarkColor,
  memberInitialLetter,
  sortMembersByKeys,
} from '~/utils/members'
import { buildPublicPath, queryValue, stripControlCharacters } from '~/utils/public-query'
import { displayImageSource, displayThumbSource } from '~/utils/public-image'

definePageMeta({
  scrollToTop(to, from) {
    // SSR is already scrollable before hydration. Nuxt's initial forced route
    // replacement must not reset a reader who has started scrolling meanwhile.
    return from !== START_LOCATION || Boolean(to.hash)
      || typeof window === 'undefined' || window.scrollY === 0
  },
})

const route = useRoute()
const router = useRouter()

/** Bounded arbitrary school value; never a recognized filter unless present. */
const selectedSchool = computed(() => stripControlCharacters(queryValue(route.query.school) ?? '')
  .trim()
  .slice(0, 32))

const hoveredSchool = ref<string | null>(null)
const activeChartSchool = computed(() =>
  hoveredSchool.value !== null ? hoveredSchool.value : selectedSchool.value,
)

// One request returns both the projected members and the server-derived sort
// keys; the browser never computes pinyin.
const { data: memberContent, error: membersError, status: membersStatus, refresh: refreshMembers } =
  await useFetch<MembersContentResponse>('/api/content/members', {
    // Keyed by the normalized school so filters never share a cache slot.
    key: () => `public-members-${selectedSchool.value || 'all'}`,
    query: computed(() => (selectedSchool.value ? { school: selectedSchool.value } : {})),
    default: (): MembersContentResponse => ({ members: [], sortKeys: {} }),
  })

const members = computed(() => memberContent.value.members)

const { data: schoolStats,refresh:refreshSchoolStats,error:schoolStatsError } = await useFetch<PublicSchoolStat[]>('/api/members/stats/schools', {
  key: 'public-member-school-stats',
  default: () => [],
})

const observedRevision=ref(memberContent.value.revision ?? 0)
let revisionTimer:ReturnType<typeof setInterval>|undefined
const revisionAbort=new AbortController()
onMounted(()=>{
  let checking=false
  revisionTimer=setInterval(async()=>{
    if(checking || document.visibilityState!=='visible')return
    checking=true
    try {
      const {revision}=await $fetch<{revision:number}>('/api/content/members-revision',{signal:revisionAbort.signal})
      if(revision!==observedRevision.value) {
        await Promise.all([refreshMembers(),refreshSchoolStats()])
        if(!membersError.value && !schoolStatsError.value)observedRevision.value=revision
      }
    } catch { /* Preserve the current roster; retry on the next visible tick. */ }
    finally {checking=false}
  },60000)
})
onBeforeUnmount(()=>{if(revisionTimer)clearInterval(revisionTimer);revisionAbort.abort()})

if (import.meta.server && membersError.value) setResponseStatus(502)

/** Ordering is entirely server-derived and replayed on hydration. */
const sortedMembers = computed(() => sortMembersByKeys(members.value, memberContent.value.sortKeys))

const parliamentData = computed(() => buildParliamentData(schoolStats.value))
const filterTabs = computed(() => buildMemberFilterTabs(schoolStats.value))
const currentDate = useState('public-members-date', () => beijingDateString(Date.now()))

const loading = computed(() => membersStatus.value === 'pending')
const errorMessage = computed(() => (membersError.value ? '后端连接异常，请联系管理员' : ''))

const tabLink = (value: string): string => buildPublicPath('/members', { school: value || undefined })

const onSelectChartSchool = async (school: string): Promise<void> => {
  const nextSchool = selectedSchool.value === school ? '' : school
  hoveredSchool.value = nextSchool
  await router.push(tabLink(nextSchool))
}

// A getter, so the canonical URL follows the selected school.
usePublicPageSeo(() => ({
  title: '绯想天住民名录',
  description: '桂航绯想天成员名录，按学校与首字母检索，看看一起打则、聊东方的同好们。',
  path: '/members',
  query: selectedSchool.value ? { school: selectedSchool.value } : {},
}))
</script>

<template>
  <div class="club-paper min-h-screen font-sans">
    <div class="club-container py-5 sm:py-8">
      <header class="mb-3 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-slate-200/80 pb-3 dark:border-slate-800">
        <div class="flex flex-wrap items-baseline gap-3">
          <h1 class="font-serif text-2xl font-semibold tracking-wide text-slate-900 sm:text-3xl dark:text-slate-100">
            绯想天住民名录
          </h1>
        </div>
      </header>

      <section
        aria-label="住民席位分布与院校筛选"
        class="mb-10 border-b border-slate-200 pb-7 dark:border-slate-800"
      >
        <div v-if="parliamentData.length > 0" class="member-seats mb-5">
          <ParliamentChart
            class="member-seats-surface"
            :data="parliamentData"
            title="桂航绯想天"
            :sub-title="currentDate"
            :active-school="activeChartSchool"
            @hover="hoveredSchool = $event || null"
            @select="onSelectChartSchool"
          />
        </div>

        <nav
          aria-label="按院校筛选住民"
          class="member-filter-bar"
          @mouseleave="hoveredSchool = null"
        >
          <span
            v-for="tab in filterTabs"
            :key="tab.value || 'all'"
            class="member-filter-entry"
          >
            <NuxtLink
              :to="tabLink(tab.value)"
              class="member-filter-tab"
              :class="{
                'is-selected': selectedSchool === tab.value,
                'is-zero': tab.count === 0 && selectedSchool !== tab.value,
              }"
              :style="{
                '--tab-color': tab.value ? tab.color : '#0369a1',
                '--tab-dark-color': tab.value ? getSchoolDarkColor(tab.value) : '#38bdf8',
              }"
              :aria-current="selectedSchool === tab.value ? 'page' : undefined"
              @mouseenter="hoveredSchool = tab.value"
            >
              <span
                class="member-filter-swatch"
                aria-hidden="true"
              />
              <span class="member-filter-label">{{ tab.label }}</span>
              <span class="member-filter-count">{{ tab.count }}</span>
            </NuxtLink>
          </span>
        </nav>
      </section>

      <div
        v-if="loading"
        class="py-20 text-center text-sm text-slate-600 dark:text-slate-300"
        role="status"
      >
        正在从红魔馆图书馆调取档案…
      </div>

      <div
        v-else-if="errorMessage"
        class="club-empty text-center text-red-700 dark:text-red-300"
        role="alert"
      >
        <p class="font-semibold">{{ errorMessage }}</p>
        <button type="button" class="club-text-link mt-3" @click="refreshMembers()">
          重新加载
        </button>
      </div>

      <div
        v-else-if="sortedMembers.length === 0"
        class="club-empty text-center"
        role="status"
      >
        <p class="text-base text-slate-600 dark:text-slate-300">该区域暂未发现住民出没...</p>
      </div>

      <div
        v-else
        class="member-grid grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      >
        <div
          v-for="(member, index) in sortedMembers"
          :key="`${selectedSchool || 'all'}-${member.id}`"
          class="member-dossier-entry"
          :style="{
            '--school-accent': member.school ? getSchoolColor(member.school) : '#0369a1',
            '--school-accent-dark': member.school ? getSchoolDarkColor(member.school) : '#38bdf8',
            '--card-delay': `${Math.min(index, 15) * 32}ms`,
          }"
        >
          <article class="member-dossier group">
            <div class="member-dossier-meta">
              <span class="member-dossier-index" aria-hidden="true">
                {{ memberInitialLetter(member.id, memberContent.sortKeys) }} · {{ formatMemberOrdinal(index) }}
              </span>
              <span v-if="member.school" class="member-dossier-school">
                <span
                  class="member-dossier-school-dot"
                  aria-hidden="true"
                />
                {{ member.school }}
              </span>
            </div>

            <div class="member-dossier-profile">
              <div class="member-dossier-avatar-frame">
                <ProgressiveImage
                  :src="displayImageSource(member.avatar) ?? ''"
                  :thumb="displayImageSource(member.avatar_thumb) ?? displayThumbSource(member.avatar) ?? undefined"
                  :alt="`${member.name}头像`"
                  wrapper-class="h-full w-full"
                  img-class="h-full w-full rounded-full object-cover transition-transform duration-500 motion-safe:group-hover:scale-105"
                />
              </div>

              <div class="min-w-0 flex-1">
                <h2 class="member-dossier-name">
                  {{ member.name }}
                </h2>
                <div v-if="member.role" class="mt-1.5">
                  <span class="member-dossier-role">{{ member.role }}</span>
                </div>
              </div>
            </div>

            <div v-if="getMemberTags(member.tags).length > 0" class="member-dossier-tags">
              <span
                v-for="tag in getMemberTags(member.tags)"
                :key="tag"
                class="member-dossier-tag"
              >
                {{ tag }}
              </span>
            </div>
          </article>
        </div>
      </div>

      <footer aria-label="名录收录细则" class="member-colophon">
        <span class="member-colophon-title">收录细则</span>
        <ul class="member-colophon-list">
          <li>
            <span class="member-colophon-num" aria-hidden="true">01</span>
            <span>小号不列入统计</span>
          </li>
          <li>
            <span class="member-colophon-num" aria-hidden="true">02</span>
            <span>按首字母排序</span>
          </li>
          <li>
            <span class="member-colophon-num" aria-hidden="true">03</span>
            <span>如需修改信息请联系管理员</span>
          </li>
        </ul>
      </footer>
    </div>
  </div>
</template>

<style scoped>
@media screen and (min-width: 1920px) {
  .member-grid {
    grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
  }
}

.member-filter-bar {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.5rem;
}

.member-filter-entry {
  display: inline-flex;
  min-width: 0;
}

.member-filter-tab {
  position: relative;
  display: inline-flex;
  min-height: 2.375rem;
  align-items: center;
  gap: 0.5rem;
  padding: 0.375rem 0.75rem;
  border: 1px solid #dce4e8;
  border-top: 2px solid var(--tab-color, #0369a1);
  background-color: #f4f5f0;
  color: #334155;
  font-size: 0.8125rem;
  transition:
    background-color 220ms cubic-bezier(0.22, 1, 0.36, 1),
    border-color 220ms cubic-bezier(0.22, 1, 0.36, 1),
    color 220ms ease,
    box-shadow 220ms cubic-bezier(0.22, 1, 0.36, 1),
    transform 220ms cubic-bezier(0.22, 1, 0.36, 1);
}

.member-filter-tab:hover {
  background-color: #ffffff;
  border-color: #94a3b8;
  border-top-color: var(--tab-color, #0369a1);
  color: #0f172a;
  transform: translateY(-2px);
}

.member-filter-tab.is-zero {
  border-style: dashed;
  border-top-style: solid;
  background-color: #fbfbf8;
  color: #475569;
}

.member-filter-tab.is-selected {
  background-color: #ffffff;
  border-color: #0369a1;
  border-top: 2px solid var(--tab-color, #0369a1);
  color: #0f172a;
  transform: translateY(-2px);
  box-shadow:
    inset 0 1px 0 0 var(--tab-color, #0369a1),
    0 8px 18px -8px rgb(15 23 42 / 0.18);
}

.member-filter-swatch {
  width: 0.375rem;
  height: 0.375rem;
  flex-shrink: 0;
  background-color: var(--tab-color, #0369a1);
  transition: transform 220ms cubic-bezier(0.22, 1, 0.36, 1);
}

:global(.dark .member-filter-swatch) {
  background-color: var(--tab-dark-color, #38bdf8);
}

.member-filter-tab:hover .member-filter-swatch,
.member-filter-tab.is-selected .member-filter-swatch {
  transform: scale(1.25) rotate(45deg);
}

.member-filter-label {
  font-family: var(--club-serif);
  font-weight: 600;
  letter-spacing: 0.03em;
}

.member-filter-count {
  padding-left: 0.375rem;
  border-left: 1px solid #cbd5e1;
  color: #475569;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.6875rem;
  font-weight: 600;
}

.member-filter-tab.is-selected .member-filter-count {
  border-left-color: #94a3b8;
  color: #0369a1;
}

:global(.dark .member-filter-tab) {
  background-color: #131e2a;
  border-color: #293847;
  border-top-color: var(--tab-dark-color, #38bdf8);
  color: #cbd5e1;
}

:global(.dark .member-filter-tab:hover) {
  background-color: #182635;
  border-color: #475569;
  border-top-color: var(--tab-dark-color, #38bdf8);
  color: #f8fafc;
}

:global(.dark .member-filter-tab.is-zero) {
  background-color: #101923;
  color: #94a3b8;
}

:global(.dark .member-filter-tab.is-selected) {
  background-color: #1a2a3a;
  border-color: #7dd3fc;
  border-top-color: var(--tab-dark-color, #38bdf8);
  color: #ffffff;
  box-shadow:
    inset 0 1px 0 0 var(--tab-dark-color, #38bdf8),
    0 10px 22px -8px rgb(2 6 23 / 0.6);
}

:global(.dark .member-filter-count) {
  border-left-color: #334155;
  color: #94a3b8;
}

:global(.dark .member-filter-tab.is-selected .member-filter-count) {
  border-left-color: #475569;
  color: #7dd3fc;
}

.member-dossier-entry {
  min-width: 0;
  animation: dossier-enter 440ms cubic-bezier(0.22, 1, 0.36, 1) var(--card-delay, 0ms) backwards;
}

.member-dossier {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 1.25rem 1.375rem;
  background-color: #ffffff;
  border: 1px solid #dce4e8;
  border-top: 2px solid var(--school-accent, #0369a1);
  transition:
    border-color 220ms ease,
    box-shadow 220ms ease,
    transform 220ms ease;
}

.member-dossier:hover {
  border-color: #94a3b8;
  border-top-color: var(--school-accent, #0369a1);
  box-shadow: 0 10px 26px -14px rgb(15 23 42 / 0.14);
  transform: translateY(-3px);
}

/* The grid item owns the timeline; its card owns the exit, while entrance and
   hover transforms stay independent. Reuse the homepage's compositor effects. */
@supports (animation-timeline: view(block)) and (animation-range: exit-crossing 30% exit-crossing 80%) {
  .member-filter-entry {
    view-timeline-name: --member-filter-exit;
    view-timeline-axis: block;
    /* These short controls leave the reading area at the fixed navbar edge. */
    view-timeline-inset: 4rem 0px;
  }

  .member-filter-tab {
    animation: member-filter-exit auto cubic-bezier(0.333333, 0, 0.666667, 1) both;
    animation-timeline: --member-filter-exit;
    animation-range: exit-crossing 30% exit-crossing 80%;
  }

  .member-filter-tab:focus-visible {
    opacity: 1 !important;
    translate: none !important;
  }

  .member-seats {
    view-timeline-name: --member-seats-exit;
    view-timeline-axis: block;
  }

  .member-seats-surface {
    animation: member-seats-exit auto cubic-bezier(0.333333, 0, 0.666667, 1) both;
    animation-timeline: --member-seats-exit;
    animation-range: exit-crossing 30% exit-crossing 80%;
  }

  .member-dossier-entry {
    view-timeline-name: --member-card-exit;
    view-timeline-axis: block;
  }

  .member-dossier {
    --native-exit-lift: -38px;
    animation: club-section-exit auto cubic-bezier(0.333333, 0, 0.666667, 1) both;
    animation-timeline: --member-card-exit;
    animation-range: exit-crossing 30% exit-crossing 80%;
  }

  .member-dossier:focus-within,
  .member-seats-surface:focus-within {
    opacity: 1 !important;
    translate: none !important;
    scale: none !important;
  }

  @media (max-width: 639px) {
    .member-dossier {
      --native-exit-lift: -32px;
    }
  }
}

@keyframes member-seats-exit {
  from { opacity: 1; translate: 0 0; }
  to { opacity: 0.28; translate: 0 -24px; }
}

@keyframes member-filter-exit {
  from { opacity: 1; translate: 0 0; }
  to { opacity: 0.28; translate: 0 -12px; }
}

:global(.dark .member-dossier) {
  background-color: #14202b;
  border-color: #293847;
  border-top-color: var(--school-accent-dark, #38bdf8);
}

:global(.dark .member-dossier:hover) {
  border-color: #475569;
  border-top-color: var(--school-accent-dark, #38bdf8);
  box-shadow: 0 12px 28px -14px rgb(2 6 23 / 0.55);
}

.member-dossier-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid #eef2f5;
}

:global(.dark .member-dossier-meta) {
  border-bottom-color: #1e2d3d;
}

.member-dossier-index {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.14em;
  color: #475569;
}

:global(.dark .member-dossier-index) {
  color: #94a3b8;
}

.member-dossier-school {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.125rem 0.5rem;
  border: 1px solid #e2e8f0;
  background-color: #f8fafc;
  color: #334155;
  font-size: 0.6875rem;
  font-weight: 600;
}

:global(.dark .member-dossier-school) {
  border-color: #334155;
  background-color: #1e293b;
  color: #e2e8f0;
}

.member-dossier-school-dot {
  width: 0.4375rem;
  height: 0.4375rem;
  border-radius: 9999px;
  flex-shrink: 0;
  background-color: var(--school-accent, #0369a1);
}

:global(.dark .member-dossier-school-dot) {
  background-color: var(--school-accent-dark, #38bdf8);
}

.member-dossier-profile {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-top: 1rem;
}

.member-dossier-avatar-frame {
  width: 4rem;
  height: 4rem;
  flex-shrink: 0;
  padding: 0.1875rem;
  border-radius: 9999px;
  border: 1px solid #cbd5e1;
  background-color: #fbfbf8;
  overflow: hidden;
}

:global(.dark .member-dossier-avatar-frame) {
  border-color: #334155;
  background-color: #0f172a;
}

.member-dossier-name {
  font-family: var(--club-serif);
  font-size: 1.1875rem;
  font-weight: 600;
  line-height: 1.35;
  color: #0f172a;
  word-break: break-word;
  transition: color 180ms ease;
}

.member-dossier:hover .member-dossier-name {
  color: #0369a1;
}

:global(.dark .member-dossier-name) {
  color: #f1f5f9;
}

:global(.dark .member-dossier:hover .member-dossier-name) {
  color: #7dd3fc;
}

.member-dossier-role {
  display: inline-flex;
  align-items: center;
  padding: 0.125rem 0.5rem;
  border: 1px solid #bae6fd;
  background-color: #f0f9ff;
  color: #075985;
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.04em;
}

:global(.dark .member-dossier-role) {
  border-color: #0369a1;
  background-color: #0c4a6e;
  color: #e0f2fe;
}

.member-dossier-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
  margin-top: 0.875rem;
}

.member-dossier-tag {
  padding: 0.125rem 0.5rem;
  border: 1px solid #e2e8f0;
  background-color: #f1f5f9;
  color: #334155;
  font-size: 0.6875rem;
  font-weight: 500;
}

:global(.dark .member-dossier-tag) {
  border-color: #334155;
  background-color: #1e293b;
  color: #e2e8f0;
}

.member-colophon {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem 2rem;
  margin-top: 3.5rem;
  padding-top: 1.25rem;
  border-top: 1px solid #dce4e8;
  color: #475569;
  font-size: 0.75rem;
}

:global(.dark .member-colophon) {
  border-top-color: #293847;
  color: #94a3b8;
}

.member-colophon-title {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.14em;
  color: #475569;
}

:global(.dark .member-colophon-title) {
  color: #94a3b8;
}

.member-colophon-list {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 1.5rem;
  margin: 0;
  padding: 0;
  list-style: none;
  font-family: var(--club-serif);
  letter-spacing: 0.03em;
}

.member-colophon-list li {
  display: inline-flex;
  align-items: baseline;
  gap: 0.375rem;
}

.member-colophon-num {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.6875rem;
  font-weight: 600;
  color: #0369a1;
}

:global(.dark .member-colophon-num) {
  color: #7dd3fc;
}

@keyframes dossier-enter {
  0% {
    opacity: 0;
    transform: translateY(18px) scale(0.985);
  }
  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .member-filter-tab,
  .member-filter-swatch,
  .member-dossier-entry,
  .member-dossier,
  .member-seats-surface,
  .member-dossier-name {
    animation: none;
    transition: none;
    transform: none;
  }
}

@media print {
  .member-filter-tab,
  .member-dossier-entry,
  .member-dossier,
  .member-seats-surface {
    animation: none !important;
    opacity: 1 !important;
    transform: none !important;
    translate: none !important;
    scale: none !important;
  }
}
</style>
