<script setup lang="ts">
import type { PropType } from 'vue'
import type { PublicSiteConfig } from '@guatswr/shared'
import { defaultPublicConfig } from '@guatswr/shared/config'
import ProgressiveImage from '~/components/ProgressiveImage.vue'
import ClubIcon from '~/components/ClubIcon.vue'
import HomeAvatarToy from './HomeAvatarToy.vue'
import { getThumbUrl } from '~/utils/image-url'
import { vScrollReveal } from '~/utils/scroll-motion'

defineProps({
  config: {
    type: Object as PropType<PublicSiteConfig>,
    default: () => ({ ...defaultPublicConfig })
  }
})
</script>

<template>
  <section
    v-scroll-reveal="{ variant: 'hero' }"
    class="club-banner relative isolate flex min-h-[100svh] items-center justify-center overflow-hidden bg-slate-900 pt-16"
    aria-labelledby="home-title"
  >
    <ProgressiveImage
      v-if="config.home_bg"
      :src="config.home_bg"
      :thumb="getThumbUrl(config.home_bg)"
      alt="幻想乡角色们的热闹相聚"
      eager
      wrapper-class="club-banner-background absolute inset-0"
      img-class="h-full w-full object-cover object-center"
    />
    <div
      v-else
      class="absolute inset-0 bg-gradient-to-br from-sky-950 via-slate-900 to-slate-950"
      aria-hidden="true"
    />
    <div class="club-banner-shade absolute inset-0" aria-hidden="true" />
    <div
      class="absolute inset-0 bg-gradient-to-t from-slate-950/40 via-transparent to-slate-950/10"
      aria-hidden="true"
    />
    <div
      class="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-slate-950/70 to-transparent"
      aria-hidden="true"
    />

    <div
      class="club-banner-content club-container relative z-10 grid items-center gap-5 py-10 text-white lg:grid-cols-[1.15fr_.85fr] lg:gap-16 lg:py-12"
    >
      <div
        class="club-banner-intro order-2 min-w-0 text-center lg:order-1 lg:text-left"
      >
        <h1
          id="home-title"
          class="club-banner-title club-hero-step font-serif font-bold leading-tight"
        >
          桂航绯想天
        </h1>
        <p
          class="club-banner-subtitle club-hero-step mt-4 break-words text-xs font-medium uppercase leading-6 tracking-[.12em] text-sky-100 sm:text-base lg:mt-6 lg:border-l-2 lg:border-sky-200/70 lg:pl-4"
          style="--motion-order: 1"
        >
          {{ config.banner_text || 'Guat Touhou Fans Club' }}
        </p>
        <p
          class="club-banner-copy club-hero-step mt-5 text-sm leading-7 text-white/95 sm:text-base sm:leading-8 lg:mt-8 lg:text-lg lg:leading-9"
          style="--motion-order: 2"
        >
          从一局非想天则，到一场线下例会<br >我们因幻想乡相识，也在校园里成为朋友
        </p>
        <p
          class="club-banner-note club-hero-step mt-6 text-xs leading-6 text-white/75 lg:mt-8"
          style="--motion-order: 3"
        >
          桂林航天工业学院 · 校内外同好都欢迎
        </p>
        <div
          class="club-banner-actions club-hero-step mt-6 flex flex-wrap items-center gap-3 lg:mt-8"
          style="--motion-order: 4"
        >
          <NuxtLink to="/join" class="club-invitation club-hero-invitation">
            <span class="club-invitation-label">加入我们</span>
            <ClubIcon name="arrow" class="club-invitation-arrow" />
          </NuxtLink>
          <NuxtLink to="/events" class="club-invitation club-hero-explore">
            <span class="club-invitation-label">看看活动</span>
            <ClubIcon name="arrow" class="club-invitation-arrow" />
          </NuxtLink>
        </div>
      </div>
      <HomeAvatarToy
        :src="config.badge_image"
        class="club-banner-toy club-hero-art-enter order-1 mx-auto lg:order-2"
      />
    </div>
    <a
      href="#interests"
      class="club-scroll-cue absolute bottom-4 left-1/2 z-10 flex min-h-11 -translate-x-1/2 items-center gap-3 whitespace-nowrap text-[10px] tracking-[.2em] text-white/80"
    >
      <span class="club-scroll-line" aria-hidden="true" />向下，遇见同好
    </a>
  </section>
