<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import { normalizedGroupNumber } from '~/utils/site-config'
import type { SocialLink } from '~/utils/site-config'

const {
  config,
  socialLinks: links,
  friendLinks,
  pending: loading,
  error: errorMessage,
  retry,
  ready
} = usePublicConfig()

await ready

const groupNumber = computed(() => normalizedGroupNumber(config.value.qq_group_number))

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
    copied.value = false
  } finally {
    copying.value = false
  }
}

const failedIcons = ref<Record<string, boolean>>({})

const iconKey = (prefix: string, index: number, link: SocialLink): string =>
  `${prefix}-${index}-${link.iconUrl || ''}`

const showImageIcon = (prefix: string, index: number, link: SocialLink): boolean =>
  Boolean(link.iconUrl) && !failedIcons.value[iconKey(prefix, index, link)]

const markIconFailed = (prefix: string, index: number, link: SocialLink): void => {
  failedIcons.value[iconKey(prefix, index, link)] = true
}

const iconInitial = (link: SocialLink, fallback: string): string => {
  const custom = link.iconText?.trim()
  if (custom) return custom.slice(0, 2)
  const title = link.title?.trim()
  return title ? title.slice(0, 1) : fallback
}

onUnmounted(() => {
  if (copyTimer) clearTimeout(copyTimer)
})

usePublicSeo({
  title: '社群链接',
  path: '/social',
  description: '桂航绯想天社群平台入口与友情链接汇总。'
})
</script>

