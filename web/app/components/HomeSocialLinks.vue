<script setup lang="ts">
import type { PropType } from 'vue'
import ClubIcon from '~/components/ClubIcon.vue'
import { vReveal } from '~/utils/motion'
import type { SocialLink } from '~/utils/site-config'

defineProps({
  links: { type: Array as PropType<SocialLink[]>, default: () => [] }
})
</script>

<template>
  <div class="grid gap-4 sm:grid-cols-2">
    <a
      v-for="(link, index) in links"
      :key="link.url"
      v-reveal="index * 60"
      :href="link.url"
      target="_blank"
      rel="noopener noreferrer"
      class="social-channel group"
    >
      <div class="flex items-center justify-between gap-2">
        <span class="social-channel-no" aria-hidden="true">{{
          String(index + 1).padStart(2, '0')
        }}</span>
        <span class="social-channel-arrow-box" aria-hidden="true">
          <ClubIcon name="external" class="social-channel-arrow" />
        </span>
      </div>

      <div class="mt-3 flex items-start gap-3.5">
        <span
          class="social-channel-icon"
          :style="{
            backgroundColor: link.iconBg || undefined,
            color: link.iconColor || undefined
          }"
          aria-hidden="true"
        >
          <img
            v-if="link.iconUrl"
            :src="link.iconUrl"
            alt=""
            loading="lazy"
            decoding="async"
            class="h-6 w-6 object-contain"
          />
          <span v-else>{{ link.iconText || '↗' }}</span>
        </span>

        <div class="min-w-0 flex-1">
          <span class="social-channel-name">{{ link.title }}</span>
          <span v-if="link.subtitle" class="social-channel-sub">{{ link.subtitle }}</span>
          <span class="sr-only">（在新标签页打开）</span>
        </div>
      </div>

      <div v-if="link.extra" class="social-channel-footer">
        <span class="social-channel-extra">
          {{ link.extra }}
        </span>
        <span class="social-channel-hint" aria-hidden="true">
          前往渠道 <span class="transition-transform group-hover:translate-x-0.5">→</span>
        </span>
      </div>
    </a>
  </div>
</template>

<style scoped>
.social-channel {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-width: 0;
  padding: 1.25rem 1.375rem;
  border: 1px solid #dce4e8;
  border-radius: 2px;
  background-color: #ffffff;
  text-decoration: none;
  transition:
    border-color 200ms ease,
    background-color 200ms ease,
    box-shadow 200ms ease,
    transform 200ms ease;
}
:global(.dark .social-channel) {
  border-color: #293847;
  background-color: rgb(20 32 43 / 0.7);
}
.social-channel:is(:hover, :focus-visible) {
  border-color: #0284c7;
  background-color: #f8fafc;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px -2px rgb(2 132 199 / 0.08);
}
:global(.dark .social-channel:is(:hover, :focus-visible)) {
  border-color: #38bdf8;
  background-color: #1a2836;
  box-shadow: 0 4px 12px -2px rgb(0 0 0 / 0.35);
}

.social-channel-no {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.1em;
  color: #94a3b8;
  transition: color 200ms ease;
}
.social-channel:is(:hover, :focus-visible) .social-channel-no {
  color: #0284c7;
}
:global(.dark .social-channel:is(:hover, :focus-visible) .social-channel-no) {
  color: #38bdf8;
}

.social-channel-arrow-box {
  display: flex;
  height: 1.625rem;
  width: 1.625rem;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  background-color: #f1f5f9;
  color: #94a3b8;
  transition:
    background-color 200ms ease,
    color 200ms ease;
}
:global(.dark .social-channel-arrow-box) {
  background-color: #1e293b;
  color: #64748b;
}
.social-channel:is(:hover, :focus-visible) .social-channel-arrow-box {
  background-color: #e0f2fe;
  color: #0284c7;
}
:global(.dark .social-channel:is(:hover, :focus-visible) .social-channel-arrow-box) {
  background-color: rgb(2 132 199 / 0.2);
  color: #38bdf8;
}

.social-channel-arrow {
  height: 0.875rem;
  width: 0.875rem;
  transition: transform 200ms ease;
}
.social-channel:is(:hover, :focus-visible) .social-channel-arrow {
  transform: translate(1px, -1px);
}

.social-channel-icon {
  display: flex;
  height: 2.625rem;
  width: 2.625rem;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  background-color: #0369a1;
  color: #ffffff;
  font-size: 1rem;
  font-weight: 700;
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.05);
}

.social-channel-name {
  display: block;
  font-size: 0.9375rem;
  font-weight: 600;
  line-height: 1.45;
  color: #0f172a;
  transition: color 200ms ease;
}
:global(.dark .social-channel-name) {
  color: #f1f5f9;
}
.social-channel:is(:hover, :focus-visible) .social-channel-name {
  color: #0284c7;
}
:global(.dark .social-channel:is(:hover, :focus-visible) .social-channel-name) {
  color: #38bdf8;
}

.social-channel-sub {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin-top: 0.25rem;
  font-size: 0.75rem;
  line-height: 1.6;
  color: #64748b;
}
:global(.dark .social-channel-sub) {
  color: #94a3b8;
}

.social-channel-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-top: 1rem;
  padding-top: 0.75rem;
  border-top: 1px solid #f1f5f9;
}
:global(.dark .social-channel-footer) {
  border-top-color: #1e293b;
}

.social-channel-extra {
  display: inline-flex;
  align-items: center;
  max-width: 75%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.6875rem;
  line-height: 1.5;
  color: #475569;
  background-color: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 2px;
  padding: 0.125rem 0.375rem;
}
:global(.dark .social-channel-extra) {
  color: #94a3b8;
  background-color: #14202b;
  border-color: #293847;
}

.social-channel-hint {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.6875rem;
  font-weight: 500;
  color: #94a3b8;
  opacity: 0;
  transform: translateX(-4px);
  transition:
    opacity 200ms ease,
    transform 200ms ease,
    color 200ms ease;
}
:global(.dark .social-channel-hint) {
  color: #64748b;
}
.social-channel:is(:hover, :focus-visible) .social-channel-hint {
  opacity: 1;
  transform: translateX(0);
  color: #0284c7;
}
:global(.dark .social-channel:is(:hover, :focus-visible) .social-channel-hint) {
  color: #38bdf8;
}

@media (prefers-reduced-motion: reduce) {
  .social-channel,
  .social-channel-no,
  .social-channel-name,
  .social-channel-arrow,
  .social-channel-arrow-box,
  .social-channel-hint {
    transition: none !important;
    transform: none !important;
  }
}
</style>
