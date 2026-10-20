<script setup lang="ts">
/**
 * `/members` - archived `views/public/Members.vue`.
 *
 * The selected school lives in the URL (`?school=桂航`), so the filtered list
 * is server-rendered and works without JavaScript. An empty `school` value is
 * treated as "全部", matching the backend's truthiness check (an empty string
 * is ignored there too). Pinyin sort keys come from the server with the list,
 * exactly as the archived `Members.vue` sorted with `pinyin-pro`.
 */
import type { MembersContentResponse } from '#shared/content'
import type { PublicSchoolStat } from '@guatswr/shared'
import { usePublicPageSeo } from '~/composables/usePublicPageSeo'
import { beijingDateString } from '~/utils/beijing-time'
import {
  buildMemberFilterTabs,
  buildParliamentData,
  getMemberTags,
  getSchoolColor,
  sortMembersByKeys,
} from '~/utils/members'
import { buildPublicPath, queryValue, stripControlCharacters } from '~/utils/public-query'
import { displayImageSource, displayThumbSource } from '~/utils/public-image'

const route = useRoute()

/** Bounded arbitrary school value; never a recognized filter unless present. */
const selectedSchool = computed(() => stripControlCharacters(queryValue(route.query.school) ?? '')
  .trim()
  .slice(0, 32))

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

const { data: schoolStats } = await useFetch<PublicSchoolStat[]>('/api/members/stats/schools', {
  key: 'public-member-school-stats',
  default: () => [],
})

if (import.meta.server && membersError.value) setResponseStatus(502)

/** Ordering is entirely server-derived and replayed on hydration. */
const sortedMembers = computed(() => sortMembersByKeys(members.value, memberContent.value.sortKeys))

const parliamentData = computed(() => buildParliamentData(schoolStats.value))
const filterTabs = computed(() => buildMemberFilterTabs(schoolStats.value))
const currentDate = useState('public-members-date', () => beijingDateString(Date.now()))

const loading = computed(() => membersStatus.value === 'pending')
const errorMessage = computed(() => (membersError.value ? '后端连接异常，请联系管理员' : ''))

const tabLink = (value: string): string => buildPublicPath('/members', { school: value || undefined })

// A getter, so the canonical URL follows the selected school.
usePublicPageSeo(() => ({
  title: '绯想天住民名录',
  description: '桂航绯想天成员名录，按学校与首字母检索，看看一起打则、聊东方的同好们。',
  path: '/members',
  query: selectedSchool.value ? { school: selectedSchool.value } : {},
}))
</script>