</template>

<style scoped>
.club-banner-shade {
  background: rgb(2 6 23 / 0.48);
}
.club-banner-title {
  font-family: var(--club-serif);
  font-size: clamp(2.5rem, min(10vw, 9svh), 5rem);
  letter-spacing: 0.08em;
  text-shadow: 0 3px 16px rgb(0 0 0 / 0.55);
}
.club-banner-copy {
  text-shadow: 0 2px 8px rgb(0 0 0 / 0.65);
}
.club-banner-actions {
  gap: 1.5rem;
}
.club-banner-actions .club-invitation {
  --invitation-ink: #f0f5f7;
  --invitation-line: rgb(224 242 254 / 0.48);
  --invitation-accent: #edb2a5;
  min-height: 3.25rem;
}
.club-hero-invitation {
  isolation: isolate;
  overflow: hidden;
  min-width: 9rem;
  padding: 0.625rem 1.125rem;
  border: 1px solid rgb(224 242 254 / 0.24);
  border-radius: 1px;
  background-color: rgb(8 30 45 / 0.2);
  background-image: linear-gradient(
    110deg,
    rgb(224 242 254 / 0.04),
    transparent 70%
  );
  transition:
    background-color 300ms ease,
    border-color 300ms ease;
}
.club-hero-invitation .club-invitation-label {
  font-weight: 500;
  letter-spacing: 0.12em;
}
.club-hero-invitation::before {
  content: '';
  position: absolute;
  inset: 3px;
  z-index: -1;
  pointer-events: none;
  background:
    linear-gradient(currentColor, currentColor) left top / 8px 1px no-repeat,
    linear-gradient(currentColor, currentColor) left top / 1px 8px no-repeat,
    linear-gradient(currentColor, currentColor) right top / 8px 1px no-repeat,
    linear-gradient(currentColor, currentColor) right top / 1px 8px no-repeat,
    linear-gradient(currentColor, currentColor) left bottom / 8px 1px no-repeat,
    linear-gradient(currentColor, currentColor) left bottom / 1px 8px no-repeat,
    linear-gradient(currentColor, currentColor) right bottom / 8px 1px no-repeat,
    linear-gradient(currentColor, currentColor) right bottom / 1px 8px no-repeat;
  opacity: 0.38;
}
.club-hero-invitation::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background: linear-gradient(
    110deg,
    transparent 25%,
    rgb(224 242 254 / 0.12),
    transparent 75%
  );
  transform: translateX(-110%);
  opacity: 0;
  transition:
    transform 700ms ease,
    opacity 150ms ease;
}
.club-hero-invitation:is(:hover, :focus-visible) {
  border-color: rgb(224 242 254 / 0.65);
  background-color: rgb(8 30 45 / 0.48);
}
.club-hero-invitation:is(:hover, :focus-visible)::after {
  opacity: 1;
  transform: translateX(110%);
}
.club-hero-explore {
  padding: 0.55rem 0.15rem;
}
.club-hero-explore::after {
  content: '';
  position: absolute;
  inset-inline: 0;
  bottom: 4px;
  height: 1px;
  background: linear-gradient(
    90deg,
    rgb(186 230 253 / 0.7),
    rgb(186 230 253 / 0.12)
  );
  transform: scaleX(0.4);
  transform-origin: left;
  transition: transform 400ms ease;
}
.club-hero-explore:is(:hover, :focus-visible)::after {
  transform: scaleX(1);
}
.club-scroll-line {
  position: relative;
  display: block;
  width: 12px;
  height: 28px;
  flex-shrink: 0;
  color: #e0f2fe;
  transform-origin: 50% 10%;
  animation: club-scroll-spring 3000ms cubic-bezier(0.4, 0, 0.2, 1) infinite;
}
.club-scroll-line::before {
  content: '';
  position: absolute;
  top: 1px;
  bottom: 5px;
  left: calc(50% - 0.5px);
  width: 1px;
  background: linear-gradient(transparent, currentColor 75%);
}
.club-scroll-line::after {
  content: '';
  position: absolute;
  bottom: 5px;
  left: 50%;
  width: 6px;
  height: 6px;
  border-right: 1px solid currentColor;
  border-bottom: 1px solid currentColor;
  transform: translateX(-50%) rotate(45deg);
}
@keyframes club-scroll-spring {
  0%,
  10% {
    transform: translateY(0) scaleY(1);
  }
  32% {
    transform: translateY(7px) scaleY(1.1);
  }
  44% {
    transform: translateY(-1.5px) scaleY(0.96);
  }
  54% {
    transform: translateY(1px) scaleY(1.02);
  }
  64%,
  100% {
    transform: translateY(0) scaleY(1);
  }
}
@media (max-width: 1023px) {
  .club-banner {
    flex-direction: column;
    min-height: 100vh;
    min-height: 100svh;
    padding-top: max(4rem, calc(env(safe-area-inset-top) + 4rem));
  }
  .club-banner-shade {
    background: linear-gradient(
      180deg,
      rgb(2 6 23 / 0.18) 10%,
      rgb(2 6 23 / 0.28) 40%,
      rgb(2 6 23 / 0.62) 72%,
      rgb(2 6 23 / 0.74) 100%
    );
  }
  .club-banner-content {
    display: flex;
    flex-direction: column;
    gap: clamp(1rem, 2.5svh, 1.75rem);
    margin-block: auto;
    padding-top: clamp(1rem, 3svh, 2rem);
    padding-bottom: max(
      clamp(1.75rem, 4svh, 3rem),
      calc(env(safe-area-inset-bottom) + 2rem)
    );
    text-align: center;
  }
  .club-scroll-cue {
    position: relative;
    inset: auto;
    flex-shrink: 0;
    margin-bottom: max(1rem, calc(env(safe-area-inset-bottom) + 0.5rem));
    translate: none;
  }
  .club-banner-intro {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 100%;
    max-width: 32rem;
    text-align: center;
  }
  .club-banner-title {
    order: 0;
    margin-top: 0;
    font-size: clamp(2rem, 9.5vw, 3rem);
    line-height: 1.25;
    letter-spacing: 0.06em;
    text-wrap: balance;
  }
  .club-banner-subtitle {
    order: 1;
    margin-top: 0.75rem;
    font-size: 0.625rem;
    line-height: 1.8;
    letter-spacing: 0.16em;
    overflow-wrap: anywhere;
  }
  .club-banner-toy {
    position: relative;
    z-index: 3;
    flex-shrink: 0;
    align-self: center;
    margin-inline: auto;
  }
  .club-banner-copy {
    order: 2;
    margin-top: 1rem;
    font-size: 0.875rem;
    line-height: 1.95;
    color: rgb(255 255 255 / 0.9);
    text-shadow: none;
  }
  .club-banner-note {
    order: 3;
    margin-top: 1rem;
    font-size: 0.6875rem;
    line-height: 1.8;
    color: #cbd5e1;
  }
  .club-banner-actions {
    order: 4;
    margin-top: 1.25rem;
    width: 100%;
    max-width: 22rem;
  }
  .club-banner-actions {
    justify-content: center;
    gap: 0.9rem;
  }
  .club-banner-actions .club-invitation {
    flex: 1 1 0;
    min-width: 0;
    gap: 0.375rem;
    padding-inline: 0.5rem;
  }
  .club-banner-actions .club-invitation-label {
    font-size: 0.8125rem;
    letter-spacing: 0.06em;
  }
}
@media (max-width: 1023px) and (max-height: 650px) {
  .club-banner-content {
    gap: 0.75rem;
    padding-block: 0.75rem;
  }
  .club-banner-toy {
    --avatar-size: clamp(6rem, 20svh, 8rem);
  }
}
@media (max-width: 359px) {
  .club-banner-copy {
    font-size: 0.8125rem;
  }
}
@media (min-width: 1024px) {
  .club-banner-shade {
    background: linear-gradient(
      90deg,
      rgb(2 6 23 / 0.8),
      rgb(2 6 23 / 0.6) 45%,
      rgb(2 6 23 / 0.3)
    );
  }
  .club-banner-title {
    font-size: clamp(3.5rem, 6vw, 5.5rem);
  }
}
@media (prefers-reduced-motion: reduce) {
  .club-hero-invitation,
  .club-hero-invitation::after,
  .club-hero-explore::after {
    transition: none;
    transform: none;
  }
  .club-hero-invitation::after {
    display: none;
  }
  .club-scroll-line {
    animation: none;
    transform: none;
  }
}
</style>
