<script setup lang="ts">
import type { PropType } from 'vue'
import ClubIcon from '~/components/ClubIcon.vue'
import InterestIcon from './InterestIcon.vue'
import MistyLakeBackdrop from './MistyLakeBackdrop.vue'
import { vScrollReveal } from '~/utils/scroll-motion'
import type { HomeInterest } from '~/utils/home-content'

defineProps({
  items: {
    type: Array as PropType<readonly HomeInterest[]>,
    default: () => []
  }
})
</script>

<template>
  <section
    id="interests"
    class="club-home-section home-interests"
    aria-labelledby="interests-title"
  >
    <MistyLakeBackdrop />

    <div class="club-container interests-content">
      <header v-scroll-reveal class="interests-intro">
        <p class="club-eyebrow">SOMETHING WE LOVE</p>
        <h2 id="interests-title" class="club-display interests-title">总有一种热爱，与你同频</h2>
        <p class="interests-description">擅长什么并不重要。愿意分享喜欢的事，就是成为同好的开始</p>
      </header>

      <ul class="interests-grid">
        <li v-for="(interest, index) in items" :key="interest.number" v-scroll-reveal="index * 70">
          <NuxtLink
            :to="interest.path"
            class="interest-link"
            :data-tone="interest.color"
          >
            <div class="interest-heading">
              <InterestIcon :name="interest.icon" class="interest-art" />
              <div class="interest-label">
                <h3>{{ interest.title }}</h3>
                <p>{{ interest.subtitle }}</p>
              </div>
            </div>
            <p class="interest-body">{{ interest.description }}</p>
            <span class="interest-cta">{{ interest.cta }} <ClubIcon name="arrow" class="h-4 w-4" /></span>
          </NuxtLink>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.home-interests {
  --section-background: var(--home-interests-background, #f4f5f2);
  --section-edge-bottom: var(--home-interests-about-seam, #f5f4ef);
  --interests-ink: #263e49;
  --interests-muted: #536a76;
  --interests-rule: #bed2da;
  position: relative;
  isolation: isolate;
  overflow: hidden;
  padding-block: clamp(4rem, 6.5vw, 6.5rem) clamp(3rem, 5vw, 5rem);
}
.interests-content {
  position: relative;
  z-index: 1;
}
.interests-intro {
  max-width: 47rem;
}
.interests-title {
  margin-top: 1rem;
  color: var(--interests-ink);
  font-size: clamp(1.75rem, 3vw, 2.625rem);
  font-weight: 600;
  line-height: 1.5;
  letter-spacing: -0.025em;
  text-wrap: balance;
}
.interests-description {
  margin-top: 1rem;
  color: var(--interests-muted);
  font-size: 0.875rem;
  line-height: 1.9;
}
.interests-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 0.5rem 2rem;
  margin-top: 2.5rem;
  padding: 0;
  list-style: none;
}
.interests-grid > li {
  display: flex;
  min-width: 0;
}
.interest-link {
  --interest-accent: #287da1;
  --interest-icon-size: 3.5rem;
  --interest-icon-gap: 0.875rem;
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  padding-block: 1.5rem 0.75rem;
  border-top: 1px solid var(--interests-rule);
  color: var(--interests-ink);
  transition: border-color 250ms ease;
}
.interest-link[data-tone='violet'] { --interest-accent: #73609e; }
.interest-link[data-tone='rose'] { --interest-accent: #a4576b; }
.interest-link[data-tone='amber'] { --interest-accent: #997135; }
.interest-heading {
  display: grid;
  grid-template-columns: var(--interest-icon-size) minmax(0, 1fr);
  align-items: center;
  gap: var(--interest-icon-gap);
  min-height: 3.75rem;
}
.interest-art {
  display: block;
  width: var(--interest-icon-size);
  height: var(--interest-icon-size);
  color: var(--interests-ink);
}
.interest-label h3 {
  font-size: 1.25rem;
  font-weight: 600;
  line-height: 1.5;
  transition: color 200ms ease;
}
.interest-label p {
  margin-top: 0.375rem;
  color: var(--interests-muted);
  font-size: 0.75rem;
  line-height: 1.8;
}
.interest-body,
.interest-cta {
  margin-left: calc(var(--interest-icon-size) + var(--interest-icon-gap));
}
.interest-body {
  margin-top: 1rem;
  color: var(--interests-muted);
  font-size: 0.875rem;
  line-height: 1.95;
  text-wrap: pretty;
}
.interest-cta {
  display: inline-flex;
  align-items: center;
  gap: 0.75rem;
  min-height: 2.75rem;
  margin-top: auto;
  padding-top: 1rem;
  color: var(--interest-accent);
  font-size: 0.75rem;
  font-weight: 600;
}
.interest-cta svg {
  transition: transform 250ms ease;
}
.interest-link:is(:hover, :focus-visible) {
  border-color: var(--interest-accent);
}
.interest-link:is(:hover, :focus-visible) h3 {
  color: var(--interest-accent);
}
html.dark .home-interests {
  --section-background: var(--home-interests-background, #19232c);
  --section-edge-bottom: var(--home-interests-about-seam, #1a242c);
  --interests-ink: #e1ebef;
  --interests-muted: #a7bdc8;
  --interests-rule: #3a5666;
}
html.dark .interest-link { --interest-accent: #86c9e2; }
html.dark .interest-link[data-tone='violet'] { --interest-accent: #c0afe2; }
html.dark .interest-link[data-tone='rose'] { --interest-accent: #e0a0b2; }
html.dark .interest-link[data-tone='amber'] { --interest-accent: #dfc18b; }
@media (max-width: 639px) {
  .home-interests {
    padding-block: 3.25rem 2.75rem;
  }
  .interests-title {
    margin-top: 0.75rem;
    font-size: clamp(1.5rem, 6.2vw, 1.875rem);
    line-height: 1.4;
  }
  .interests-description {
    margin-top: 0.75rem;
    line-height: 1.8;
  }
  .interests-grid {
    gap: 0.25rem;
    margin-top: 1.75rem;
  }
  .interest-link {
    --interest-icon-size: 2.875rem;
    --interest-icon-gap: 0.75rem;
    padding-block: 1.125rem 0.625rem;
  }
  .interest-heading {
    min-height: 3.125rem;
  }
  .interest-label h3 {
    font-size: 1.125rem;
    line-height: 1.4;
  }
  .interest-label p {
    margin-top: 0.25rem;
    line-height: 1.65;
  }
  .interest-body {
    margin-top: 0.625rem;
    line-height: 1.8;
  }
  .interest-cta {
    min-height: 2.5rem;
    padding-top: 0.625rem;
  }
}
@media (min-width: 640px) {
  .interests-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-auto-rows: 1fr;
    gap: 1.5rem 2rem;
    margin-top: 3rem;
  }
}
@media (min-width: 1100px) {
  .interests-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}
@media (hover: hover) and (prefers-reduced-motion: no-preference) {
  .interest-link:hover .interest-cta svg { transform: translateX(3px); }
}
@media (prefers-reduced-motion: no-preference) {
  .interest-link:focus-visible .interest-cta svg { transform: translateX(3px); }
}
</style>
