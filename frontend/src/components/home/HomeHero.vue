<script setup>
import ProgressiveImage from '../ProgressiveImage.vue'
import HomeAvatarToy from './HomeAvatarToy.vue'
import { getThumbUrl } from '../../utils/imageUrl'
import { vScrollReveal } from '../../directives/scrollMotion'

defineProps({ config: { type: Object, default: () => ({}) } })
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
      wrapperClass="club-banner-background absolute inset-0"
      imgClass="h-full w-full object-cover object-center"
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
          从一局非想天则，到一场线下例会。<br />我们因幻想乡相识，也在校园里成为朋友。
        </p>
        <p
          class="club-banner-note club-hero-step mt-6 text-xs leading-6 text-white/75 lg:mt-8"
          style="--motion-order: 3"
        >
          桂林航天工业学院 · 校内外同好都欢迎
        </p>
      </div>
      <HomeAvatarToy
        :src="config.badge_image"
        class="club-banner-toy club-hero-art-enter order-1 mx-auto lg:order-2"
      />
    </div>
    <a
      href="#upcoming"
      class="club-scroll-cue absolute bottom-4 left-1/2 z-10 hidden min-h-11 -translate-x-1/2 items-center gap-3 text-[10px] tracking-[.2em] text-white/80 lg:flex"
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
  font-size: clamp(2.5rem, min(10vw, 9svh), 5rem);
  letter-spacing: 0.08em;
  text-shadow: 0 3px 16px rgb(0 0 0 / 0.55);
}
.club-banner-copy {
  text-shadow: 0 2px 8px rgb(0 0 0 / 0.65);
}
.club-scroll-line {
  width: 1px;
  height: 24px;
  background: linear-gradient(transparent, #e0f2fe);
  transition: transform 250ms ease;
}
.club-scroll-cue:hover .club-scroll-line {
  transform: translateY(5px);
}
@media (max-width: 1023px) {
  .club-banner {
    align-items: flex-end;
  }
  .club-banner-shade {
    background: linear-gradient(
      180deg,
      rgb(2 6 23 / 0.12) 10%,
      rgb(2 6 23 / 0.18) 35%,
      rgb(2 6 23 / 0.76) 66%,
      rgb(2 6 23 / 0.94) 100%
    );
  }
  .club-banner-content {
    display: block;
    width: min(100% - 3.5rem, 36rem);
    padding-top: 2.5rem;
    padding-bottom: max(
      clamp(3rem, 7svh, 5rem),
      calc(env(safe-area-inset-bottom) + 2rem)
    );
    text-align: left;
  }
  .club-banner-intro {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    text-align: left;
  }
  .club-banner-title {
    order: 1;
    margin-top: 0.75rem;
    font-size: clamp(2.25rem, 11vw, 2.85rem);
    line-height: 1.25;
    letter-spacing: 0.06em;
    text-wrap: balance;
  }
  .club-banner-subtitle {
    order: 0;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-top: 0;
    font-size: 0.625rem;
    line-height: 1.8;
    letter-spacing: 0.16em;
    overflow-wrap: anywhere;
  }
  .club-banner-subtitle::before {
    content: '';
    width: 1.5rem;
    height: 1px;
    flex-shrink: 0;
    background: #bae6fd;
  }
  .club-banner-toy {
    display: none;
  }
  .club-banner-copy {
    order: 2;
    margin-top: 1.25rem;
    font-size: 0.875rem;
    line-height: 1.95;
    color: rgb(255 255 255 / 0.9);
    text-shadow: none;
  }
  .club-banner-note {
    order: 3;
    margin-top: 1.5rem;
    font-size: 0.6875rem;
    line-height: 1.8;
    color: #cbd5e1;
  }
}
@media (max-width: 359px) {
  .club-banner-content {
    width: calc(100% - 2.5rem);
  }
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
</style>
