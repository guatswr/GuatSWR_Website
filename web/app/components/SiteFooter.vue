<script setup lang="ts">
import { computed } from 'vue'
import { useSiteConfigStore } from '../stores/site-config'

const site = useSiteConfigStore(usePinia())
const year = new Date().getFullYear()
const groupNumber = computed(() =>
  /^\d{5,12}$/.test(site.config.qq_group_number || '')
    ? site.config.qq_group_number
    : ''
)
const quickLinks = [
  { name: '首页', path: '/' },
  { name: '活动', path: '/events' },
  { name: '活动回顾', path: '/activities' },
  { name: '成员', path: '/members' },
  { name: '群史', path: '/history' },
  { name: '社群链接', path: '/social' }
]


</script>

<template>
  <footer class="club-footer">
    <div class="club-container">
      <div
        class="grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-[1.25fr_.75fr_1fr] lg:gap-16 lg:py-14"
      >
        <div class="max-w-sm">
          <p
            class="club-display text-xl font-semibold tracking-wider text-slate-100"
          >
            桂航绯想天
          </p>
          <p class="mt-1 font-mono text-[9px] tracking-[.22em] text-slate-500">
            GUAT TOUHOU FANS CLUB
          </p>
          <p class="mt-5 text-sm leading-7 text-slate-400">
            桂林航天工业学院东方 Project
            同好会。因幻想乡相识，也在校园里成为朋友。
          </p>
          <NuxtLink :prefetch="false" to="/join" class="club-text-link mt-4">
            加入我们 <span aria-hidden="true">↗</span>
          </NuxtLink>
        </div>

        <nav aria-label="页脚导航">
          <p class="club-footer-heading">浏览</p>
          <ul class="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <li v-for="link in quickLinks" :key="link.path">
              <NuxtLink :prefetch="false" :to="link.path" class="club-footer-link">{{
                link.name
              }}</NuxtLink>
            </li>
          </ul>
        </nav>

        <div>
          <p class="club-footer-heading">保持联系</p>
          <template v-if="groupNumber">
            <p class="mt-4 text-xs text-slate-400">QQ 群</p>
            <p class="mt-1 font-mono text-lg tracking-wide text-slate-100">
              {{ groupNumber }}
            </p>
            <NuxtLink :prefetch="false" to="/join" class="club-text-link mt-1 text-xs">
              扫码入群 <span aria-hidden="true">↗</span>
            </NuxtLink>
          </template>
          <p v-else class="mt-4 text-sm leading-7 text-slate-400">
            加群方式与二维码见「加入我们」页面。
          </p>
          <div class="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs">
            <NuxtLink :prefetch="false" to="/logs" class="club-footer-link"
              >站点日志</NuxtLink
            >
            <NuxtLink :prefetch="false" to="/login" class="club-footer-link"
              >管理入口</NuxtLink
            >
          </div>
        </div>
      </div>

      <div
        class="flex flex-col gap-3 border-t border-white/10 py-6 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between"
      >
        <p>© {{ year }} 桂航绯想天同好会</p>
        <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
          <a
            href="https://beian.miit.gov.cn/"
            target="_blank"
            rel="noopener noreferrer"
            class="transition-colors hover:text-sky-200"
          >
            晋ICP备2026001481号
          </a>
          <span class="text-slate-600" aria-hidden="true">|</span>
          <a
            href="https://icp.gov.moe/?keyword=20263036"
            target="_blank"
            rel="noopener noreferrer"
            class="transition-colors hover:text-sky-200"
          >
            萌ICP备20263036号
          </a>
          <span class="text-slate-600" aria-hidden="true">·</span>
          <span>Designed by Taropoi</span>
        </div>
      </div>
    </div>
  </footer>
</template>

<style scoped>
.club-footer {
  color: #e2e8f0;
  background: #0b1220;
}
.club-footer-heading {
  color: #7dd3fc;
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.17em;
  text-transform: uppercase;
}
.club-footer-link {
  color: #cbd5e1;
  transition: color 180ms ease;
}
.club-footer-link:hover {
  color: #e0f2fe;
}
.club-footer .club-text-link {
  color: #7dd3fc;
}
.club-footer .club-text-link:hover {
  color: #e0f2fe;
}
</style>
