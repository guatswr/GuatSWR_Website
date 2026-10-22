<script setup lang="ts">
import ClubIcon from '~/components/ClubIcon.vue'

defineProps<{
  title: string
  seal: string
  subtitle: string
  subtitleKey?: string
  linkTo: string
  linkSeal: string
  linkLabel: string
}>()
</script>

<template>
  <header class="events-heading">
    <div class="events-heading-main">
      <div class="events-heading-title-row">
        <span class="events-heading-seal" aria-hidden="true">{{ seal }}</span>
        <h1>{{ title }}</h1>
      </div>
      <Transition name="events-fade" mode="out-in">
        <p :key="subtitleKey" class="events-heading-subtitle">{{ subtitle }}</p>
      </Transition>
    </div>
    <NuxtLink :to="linkTo" class="events-archive-link">
      <span class="events-archive-seal" aria-hidden="true">{{ linkSeal }}</span>
      <span>{{ linkLabel }}</span>
      <ClubIcon name="external" />
    </NuxtLink>
  </header>
</template>

<style scoped>
.events-heading {
  --event-ink: #0f172a;
  --event-body: #334155;
  --event-muted: #64748b;
  --event-line: rgb(203 213 225 / 0.85);
  --event-surface: rgb(255 255 255 / 0.9);
  --event-seal: #a34e47;
  --event-seal-bg: rgb(163 78 71 / 0.08);
  --event-seal-border: rgb(163 78 71 / 0.38);
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: flex-end;
  gap: 1.25rem;
  padding-bottom: 1.15rem;
  border-bottom: 1px solid var(--event-line);
  color: var(--event-ink);
  font-size: 14px;
  line-height: 1.5;
}

.events-heading-main {
  min-width: 0;
}

.events-heading-title-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.7rem;
}

.events-heading-seal {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.2rem 0.32rem;
  border: 1px solid var(--event-seal-border);
  background: var(--event-seal-bg);
  color: var(--event-seal);
  font-family: var(--club-serif);
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  line-height: 1.05;
  writing-mode: vertical-rl;
}

.events-heading h1 {
  margin: 0;
  color: var(--event-ink);
  font-family: var(--club-serif);
  font-size: clamp(1.65rem, 2.8vw, 2.15rem);
  font-weight: 700;
  letter-spacing: 0.03em;
  line-height: 1.25;
}

.events-heading-subtitle {
  margin: 0.5rem 0 0;
  color: var(--event-muted);
  font-size: 0.84rem;
  line-height: 1.65;
}

.events-archive-link {
  display: inline-flex;
  align-items: center;
  min-height: 2.5rem;
  gap: 0.5rem;
  padding: 0.4rem 0.85rem;
  border: 1px solid var(--event-line);
  border-top: 2px solid var(--event-seal);
  background: var(--event-surface);
  color: var(--event-body);
  font-size: 0.8125rem;
  font-weight: 600;
  transition:
    border-color 180ms ease,
    background-color 180ms ease,
    color 180ms ease,
    transform 180ms ease;
}

.events-archive-seal {
  padding: 0.08rem 0.32rem;
  border: 1px solid var(--event-seal-border);
  background: var(--event-seal-bg);
  color: var(--event-seal);
  font-family: var(--club-serif);
  font-size: 0.65rem;
  font-weight: 700;
}

.events-archive-link svg {
  width: 0.9rem;
  height: 0.9rem;
  opacity: 0.75;
}

.events-archive-link:hover {
  border-color: var(--event-seal);
  color: var(--event-ink);
  transform: translateY(-1px);
}

.dark .events-heading {
  --event-ink: #f1f5f9;
  --event-body: #cbd5e1;
  --event-muted: #94a3b8;
  --event-line: rgb(51 65 85 / 0.88);
  --event-surface: rgb(20 31 44 / 0.9);
  --event-seal: #fda4af;
  --event-seal-bg: rgb(244 63 94 / 0.12);
  --event-seal-border: rgb(251 113 133 / 0.42);
}

.events-archive-link:focus-visible {
  outline: 2px solid var(--event-seal);
  outline-offset: 3px;
}

/* 1. 卷首与标题展开 */
@keyframes events-seal-press {
  0% {
    opacity: 0;
    transform: scale(1.36) rotate(-5deg);
  }
  65% {
    transform: scale(0.96) rotate(1deg);
  }
  100% {
    opacity: 1;
    transform: scale(1) rotate(0deg);
  }
}

@keyframes events-title-unfurl {
  0% {
    opacity: 0;
    transform: translateY(12px);
  }
  100% {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes events-archive-slide {
  0% {
    opacity: 0;
    transform: translateX(12px);
  }
  100% {
    opacity: 1;
    transform: translateX(0);
  }
}

.events-heading-seal {
  animation: events-seal-press 540ms cubic-bezier(0.22, 1, 0.36, 1) 60ms backwards;
}

.events-heading h1 {
  animation: events-title-unfurl 500ms cubic-bezier(0.22, 1, 0.36, 1) 90ms backwards;
}

.events-archive-link {
  animation: events-archive-slide 480ms cubic-bezier(0.22, 1, 0.36, 1) 140ms backwards;
}

/* 分类说明文字平滑过渡 */
.events-fade-enter-active,
.events-fade-leave-active {
  transition: opacity 220ms ease, transform 220ms ease;
}

.events-fade-enter-from {
  opacity: 0;
  transform: translateY(5px);
}

.events-fade-leave-to {
  opacity: 0;
  transform: translateY(-5px);
}

@media (max-width: 700px) {
  .events-heading {
    grid-template-columns: minmax(0, 1fr);
    align-items: flex-start;
  }

  .events-heading-subtitle {
    min-height: 2lh;
  }

  .events-archive-link {
    justify-self: start;
  }
}

@media (prefers-reduced-motion: reduce) {
  .events-heading * {
    animation: none !important;
    transition: none !important;
  }
}
</style>
