<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import HomeSocialLinks from '~/components/HomeSocialLinks.vue'
import ClubIcon from '~/components/ClubIcon.vue'
import { normalizedGroupNumber } from '~/utils/site-config'

const { config, socialLinks: links, pending: loading, error: errorMessage, retry, ready } = usePublicConfig()

await ready

const groupNumber = computed(() => normalizedGroupNumber(config.value.qq_group_number))
const linkCount = computed(() => links.value.length)

const copying = ref(false)
const copied = ref(false)
let copyTimer: ReturnType<typeof setTimeout> | null = null

const copyGroupNumber = async (): Promise<void> => {
  if (!groupNumber.value || copying.value) return
  copying.value = true
  try {
    await navigator.clipboard.writeText(groupNumber.value)
    copied.value = true
    if (copyTimer) clearTimeout(copyTimer)
    copyTimer = setTimeout(() => {
      copied.value = false
    }, 2500)
  } catch {
    // If clipboard access is rejected, the user can still read the group number.
  } finally {
    copying.value = false
  }
}

onUnmounted(() => {
  if (copyTimer) clearTimeout(copyTimer)
})

usePublicSeo({
  title: '博丽大结界',
  path: '/social',
  description: '桂航绯想天社群与创作平台入口，在你习惯的地方保持联系、分享东方 Project 创作。'
})
</script>