<template>
  <div class="club-paper min-h-screen">
    <div class="club-container social-page">
      <header class="social-header">
        <div class="social-header-main">
          <h1>社群链接</h1>
          <p class="social-lead">
            汇总桂航绯想天官方平台、交流群组与友好社团站点链接。
          </p>
        </div>

        <div class="social-header-meta">
          <div v-if="groupNumber" class="social-group-chip">
            <span class="social-group-label">QQ 交流群</span>
            <span class="social-group-code">{{ groupNumber }}</span>
            <button
              type="button"
              class="social-copy-btn"
              :aria-label="copied ? '群号已复制' : '复制群号'"
              @click="copyGroupNumber"
            >
              <i :class="copied ? 'ti ti-check' : 'ti ti-copy'" aria-hidden="true" />
              <span>{{ copied ? '已复制' : '复制' }}</span>
            </button>
          </div>

          <NuxtLink to="/join" class="social-join-btn">
            <span>加入同好群</span>
            <i class="ti ti-arrow-right" aria-hidden="true" />
          </NuxtLink>
        </div>
      </header>

      <p v-if="loading" class="social-status" role="status">
        正在加载链接数据…
      </p>

      <div v-else-if="errorMessage" class="social-status social-status-error" role="status">
        <p>{{ errorMessage }}</p>
        <button type="button" class="social-retry-btn" @click="retry">
          <i class="ti ti-refresh" aria-hidden="true" />
          <span>重新加载</span>
        </button>
      </div>

      <div v-else class="social-sections">
        <section class="social-section" aria-labelledby="network-heading">
          <div class="social-section-head">
            <div class="social-section-title-row">
              <h2 id="network-heading">绯想天网络</h2>
              <span class="social-count">{{ links.length }} 项</span>
            </div>
            <p class="social-section-desc">
              社团官方账号、直播频道与日常交流阵地，点击卡片可在新标签页打开。
            </p>
          </div>

          <ul v-if="links.length" class="social-grid" role="list">
            <li v-for="(link, index) in links" :key="`net-${index}-${link.url}`">
              <a
                :href="link.url"
                target="_blank"
                rel="noopener noreferrer"
                class="social-card"
              >
                <div
                  class="social-card-icon"
                  :style="{
                    backgroundColor: showImageIcon('net', index, link)
                      ? 'transparent'
                      : link.iconBg || 'var(--surface-1)',
                    color: link.iconColor || 'var(--text-primary)'
                  }"
                  aria-hidden="true"
                >
                  <img
                    v-if="showImageIcon('net', index, link)"
                    :src="link.iconUrl"
                    alt=""
                    width="40"
                    height="40"
                    loading="lazy"
                    decoding="async"
                    class="social-card-img"
                    @error="markIconFailed('net', index, link)"
                  >
                  <span v-else class="social-card-initial">
                    {{ iconInitial(link, '社') }}
                  </span>
                </div>

                <div class="social-card-body">
                  <div class="social-card-top">
                    <h3>{{ link.title || '未命名链接' }}</h3>
                    <i class="ti ti-external-link social-card-ext" aria-hidden="true" />
                  </div>
                  <p v-if="link.subtitle" class="social-card-sub">
                    {{ link.subtitle }}
                  </p>
                  <p v-if="link.extra" class="social-card-extra">
                    {{ link.extra }}
                  </p>
                </div>

                <span class="sr-only">（在新标签页打开）</span>
              </a>
            </li>
          </ul>
          <div v-else class="social-empty">
            暂未配置社团网络链接。
          </div>
        </section>

        <section class="social-section" aria-labelledby="friends-heading">
          <div class="social-section-head">
            <div class="social-section-title-row">
              <h2 id="friends-heading">友情链接</h2>
              <span class="social-count">{{ friendLinks.length }} 项</span>
            </div>
            <p class="social-section-desc">
              友好高校东方社团与关联站点，已收录的友链也会自适应展示在全站页脚。
            </p>
          </div>

          <ul v-if="friendLinks.length" class="social-grid" role="list">
            <li v-for="(link, index) in friendLinks" :key="`friend-${index}-${link.url}`">
              <a
                :href="link.url"
                target="_blank"
                rel="noopener noreferrer"
                class="social-card"
              >
                <div
                  class="social-card-icon"
                  :style="{
                    backgroundColor: showImageIcon('friend', index, link)
                      ? 'transparent'
                      : link.iconBg || 'var(--surface-1)',
                    color: link.iconColor || 'var(--text-primary)'
                  }"
                  aria-hidden="true"
                >
                  <img
                    v-if="showImageIcon('friend', index, link)"
                    :src="link.iconUrl"
                    alt=""
                    width="40"
                    height="40"
                    loading="lazy"
                    decoding="async"
                    class="social-card-img"
                    @error="markIconFailed('friend', index, link)"
                  >
                  <span v-else class="social-card-initial">
                    {{ iconInitial(link, '友') }}
                  </span>
                </div>

                <div class="social-card-body">
                  <div class="social-card-top">
                    <h3>{{ link.title || '未命名友链' }}</h3>
                    <i class="ti ti-external-link social-card-ext" aria-hidden="true" />
                  </div>
                  <p v-if="link.subtitle" class="social-card-sub">
                    {{ link.subtitle }}
                  </p>
                  <p v-if="link.extra" class="social-card-extra">
                    {{ link.extra }}
                  </p>
                </div>

                <span class="sr-only">（在新标签页打开）</span>
              </a>
            </li>
          </ul>
          <div v-else class="social-empty">
            暂未收录友情链接。
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.social-page {
  --surface-0: transparent;
  --surface-1: #f1f5f9;
  --surface-2: #ffffff;
  --text-primary: #0f172a;
  --text-secondary: #475569;
  --text-muted: #64748b;
  --text-accent: #0369a1;
  --text-danger: #dc2626;
  --border: #cbd5e1;
  --border-strong: #64748b;
  --border-accent: #0284c7;
  --radius: 8px;
  --font-sans: 'Anthropic Sans', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  --pad-sm: 0.5rem;
  --pad-md: 1rem;
  --pad-lg: 1.5rem;
  --pad-xl: 2.5rem;
  --gap-xs: 0.375rem;
  --gap-sm: 0.625rem;
  --gap-md: 1rem;
  --gap-lg: 1.5rem;
  --gap-xl: 2.5rem;
  display: block;
  width: 100%;
  padding-top: 3rem;
  padding-bottom: 4rem;
  background: var(--surface-0);
  color: var(--text-primary);
  font-family: var(--font-sans);
  font-size: 16px;
  font-weight: 400;
  line-height: 1.7;
}

:global(.dark) .social-page {
  --surface-1: #1e293b;
  --surface-2: #14202b;
  --text-primary: #f1f5f9;
  --text-secondary: #cbd5e1;
  --text-muted: #94a3b8;
  --text-accent: #7dd3fc;
  --text-danger: #f87171;
  --border: #334155;
  --border-strong: #64748b;
  --border-accent: #38bdf8;
}

.social-page h1 {
  margin: 0;
  font-size: 22px;
  font-weight: 500;
  line-height: 1.4;
  color: var(--text-primary);
}

.social-page h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 500;
  line-height: 1.4;
  color: var(--text-primary);
}

.social-page h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 500;
  line-height: 1.4;
  color: var(--text-primary);
}

.social-header {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--gap-lg);
  padding: 1rem 0 1.5rem;
  border-bottom: 0.5px solid var(--border);
}

.social-header-main {
  min-width: 0;
  max-width: 42rem;
}

.social-lead {
  margin: 0.5rem 0 0;
  font-size: 16px;
  font-weight: 400;
  line-height: 1.7;
  color: var(--text-secondary);
}

