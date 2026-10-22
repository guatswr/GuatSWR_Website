<script setup lang="ts">
import HomeSocialLinks from '~/components/HomeSocialLinks.vue'
import ClubIcon from '~/components/ClubIcon.vue'
import { normalizedGroupNumber } from '~/utils/site-config'

const { config, socialLinks: links, pending: loading, error: errorMessage, retry, ready } = usePublicConfig()

await ready

const groupNumber = computed(() => normalizedGroupNumber(config.value.qq_group_number))
const linkCount = computed(() => links.value.length)

usePublicSeo({ title: '博丽大结界', path: '/social', description: '桂航绯想天社群与创作平台入口，在你习惯的地方保持联系、分享东方 Project 创作。' })
</script>

<template>
  <div class="club-paper min-h-screen">
    <div class="club-container py-12 sm:py-20">
      <header class="border-b border-slate-200 pb-10 dark:border-slate-800">
        <div class="flex flex-wrap items-end justify-between gap-x-8 gap-y-6">
          <div class="min-w-0">
            <p class="club-eyebrow">ELSEWHERE, TOGETHER</p>
            <h1 class="club-page-title mt-4">博丽大结界</h1>
            <p class="mt-5 max-w-xl text-sm leading-8 text-slate-500 dark:text-slate-400">
              分享创作，约一场游戏，或在语音里打声招呼。在你习惯的地方，也能找到我们。
            </p>
          </div>
          <dl class="social-index" aria-label="结界概况">
            <div class="social-index-row">
              <dt>收录频道</dt>
              <dd>{{ linkCount }} 处</dd>
            </div>
            <div v-if="groupNumber" class="social-index-row">
              <dt>同好群</dt>
              <dd class="font-mono">{{ groupNumber }}</dd>
            </div>
          </dl>
        </div>
      </header>

      <section class="social-layout" aria-labelledby="channels-title">
        <aside class="social-aside">
          <p class="social-aside-seal" aria-hidden="true">结界</p>
          <h2 id="channels-title" class="social-aside-title">
            保持联系
          </h2>
          <p class="social-aside-body">
            关注最新动态，也欢迎把你的作品带来。以下链接将在新窗口打开。
          </p>
          <NuxtLink to="/join" class="club-text-link mt-6">
            加入同好群 <span aria-hidden="true">→</span>
          </NuxtLink>
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
                <p class="club-eyebrow">YOUR NEXT CHAPTER</p>
                <p class="social-join-title mt-3">
                  想穿过结界，亲自来看看？
                </p>
                <p class="mt-3 text-sm leading-7 text-slate-500 dark:text-slate-400">
                  无需入坑门槛，带上你的热爱就好。
                  <span v-if="groupNumber">
                    也欢迎先加 QQ 群
                    <span class="font-mono text-slate-700 dark:text-slate-200">{{ groupNumber }}</span>
                    打个招呼。
                  </span>
                </p>
              </div>
              <NuxtLink to="/join" class="club-button club-button-primary shrink-0">
                加入桂航绯想天 <ClubIcon name="arrow" class="h-4 w-4" />
              </NuxtLink>
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
  gap: 0.5rem;
  margin: 0;
  padding: 0.875rem 1.125rem;
  border: 1px solid #dce4e8;
  border-top: 2px solid #a34e47;
  background-color: #ffffff;
  font-size: 0.75rem;
}
:global(.dark .social-index) {
  border-color: #293847;
  background-color: #14202b;
}
.social-index-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1.5rem;
}
.social-index-row dt {
  color: #64748b;
  letter-spacing: 0.04em;
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

.social-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 3rem;
  padding-block: 3rem;
}
@media (min-width: 1024px) {
  .social-layout {
    grid-template-columns: minmax(0, 0.72fr) minmax(0, 1.28fr);
    gap: 5rem;
  }
}

.social-aside {
  min-width: 0;
}
.social-aside-seal {
  display: inline-flex;
  align-items: center;
  padding: 0.15rem 0.4rem;
  border: 1px solid rgb(163 78 71 / 0.4);
  background-color: rgb(163 78 71 / 0.07);
  color: #a34e47;
  font-family: var(--club-serif);
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.12em;
}
:global(.dark .social-aside-seal) {
  border-color: rgb(240 168 153 / 0.4);
  background-color: rgb(240 168 153 / 0.1);
  color: #f0a899;
}
.social-aside-title {
  margin-top: 1rem;
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
  margin-top: 1rem;
  font-size: 0.875rem;
  line-height: 2;
  color: #475569;
}
:global(.dark .social-aside-body) {
  color: #94a3b8;
}
@media (min-width: 1024px) {
  .social-aside {
    position: sticky;
    top: 6rem;
    align-self: start;
  }
}

.social-channel-list {
  min-width: 0;
}

.social-join-banner {
  display: grid;
  gap: 1.25rem;
  margin-top: 3.5rem;
  padding-top: 2rem;
  border-top: 1px solid #dce4e8;
}
:global(.dark .social-join-banner) {
  border-top-color: #293847;
}
@media (min-width: 640px) {
  .social-join-banner {
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 2rem;
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
</style>