<template>
  <div class="club-paper min-h-screen">
    <div class="club-container py-12 sm:py-20">
      <header class="border-b border-slate-200 pb-10 dark:border-slate-800">
        <div class="flex flex-wrap items-end justify-between gap-x-8 gap-y-6">
          <div class="min-w-0">
            <p class="club-eyebrow">博丽大结界 · ELSEWHERE, TOGETHER</p>
            <h1 class="club-page-title mt-4">绯想天 · 外界通讯</h1>
            <p class="mt-4 max-w-xl text-sm leading-8 text-slate-500 dark:text-slate-400">
              分享同人创作，约一场 STG / 绯想天则对战，或在语音频道里打声招呼。穿过结界，在你习惯的地方，随时找到我们。
            </p>
          </div>

          <dl class="social-index" aria-label="结界概况">
            <div class="social-index-row">
              <dt>收录渠道</dt>
              <dd class="inline-flex items-center gap-1.5">
                <span class="social-status-dot" aria-hidden="true"/>
                <span>{{ linkCount }} 处</span>
              </dd>
            </div>
            <div v-if="groupNumber" class="social-index-row">
              <dt>同好交流群</dt>
              <dd class="flex items-center gap-2">
                <span class="font-mono">{{ groupNumber }}</span>
                <button
                  type="button"
                  class="social-copy-trigger"
                  :title="copied ? '群号已复制' : '复制群号'"
                  @click="copyGroupNumber"
                >
                  <ClubIcon :name="copied ? 'check' : 'copy'" class="h-3 w-3" />
                  <span class="sr-only">{{ copied ? '群号已复制' : '复制群号' }}</span>
                </button>
              </dd>
            </div>
            <p v-if="copied" class="social-index-copied" role="status">
              群号已复制到剪贴板
            </p>
          </dl>
        </div>
      </header>

      <section class="social-layout" aria-labelledby="channels-title">
        <aside class="social-aside">
          <p class="club-eyebrow text-xs">COMMUNITY DIRECTORY</p>
          <h2 id="channels-title" class="social-aside-title">
            保持联系
          </h2>
          <p class="social-aside-body">
            关注社团最新动态，探索更多同好阵地。以下链接均为社团官方或长期活跃的交流渠道，将在新标签页中打开。
          </p>

          <div class="social-aside-guidelines">
            <h3 class="social-guidelines-heading">
              同好公约
            </h3>
            <ul class="social-guidelines-list">
              <li>
                <span class="social-guideline-bullet" aria-hidden="true">•</span>
                <span><strong>纯粹东方</strong>：交流原作游戏、音乐与二创创作</span>
              </li>
              <li>
                <span class="social-guideline-bullet" aria-hidden="true">•</span>
                <span><strong>友善包容</strong>：欢迎所有新手，尊重多元审美与讨论</span>
              </li>
              <li>
                <span class="social-guideline-bullet" aria-hidden="true">•</span>
                <span><strong>互助同行</strong>：共建真诚干净的东方同好阵地</span>
              </li>
            </ul>
          </div>

          <div class="social-aside-action">
            <NuxtLink to="/join" class="club-text-link">
              加入同好群 <span aria-hidden="true">→</span>
            </NuxtLink>
            <p class="mt-1 text-xs text-slate-400 dark:text-slate-500">
              查看群号、加群验证问答与二维码
            </p>
          </div>
        </aside>

        <div class="social-channels min-w-0">
          <p v-if="loading" class="py-10 text-sm text-slate-500" role="status">
            正在建立外界链接…
          </p>
          <div
            v-else-if="errorMessage"
            class="py-10 text-sm text-red-600 dark:text-red-400"
            role="status"
          >
            <p>{{ errorMessage }}</p>
            <button type="button" class="club-text-link mt-3" @click="retry">
              重新加载
            </button>
          </div>
          <template v-else>
            <div class="social-channel-list">
              <HomeSocialLinks :links="links" />
            </div>

            <div class="social-join-banner">
              <div class="min-w-0">
                <p class="club-eyebrow">YOUR NEXT CHAPTER · 同好集结</p>
                <p class="social-join-title mt-2">
                  想穿过结界，亲自来看看？
                </p>
                <p class="mt-3 text-sm leading-7 text-slate-500 dark:text-slate-400">
                  无需任何入坑门槛，带上你的热爱就好。加群打声招呼、参与线下例会、或是共同创作，桂航绯想天欢迎每一位同好。
                </p>
              </div>

              <div class="social-join-actions">
                <NuxtLink to="/join" class="club-button club-button-primary shrink-0">
                  加入桂航绯想天 <ClubIcon name="arrow" class="h-4 w-4" />
                </NuxtLink>
                <button
                  v-if="groupNumber"
                  type="button"
                  class="social-join-copy-btn shrink-0"
                  @click="copyGroupNumber"
                >
                  <ClubIcon :name="copied ? 'check' : 'copy'" class="h-3.5 w-3.5" />
                  <span>{{ copied ? '已复制群号' : `复制群号 ${groupNumber}` }}</span>
                </button>
              </div>
            </div>
          </template>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.social-index {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
  margin: 0;
  padding: 1rem 1.25rem;
  border: 1px solid #dce4e8;
  border-top: 2px solid #0284c7;
  border-radius: 2px;
  background-color: #ffffff;
  font-size: 0.75rem;
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.04);
}
:global(.dark .social-index) {
  border-color: #293847;
  border-top-color: #38bdf8;
  background-color: rgb(20 32 43 / 0.7);
  box-shadow: none;
}

.social-index-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1.5rem;
}
.social-index-row dt {
  color: #64748b;
  letter-spacing: 0.02em;
}
.social-index-row dd {
  margin: 0;
  font-weight: 600;
  color: #0f172a;
}
:global(.dark .social-index-row dt) {
  color: #94a3b8;
}
:global(.dark .social-index-row dd) {
  color: #f1f5f9;
}

.social-status-dot {
  display: inline-block;
  height: 0.5rem;
  width: 0.5rem;
  border-radius: 9999px;
  background-color: #10b981;
}

.social-copy-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 1.375rem;
  width: 1.375rem;
  padding: 0;
  border: 1px solid #e2e8f0;
  border-radius: 2px;
  background-color: #f8fafc;
  color: #64748b;
  cursor: pointer;
  transition:
    border-color 150ms ease,
    background-color 150ms ease,
    color 150ms ease;
}
:global(.dark .social-copy-trigger) {
  border-color: #293847;
  background-color: #1a2836;
  color: #94a3b8;
}
.social-copy-trigger:hover {
  border-color: #0284c7;
  background-color: #e0f2fe;
  color: #0284c7;
}
:global(.dark .social-copy-trigger:hover) {
  border-color: #38bdf8;
  background-color: rgb(2 132 199 / 0.2);
  color: #38bdf8;
}

