<script setup lang="ts">
import HomeSocialLinks from '~/components/HomeSocialLinks.vue'

const { socialLinks: links, pending: loading, error: errorMessage, retry, ready } = usePublicConfig()

await ready

usePublicSeo({ title: '博丽大结界', path: '/social' })
</script>

<template>
  <div class="club-paper min-h-screen">
    <div class="club-container py-12 sm:py-20">
      <header class="border-b border-slate-200 pb-10 dark:border-slate-800">
        <p class="club-eyebrow">ELSEWHERE, TOGETHER</p>
        <h1 class="club-page-title mt-4">绯想天 · 外界通讯</h1>
        <p class="mt-5 text-sm leading-8 text-slate-500 dark:text-slate-400">
          分享创作，约一场游戏，或在语音里打声招呼。<br />在你习惯的地方，也能找到我们。
        </p>
      </header>
      <section
        class="grid gap-10 py-12 lg:grid-cols-[.7fr_1.3fr] lg:gap-20"
        aria-labelledby="channels-title"
      >
        <div>
          <h2 id="channels-title" class="font-serif text-2xl font-semibold">
            保持联系
          </h2>
          <p class="mt-4 text-sm leading-8 text-slate-500 dark:text-slate-400">
            关注最新动态，也欢迎把你的作品带来。<br />以下链接将在新窗口打开。
          </p>
          <NuxtLink to="/join" class="club-text-link mt-5"
            >加入同好群 <span aria-hidden="true">→</span></NuxtLink
          >
        </div>
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
        <HomeSocialLinks v-else :links="links" />
      </section>
    </div>
  </div>
</template>