.social-header-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--gap-sm);
}

.social-group-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--gap-sm);
  min-height: 36px;
  padding: 0.25rem 0.5rem 0.25rem 0.75rem;
  background: var(--surface-2);
  border: 0.5px solid var(--border);
  border-radius: var(--radius);
  font-size: 13px;
  color: var(--text-secondary);
}

.social-group-label {
  color: var(--text-muted);
}

.social-group-code {
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}

.social-copy-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  min-height: 26px;
  padding: 0.125rem 0.5rem;
  background: var(--surface-1);
  border: 0.5px solid var(--border);
  border-radius: 6px;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 400;
  cursor: pointer;
  transition: border-color 150ms ease, color 150ms ease;
}

.social-copy-btn:hover {
  border-color: var(--border-strong);
  color: var(--text-primary);
}

.social-join-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  min-height: 36px;
  padding: 0.375rem 0.875rem;
  background: var(--surface-2);
  border: 0.5px solid var(--border);
  border-radius: var(--radius);
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 500;
  text-decoration: none;
  transition: border-color 150ms ease, color 150ms ease;
}

.social-join-btn:hover {
  border-color: var(--border-strong);
  color: var(--text-accent);
}

.social-status {
  margin: var(--pad-lg) 0 0;
  padding: 1rem 1.25rem;
  background: var(--surface-2);
  border: 0.5px solid var(--border);
  border-radius: 12px;
  color: var(--text-secondary);
  font-size: 14px;
}

.social-status-error {
  color: var(--text-danger);
}

.social-retry-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  min-height: 36px;
  margin-top: 0.75rem;
  padding: 0.375rem 0.875rem;
  background: var(--surface-1);
  border: 0.5px solid var(--border);
  border-radius: var(--radius);
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 400;
  cursor: pointer;
}

.social-retry-btn:hover {
  border-color: var(--border-strong);
}

.social-sections {
  display: flex;
  flex-direction: column;
  gap: var(--gap-xl);
  margin-top: var(--pad-xl);
}

.social-section {
  display: flex;
  flex-direction: column;
  gap: var(--gap-md);
}

.social-section-head {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.social-section-title-row {
  display: flex;
  align-items: center;
  gap: var(--gap-sm);
}

.social-count {
  display: inline-flex;
  align-items: center;
  padding: 0.125rem 0.5rem;
  background: var(--surface-1);
  border: 0.5px solid var(--border);
  border-radius: var(--radius);
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 400;
  line-height: 1.4;
}

.social-section-desc {
  margin: 0;
  font-size: 14px;
  font-weight: 400;
  line-height: 1.7;
  color: var(--text-secondary);
}

.social-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: var(--gap-md);
  margin: 0;
  padding: 0;
  list-style: none;
}

@media (min-width: 1280px) {
  .social-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

.social-card {
  display: flex;
  align-items: flex-start;
  gap: 0.875rem;
  height: 100%;
  padding: 1rem 1.25rem;
  background: var(--surface-2);
  border: 0.5px solid var(--border);
  border-radius: 12px;
  color: var(--text-primary);
  text-decoration: none;
  transition: border-color 150ms ease;
}

.social-card:hover {
  border-color: var(--border-strong);
}

.social-card-icon {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  overflow: hidden;
  border: 0.5px solid var(--border);
  border-radius: var(--radius);
}

.social-card-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.social-card-initial {
  font-size: 14px;
  font-weight: 500;
  line-height: 1;
}

.social-card-body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 0;
}

.social-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.social-card-top h3 {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.social-card-ext {
  flex-shrink: 0;
  color: var(--text-muted);
  font-size: 14px;
  transition: color 150ms ease;
}

.social-card:hover .social-card-ext {
  color: var(--text-primary);
}

.social-card-sub {
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 400;
  line-height: 1.5;
}

.social-card-extra {
  margin: 0.125rem 0 0;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 400;
  line-height: 1.5;
}

.social-empty {
  padding: 1rem 1.25rem;
  background: var(--surface-2);
  border: 0.5px solid var(--border);
  border-radius: 12px;
  color: var(--text-muted);
  font-size: 14px;
  font-weight: 400;
}

.ti {
  display: inline-block;
  font-style: normal;
  font-weight: 400;
  line-height: 1;
}

.ti-arrow-right::before {
  content: '\2192';
}

.ti-external-link::before {
  content: '\2197';
}

.ti-copy::before {
  content: '\2398';
}

.ti-check::before {
  content: '\2713';
}

.ti-refresh::before {
  content: '\21BB';
}
</style>