.social-index-copied {
  margin: 0;
  padding-top: 0.25rem;
  font-size: 0.6875rem;
  font-weight: 500;
  color: #059669;
}
:global(.dark .social-index-copied) {
  color: #34d399;
}

.social-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 3rem;
  padding-block: 3rem;
}
@media (min-width: 1024px) {
  .social-layout {
    grid-template-columns: minmax(0, 0.72fr) minmax(0, 1.28fr);
    gap: 4.5rem;
  }
}

.social-aside {
  min-width: 0;
}
@media (min-width: 1024px) {
  .social-aside {
    position: sticky;
    top: 6rem;
    align-self: start;
  }
}

.social-aside-title {
  margin-top: 0.75rem;
  font-family: var(--club-serif);
  font-size: clamp(1.4rem, 2.2vw, 1.75rem);
  font-weight: 600;
  line-height: 1.4;
  letter-spacing: -0.02em;
  color: #0f172a;
}
:global(.dark .social-aside-title) {
  color: #f1f5f9;
}

.social-aside-body {
  margin-top: 0.875rem;
  font-size: 0.875rem;
  line-height: 1.9;
  color: #475569;
}
:global(.dark .social-aside-body) {
  color: #94a3b8;
}

.social-aside-guidelines {
  margin-top: 1.75rem;
  padding-top: 1.5rem;
  border-top: 1px solid #e2e8f0;
}
:global(.dark .social-aside-guidelines) {
  border-top-color: #293847;
}

.social-guidelines-heading {
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #94a3b8;
}
:global(.dark .social-guidelines-heading) {
  color: #64748b;
}

.social-guidelines-list {
  margin: 0.75rem 0 0 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
  font-size: 0.75rem;
  line-height: 1.7;
  color: #475569;
}
:global(.dark .social-guidelines-list) {
  color: #94a3b8;
}
.social-guidelines-list li {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
}
.social-guideline-bullet {
  color: #0284c7;
  font-weight: 700;
  line-height: 1.4;
}
:global(.dark .social-guideline-bullet) {
  color: #38bdf8;
}

.social-aside-action {
  margin-top: 1.75rem;
  padding-top: 1.5rem;
  border-top: 1px solid #e2e8f0;
}
:global(.dark .social-aside-action) {
  border-top-color: #293847;
}

.social-channel-list {
  min-width: 0;
}

.social-join-banner {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  margin-top: 3rem;
  padding: 1.75rem;
  border: 1px solid #dce4e8;
  border-radius: 2px;
  background-color: #ffffff;
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.04);
}
:global(.dark .social-join-banner) {
  border-color: #293847;
  background-color: rgb(20 32 43 / 0.7);
  box-shadow: none;
}
@media (min-width: 640px) {
  .social-join-banner {
    padding: 2rem;
  }
}

.social-join-title {
  font-family: var(--club-serif);
  font-size: clamp(1.25rem, 2vw, 1.5rem);
  font-weight: 600;
  line-height: 1.45;
  letter-spacing: -0.02em;
  color: #0f172a;
}
:global(.dark .social-join-title) {
  color: #f1f5f9;
}

.social-join-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.875rem;
  padding-top: 0.5rem;
}

.social-join-copy-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 1rem;
  border: 1px solid #dce4e8;
  border-radius: 2px;
  background-color: #f8fafc;
  color: #334155;
  font-size: 0.8125rem;
  font-weight: 500;
  cursor: pointer;
  transition:
    border-color 150ms ease,
    background-color 150ms ease,
    color 150ms ease;
}
:global(.dark .social-join-copy-btn) {
  border-color: #293847;
  background-color: #1a2836;
  color: #cbd5e1;
}
.social-join-copy-btn:hover {
  border-color: #0284c7;
  background-color: #e0f2fe;
  color: #0284c7;
}
:global(.dark .social-join-copy-btn:hover) {
  border-color: #38bdf8;
  background-color: rgb(2 132 199 / 0.2);
  color: #38bdf8;
}
</style>