<template>
  <div class="min-h-screen bg-[#f0f9ff] dark:bg-slate-950 py-12 px-4 relative overflow-hidden font-sans">
    <div class="absolute top-0 right-0 w-96 h-96 bg-blue-200/20 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none"/>
    <div class="absolute bottom-0 left-0 w-96 h-96 bg-red-200/20 rounded-full blur-3xl -ml-20 -mb-20 pointer-events-none"/>
    <div class="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-[20rem] font-bold text-white opacity-40 select-none pointer-events-none font-serif">
      ⑨
    </div>

    <div class="max-w-7xl mx-auto relative z-10">
      <div class="text-center mb-8">
        <h1 class="text-4xl font-bold text-sky-600 dark:text-sky-400 font-serif mb-4 flex justify-center items-center gap-2">
          绯想天住民名录
        </h1>

        <div class="flex flex-wrap justify-center gap-3 mb-4">
          <div class="flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-gray-500 dark:text-gray-400 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md rounded-full border border-blue-100 dark:border-slate-800 shadow-sm transition hover:scale-105 cursor-default select-none">
            <div class="w-1.5 h-1.5 rounded-full bg-amber-400 shadow-[0_0_5px_rgba(251,191,36,0.5)]"/>
            <span>小号不列入统计</span>
          </div>
          <div class="flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-gray-500 dark:text-gray-400 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md rounded-full border border-blue-100 dark:border-slate-800 shadow-sm transition hover:scale-105 cursor-default select-none">
            <div class="w-1.5 h-1.5 rounded-full bg-pink-400 shadow-[0_0_5px_rgba(244,114,182,0.5)]"/>
            <span>按首字母排序</span>
          </div>
          <div class="flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-gray-500 dark:text-gray-400 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md rounded-full border border-blue-100 dark:border-slate-800 shadow-sm transition hover:scale-105 cursor-default select-none">
            <div class="w-1.5 h-1.5 rounded-full bg-sky-500 shadow-[0_0_5px_rgba(14,165,233,0.5)]"/>
            <span>如需修改信息请联系管理员</span>
          </div>
        </div>
      </div>

      <div v-if="parliamentData.length > 0" class="mb-12">
        <ParliamentChart
          :data="parliamentData"
          title="桂航绯想天"
          :sub-title="currentDate"
        />
      </div>

      <div class="mb-12 flex flex-wrap justify-center gap-3 px-2">
        <NuxtLink
          v-for="tab in filterTabs"
          :key="tab.value"
          :to="tabLink(tab.value)"
          class="relative px-4 py-2 rounded-full text-sm font-bold transition-all duration-300 flex items-center gap-2 shadow-sm hover:-translate-y-0.5"
          :class="[
            selectedSchool === tab.value
              ? 'text-white shadow-md ring-2 ring-offset-2 ring-offset-[#f0f9ff] dark:ring-offset-slate-950'
              : 'bg-white/60 dark:bg-slate-800/60 text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-slate-800',
          ]"
          :style="{
            backgroundColor: selectedSchool === tab.value ? tab.color : '',
            borderColor: selectedSchool === tab.value ? tab.color : 'transparent',
            '--tw-ring-color': tab.color,
          }"
          :aria-current="selectedSchool === tab.value ? 'page' : undefined"
        >
          <span>{{ tab.label }}</span>
          <span
            class="px-1.5 py-0.5 rounded-full text-[10px] min-w-[1.2rem] flex items-center justify-center transition-colors"
            :class="
              selectedSchool === tab.value
                ? 'bg-white/20 text-white'
                : 'bg-gray-200/50 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400'
            "
          >
            {{ tab.count }}
          </span>
        </NuxtLink>
      </div>

      <div v-if="loading" class="text-center py-20">
        <div class="animate-spin text-blue-400 text-3xl">❄️</div>
        <p class="text-gray-400 dark:text-gray-300 mt-2">
          正在从红魔馆图书馆调取档案...
        </p>
      </div>

      <div v-else-if="errorMessage" class="text-center py-20 text-red-500">
        <p class="font-bold">{{ errorMessage }}</p>
        <button type="button" class="club-text-link mt-4" @click="refreshMembers()">重新加载</button>
      </div>

      <div v-else-if="sortedMembers.length === 0" class="text-center py-20 text-gray-400 dark:text-gray-500">
        <p class="text-lg">该区域暂未发现住民出没...</p>
      </div>

      <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
        <div
          v-for="member in sortedMembers"
          :key="member.id"
          class="bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm rounded-2xl p-6 shadow-sm hover:shadow-lg transition transform hover:-translate-y-2 border border-blue-50 dark:border-slate-800 relative group"
        >
          <div class="relative w-24 h-24 mx-auto mb-4">
            <div class="w-full h-full rounded-full p-1 bg-gradient-to-tr from-blue-300 to-pink-300 shadow-inner overflow-hidden">
              <ProgressiveImage
                :src="displayImageSource(member.avatar) ?? ''"
                :thumb="displayImageSource(member.avatar_thumb) ?? displayThumbSource(member.avatar) ?? undefined"
                alt="Avatar"
                wrapper-class="w-full h-full"
                img-class="w-full h-full object-cover rounded-full block transform group-hover:scale-110 transition duration-500"
              />
            </div>

            <div
              v-if="member.school"
              class="absolute -bottom-1 -right-2 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-md border-2 border-white transform rotate-[-5deg] group-hover:rotate-0 transition duration-300"
              :style="{ backgroundColor: getSchoolColor(member.school) }"
            >
              {{ member.school }}
            </div>
          </div>

          <div class="text-center">
            <h2 class="text-xl font-bold text-gray-800 dark:text-gray-100 mb-1 font-serif">
              {{ member.name }}
            </h2>
            <span class="inline-block px-3 py-1 bg-blue-100 dark:bg-slate-800 text-blue-600 dark:text-blue-200 text-xs rounded-full font-bold mb-2 border border-blue-200 dark:border-slate-700">
              {{ member.role }}
            </span>
            <div class="flex flex-wrap justify-center gap-1.5 mb-4 min-h-[18px]">
              <span
                v-for="tag in getMemberTags(member.tags)"
                :key="tag"
                class="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-violet-100 text-violet-600 border border-violet-200/70 dark:bg-violet-900/30 dark:text-violet-200 dark:border-violet-800/60"
              >
                {{ tag }}
              </span>
            </div>
            <p class="text-sm text-gray-600 dark:text-gray-300 leading-relaxed italic border-t border-dashed border-gray-200 dark:border-slate-700 pt-4 relative">
              <span class="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-white dark:bg-slate-900 px-2 text-gray-300 dark:text-gray-400 text-xs">Spell Card</span>
              "{{ member.bio }}"
            </p>
          </div>
          <div class="absolute inset-0 rounded-2xl border-2 border-transparent group-hover:border-blue-300 transition pointer-events-none"/>
        </div>
      </div>
    </div>
  </div>
</template>
