<script setup lang="ts">
import ClubIcon from '~/components/ClubIcon.vue'
import ProgressiveImage from '~/components/ProgressiveImage.vue'
import HomeSectionBackdrop from './HomeSectionBackdrop.vue'
import { getThumbUrl } from '~/utils/image-url'
import { vScrollReveal } from '~/utils/scroll-motion'

defineProps({ mascot: { type: String, default: '' } })
</script>

<template>
  <section
    id="about"
    class="club-home-section club-home-about home-about"
    aria-labelledby="about-title"
  >
    <HomeSectionBackdrop variant="about" />
    <div class="club-container home-about-layout">
      <div class="home-about-copy">
        <h2 id="about-title" v-scroll-reveal class="club-display home-about-title">
          因东方相识，<br >让同好成为朋友。
        </h2>
        <p v-scroll-reveal="60" class="home-about-intro">
          这里是桂航绯想天，<br >一群在校园里分享幻想乡的人。
        </p>
        <div v-scroll-reveal="120" class="home-about-body">
          <p>
            这里是桂林航天工业学院的东方Project同好会。Stg、非想天则、音乐、同人创作——每一种热爱，都能在这里找到回应。
          </p>
          <p>
            也欢迎校外的朋友。聊一首喜欢的曲子，约一场对战，或在线下见个面。从一句“你也喜欢东方？”开始，认识彼此。
          </p>
        </div>
        <div v-scroll-reveal="180" class="home-about-links">
          <NuxtLink to="/history" class="club-text-link home-about-link">
            读读我们的群史 <ClubIcon name="arrow" class="h-4 w-4" />
          </NuxtLink>
          <NuxtLink to="/members" class="club-text-link home-about-link">
            认识同好 <ClubIcon name="arrow" class="h-4 w-4" />
          </NuxtLink>
        </div>
        <p v-scroll-reveal="220" class="home-about-note">桂航绯想天 <span aria-hidden="true">／</span> Welcome to GuatSWR</p>
      </div>

      <figure v-scroll-reveal="{ variant: 'image', delay: 100 }" class="home-about-figure">
        <div class="home-about-art">
          <ProgressiveImage
            v-if="mascot"
            rise
            fit="contain"
            :src="getThumbUrl(mascot)"
            :fallback-src="mascot"
            alt="桂航绯想天社团看板娘"
            wrapper-class="home-about-image"
            img-class="h-full w-full"
          />
          <div v-else class="home-about-placeholder" aria-label="社团看板娘插画待更新" role="img">
            <ClubIcon name="snow" class="h-20 w-20" />
          </div>
        </div>
        <figcaption class="home-about-caption">
          <span>幻想乡的一角</span>
          <span>社团看板娘</span>
        </figcaption>
      </figure>
    </div>
  </section>
</template>

<style scoped>
.home-about {
  --about-ink: #243440;
  --about-muted: #536472;
  --about-rule: #c7d1d0;
  position: relative;
  isolation: isolate;
  overflow: hidden;
  padding-block: clamp(3rem, 5vw, 5rem) clamp(4rem, 7.5vw, 7.5rem);
}
.home-about-layout {
  position: relative;
  z-index: 1;
  display: grid;
  align-items: center;
  gap: 3rem;
}
.home-about-copy {
  min-width: 0;
}
.home-about-title {
  margin-top: 1.25rem;
  color: var(--about-ink);
  font-size: clamp(1.9rem, 3.6vw, 3.25rem);
  font-weight: 600;
  line-height: 1.45;
  letter-spacing: -0.035em;
}
.home-about-intro {
  margin-top: 1.75rem;
  color: var(--about-ink);
  font-size: clamp(1rem, 1.4vw, 1.125rem);
  font-weight: 500;
  line-height: 1.9;
}
.home-about-body {
  max-width: 33rem;
  margin-top: 1rem;
  color: var(--about-muted);
  font-size: 0.875rem;
  line-height: 2;
}
.home-about-body p + p {
  margin-top: 0.75rem;
}
.home-about-links {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem 2rem;
  margin-top: 1.5rem;
}
.home-about-link {
  justify-content: space-between;
  gap: 1.5rem;
  padding-bottom: 0.25rem;
  border-bottom: 1px solid var(--about-rule);
}
.home-about-link svg {
  transition: transform 250ms ease;
}
.home-about-link:hover svg {
  transform: translateX(3px);
}
.home-about-note {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 2rem;
  color: var(--about-muted);
  font-size: 0.6875rem;
  line-height: 1.8;
  letter-spacing: 0.04em;
}
.home-about-figure {
  width: min(100%, 23rem);
  margin-inline: auto;
}
.home-about-art {
  position: relative;
  padding: 0.625rem;
  border: 1px solid var(--about-rule);
}
.home-about-art::before {
  position: absolute;
  top: -0.5rem;
  right: 1.25rem;
  z-index: 1;
  width: 2rem;
  height: 1rem;
  background: var(--section-background);
  content: '';
}
.home-about-art::after {
  position: absolute;
  top: -0.5rem;
  right: 2rem;
  z-index: 1;
  width: 0.5rem;
  height: 1rem;
  border-block: 1px solid #a8524c;
  border-inline: 1px solid #a8524c;
  content: '';
}
.home-about-art :deep(.home-about-image),
.home-about-placeholder {
  aspect-ratio: 453 / 640;
  background: #dde5e7;
}
.home-about-placeholder {
  display: grid;
  place-items: center;
  color: #7196ad;
}
.home-about-caption {
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.875rem;
  color: var(--about-muted);
  font-size: 0.6875rem;
  line-height: 1.8;
  letter-spacing: 0.08em;
}
html.dark .home-about {
  --about-ink: #e2e9eb;
  --about-muted: #a7b5bf;
  --about-rule: #42535c;
}
html.dark .home-about-art :deep(.home-about-image) {
  background: #172731;
}
@media (min-width: 768px) {
  .home-about-layout {
    grid-template-columns: minmax(0, 1.2fr) minmax(0, 0.8fr);
    gap: clamp(3rem, 7vw, 7rem);
  }
  .home-about-figure {
    justify-self: end;
    margin-inline: 0;
  }
}
@media (max-width: 767px) {
  .home-about-figure {
    width: min(88%, 21rem);
  }
}
@media (prefers-reduced-motion: reduce) {
  .home-about-link:hover svg {
    transform: none;
  }
}
</style>
