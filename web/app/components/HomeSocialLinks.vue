<script setup lang="ts">
import type { PropType } from 'vue'
import ClubIcon from '~/components/ClubIcon.vue'
import { vScrollReveal } from '~/utils/scroll-motion'
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
      v-scroll-reveal="{ variant: 'card', delay: index * 110 }"
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

      <div class="social-channel-main mt-3 flex items-start gap-3.5">
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
          >
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
          前往渠道 <span>→</span>
        </span>
      </div>
    </a>
  </div>
</template>

<style scoped>
.social-channel {
  --channel-ease: cubic-bezier(0.22, 1, 0.36, 1);
  --channel-stagger: var(--reveal-delay, 0ms);
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
  box-shadow: 0 4px 12px -2px rgb(2 132 199 / 0.08);
}
.social-channel:focus-visible {
  outline: 2px solid #0284c7;
  outline-offset: 4px;
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
  font-size: 1rem;
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
  font-size: 0.8125rem;
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
  font-size: 0.75rem;
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

@media (prefers-reduced-motion: no-preference) {
  /* Keep entrance properties first: shared reveal delays apply to opacity,
     translate and scale, while hover feedback remains immediate. */
  .social-channel.club-reveal {
    transition:
      opacity 560ms var(--channel-ease),
      translate 720ms var(--channel-ease),
      scale 720ms var(--channel-ease),
      transform 320ms var(--channel-ease),
      border-color 220ms ease,
      box-shadow 320ms ease,
      background-color 220ms ease;
  }
  .social-channel.club-reveal[data-reveal='visible'] {
    transition-delay:
      var(--channel-stagger), var(--channel-stagger), var(--channel-stagger),
      0ms, 0ms, 0ms, 0ms;
  }
  .social-channel.club-reveal[data-reveal='visible'][data-scroll-exit='true'] {
    opacity: calc(1 - var(--scroll-exit, 0) * 0.72);
    translate: 0 calc(var(--scroll-exit, 0) * -38px);
    scale: calc(1 - var(--scroll-exit, 0) * 0.025);
    transition-duration: 90ms, 90ms, 90ms, 320ms, 220ms, 320ms, 220ms;
    transition-delay: 0ms;
  }
  .social-channel.club-reveal[data-reveal='pending']:not(:focus-within) {
    translate: 0 28px;
    scale: 0.985;
    transition: none;
  }
  .social-channel-main,
  .social-channel-footer {
    transition:
      opacity 450ms var(--channel-ease),
      translate 600ms var(--channel-ease);
    transition-delay: calc(var(--channel-stagger) + 70ms);
  }
  .social-channel-footer {
    transition-delay: calc(var(--channel-stagger) + 110ms);
  }
  .social-channel[data-reveal='pending']:not(:focus-within) .social-channel-main,
  .social-channel[data-reveal='pending']:not(:focus-within) .social-channel-footer {
    opacity: 0;
    translate: 0 8px;
    transition: none;
  }
  .social-channel.club-reveal:focus-within,
  .social-channel:focus-within .social-channel-main,
  .social-channel:focus-within .social-channel-footer {
    transition-delay: 0ms;
    transition-duration: 0ms;
  }
  .social-channel-icon {
    transition: transform 400ms var(--channel-ease);
  }
  .social-channel-arrow {
    transition: transform 320ms var(--channel-ease);
  }
  .social-channel:focus-visible .social-channel-arrow {
    transform: translate(2px, -2px);
  }
  .social-channel:active {
    transform: translateY(-1px);
  }
}
@media (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference) {
  .social-channel:hover {
    transform: translateY(-4px);
  }
  .social-channel:hover .social-channel-icon {
    transform: translateY(-1px) scale(1.04);
  }
  .social-channel:hover .social-channel-arrow {
    transform: translate(2px, -2px);
  }
  .social-channel:active {
    transform: translateY(-1px);
  }
}
@media (max-width: 639px) and (prefers-reduced-motion: no-preference) {
  .social-channel {
    --channel-stagger: 0ms;
  }
  .social-channel.club-reveal {
    transition-duration: 450ms, 560ms, 560ms, 320ms, 220ms, 320ms, 220ms;
  }
  .social-channel.club-reveal[data-reveal='visible'][data-scroll-exit='true'] {
    opacity: calc(1 - var(--scroll-exit, 0) * 0.68);
    translate: 0 calc(var(--scroll-exit, 0) * -24px);
    scale: calc(1 - var(--scroll-exit, 0) * 0.02);
    transition-duration: 80ms, 80ms, 80ms, 320ms, 220ms, 320ms, 220ms;
    transition-delay: 0ms;
  }
  .social-channel.club-reveal[data-reveal='pending']:not(:focus-within) {
    translate: 0 16px;
    scale: 1;
  }
}
@media (prefers-reduced-motion: reduce), print {
  .social-channel,
  .social-channel-main,
  .social-channel-footer,
  .social-channel-icon,
  .social-channel-no,
  .social-channel-name,
  .social-channel-arrow,
  .social-channel-arrow-box,
  .social-channel-hint {
    transition: none !important;
    transform: none !important;
    translate: none !important;
    scale: none !important;
  }
}
</style>
