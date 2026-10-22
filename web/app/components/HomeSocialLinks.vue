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
  <div class="grid gap-x-8 sm:grid-cols-2">
    <a
      v-for="(link, index) in links"
      :key="link.url"
      v-reveal="index * 60"
      :href="link.url"
      target="_blank"
      rel="noopener noreferrer"
      class="social-channel group"
    >
      <span class="social-channel-no" aria-hidden="true">{{
        String(index + 1).padStart(2, '0')
      }}</span>
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
          class="h-5 w-5 object-contain"
        /><span v-else>{{ link.iconText || '↗' }}</span>
      </span>
      <span class="min-w-0 break-words">
        <span class="social-channel-name">{{ link.title }}</span>
        <span v-if="link.subtitle" class="social-channel-sub">{{ link.subtitle }}</span>
        <span v-if="link.extra" class="social-channel-extra">{{ link.extra }}</span>
        <span class="sr-only">（在新标签页打开）</span>
      </span>
      <ClubIcon name="external" class="social-channel-arrow" />
    </a>
  </div>
</template>

<style scoped>
.social-channel {
  display: grid;
  grid-template-columns: 1.75rem 2.5rem minmax(0, 1fr) 1rem;
  align-items: start;
  gap: 0.875rem;
  min-width: 0;
  padding-block: 1.5rem;
  border-top: 1px solid #dce4e8;
  transition: border-color 200ms ease;
}
:global(.dark .social-channel) {
  border-top-color: #293847;
}
.social-channel-no {
  padding-top: 0.3rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.1em;
  color: #94a3b8;
  transition: color 200ms ease;
}
.social-channel-icon {
  display: flex;
  height: 2.5rem;
  width: 2.5rem;
  align-items: center;
  justify-content: center;
  border-radius: 2px;
  background-color: #0369a1;
  color: #ffffff;
  font-size: 1.125rem;
  font-weight: 600;
}
.social-channel-name {
  display: block;
  font-size: 0.875rem;
  font-weight: 600;
  line-height: 1.6;
  color: #1e293b;
  transition: color 200ms ease;
}
.social-channel-sub {
  display: block;
  margin-top: 0.25rem;
  font-size: 0.75rem;
  line-height: 1.7;
  color: #64748b;
}
.social-channel-extra {
  display: block;
  margin-top: 0.5rem;
  font-size: 0.75rem;
  line-height: 1.7;
  color: #64748b;
}
:global(.dark .social-channel-name) {
  color: #f1f5f9;
}
:global(.dark .social-channel-sub),
:global(.dark .social-channel-extra) {
  color: #94a3b8;
}
.social-channel-arrow {
  margin-top: 0.25rem;
  height: 1rem;
  width: 1rem;
  color: #94a3b8;
  transition:
    color 200ms ease,
    transform 250ms ease;
}
.social-channel:is(:hover, :focus-visible) {
  border-top-color: #0369a1;
}
.social-channel:is(:hover, :focus-visible) .social-channel-name {
  color: #0369a1;
}
.social-channel:is(:hover, :focus-visible) .social-channel-no {
  color: #0369a1;
}
.social-channel:is(:hover, :focus-visible) .social-channel-arrow {
  color: #0369a1;
  transform: translateY(-2px);
}
:global(.dark .social-channel:is(:hover, :focus-visible)) {
  border-top-color: #7dd3fc;
}
:global(.dark .social-channel:is(:hover, :focus-visible) .social-channel-name),
:global(.dark .social-channel:is(:hover, :focus-visible) .social-channel-no),
:global(.dark .social-channel:is(:hover, :focus-visible) .social-channel-arrow) {
  color: #7dd3fc;
}
@media (prefers-reduced-motion: reduce) {
  .social-channel,
  .social-channel-no,
  .social-channel-name,
  .social-channel-arrow {
    transition: none;
    transform: none;
  }
}
</style>
