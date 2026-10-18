<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import ClubAvatar from '../ClubAvatar.vue'
import CirnoFreeze from './CirnoFreeze.vue'

defineProps({ src: { type: String, default: '' } })

const burst = ref(0)
const isPopping = ref(false)
const isSuper = ref(false)
const isFrozen = ref(false)
const isSpeaking = ref(false)

const kickScale = ref(1)
const sparkOffset = ref('0deg')
let popTimer = null
let superTimer = null
let keyTimer = null
let speechTimer

let popFrame
let keyBuffer = ''

const nines = [
  {
    x: '-18%',
    y: '-10%',
    turn: '-18deg',
    dx: -1,
    dy: -1,
    delay: '0ms',
    idleDelay: '0ms',
    color: '#e0f2fe'
  },
  {
    x: '93%',
    y: '15%',
    turn: '16deg',
    dx: 1,
    dy: -1,
    delay: '60ms',
    idleDelay: '420ms',
    color: '#a5ddff'
  },
  {
    x: '-19%',
    y: '72%',
    turn: '-12deg',
    dx: -1,
    dy: -0.6,
    delay: '110ms',
    idleDelay: '180ms',
    color: '#c7d2fe'
  },
  {
    x: '79%',
    y: '92%',
    turn: '20deg',
    dx: 1,
    dy: -0.8,
    delay: '30ms',
    idleDelay: '620ms',
    color: '#bae6fd'
  }
]

const sparks = [
  { angle: '-150deg', turn: '-120deg', delay: '40ms' },
  { angle: '-105deg', turn: '90deg', delay: '90ms' },
  { angle: '-60deg', turn: '-80deg', delay: '20ms' },
  { angle: '35deg', turn: '120deg', delay: '70ms' },
  { angle: '80deg', turn: '-90deg', delay: '30ms' },
  { angle: '130deg', turn: '100deg', delay: '110ms' }
]

const superFlakes = [
  { angle: '-170deg', turn: '-90deg', delay: '0ms' },
  { angle: '-130deg', turn: '110deg', delay: '55ms' },
  { angle: '-90deg', turn: '-120deg', delay: '25ms' },
  { angle: '-50deg', turn: '80deg', delay: '85ms' },
  { angle: '-10deg', turn: '-100deg', delay: '40ms' },
  { angle: '30deg', turn: '120deg', delay: '95ms' },
  { angle: '70deg', turn: '-80deg', delay: '20ms' },
  { angle: '110deg', turn: '100deg', delay: '70ms' },
  { angle: '150deg', turn: '-110deg', delay: '35ms' }
]

const cry = computed(() =>
  isFrozen.value
    ? '冻符「Perfect Freeze」'
    : isSuper.value
      ? 'BAKA!!!'
      : 'BAKA！'
)
const dialogueGuide = computed(() => {
  if (isFrozen.value) return 'BAKA！见识下咱的冰冻之力吧！'
  const remaining = 9 - (burst.value % 9)
  if (remaining === 1) return '就差一下！'
  if (remaining <= 4) return `再戳 ${remaining} 下，咱带你去找大酱玩！`
  return `戳满⑨下有惊喜哦，还差${remaining}下！`
})

function play(forceSuper = false) {
  if (isFrozen.value) return
  burst.value += 1
  isSpeaking.value = true
  window.clearTimeout(speechTimer)
  speechTimer = window.setTimeout(() => {
    isSpeaking.value = false
  }, 3600)
  const nextSuper = forceSuper || burst.value % 9 === 0
  isSuper.value = nextSuper
  isPopping.value = false
  kickScale.value = 0.85 + Math.random() * 0.35
  sparkOffset.value = `${Math.floor(Math.random() * 51) - 25}deg`
  if (nextSuper) isFrozen.value = true

  window.clearTimeout(superTimer)
  if (nextSuper) {
    superTimer = window.setTimeout(() => {
      isSuper.value = false
    }, 1800)
  }

  window.cancelAnimationFrame(popFrame)
  popFrame = window.requestAnimationFrame(() => {
    isPopping.value = true
    window.clearTimeout(popTimer)
    popTimer = window.setTimeout(() => {
      isPopping.value = false
    }, 720)
  })
}

function finishFreeze() {
  isFrozen.value = false
  isSpeaking.value = false
  window.clearTimeout(speechTimer)
}

const isTypingTarget = (target) =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))

function handleKeydown(event) {
  if (
    event.defaultPrevented ||
    event.repeat ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey
  )
    return
  if (isTypingTarget(event.target)) return
  const key = event.key.toLowerCase()

  if (key === '9') {
    play()
    return
  }

  if (key.length !== 1 || !/[a-z]/.test(key)) return
  keyBuffer = (keyBuffer + key).slice(-4)
  window.clearTimeout(keyTimer)
  keyTimer = window.setTimeout(() => {
    keyBuffer = ''
  }, 1600)

  if (keyBuffer === 'baka') {
    keyBuffer = ''
    play(true)
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
  window.clearTimeout(popTimer)
  window.clearTimeout(superTimer)
  window.clearTimeout(keyTimer)
  window.clearTimeout(speechTimer)

  window.cancelAnimationFrame(popFrame)
})
</script>

<template>
  <div class="club-avatar-toy">
    <button
      type="button"
      class="club-toy-trigger"
      :class="{ 'is-popping': isPopping, 'is-super': isSuper }"
      :style="{ '--kick-scale': kickScale, '--spark-offset': sparkOffset }"
      :title="isFrozen ? '向下滑动击碎冰墙' : '戳满 ⑨ 下，发现隐藏冰符'"
      aria-label="点击群头像，让小⑨喊 BAKA"
      @click="play()"
    >
      <span class="club-toy-halo" aria-hidden="true" />
      <ClubAvatar :src="src" prefer-original class="club-toy-avatar" />
      <span v-if="!burst" class="club-nine-hint" aria-hidden="true"
        >戳一下</span
      >
      <span
        :key="burst"
        class="club-nine-scene"
        :class="{ 'is-playing': burst > 0, 'is-super': isSuper }"
        aria-hidden="true"
      >
        <span
          v-if="isSpeaking"
          class="club-nine-cry"
          :class="{ 'is-super': isSuper || isFrozen }"
        >
          <span class="club-nine-cry-title">{{ cry }}</span>
          <span class="club-nine-cry-guide">{{ dialogueGuide }}</span>
        </span>
        <span
          v-for="(nine, index) in nines"
          :key="index"
          class="club-nine-satellite"
          :style="{
            left: nine.x,
            top: nine.y,
            '--nine-turn': nine.turn,
            '--nine-color': nine.color,
            '--kick-x': nine.dx,
            '--kick-y': nine.dy,
            '--nine-delay': nine.delay,
            '--nine-idle-delay': nine.idleDelay
          }"
        >
          <span class="club-nine-glyph">⑨</span>
        </span>
        <span
          v-for="(spark, index) in sparks"
          :key="'spark-' + index"
          class="club-nine-spark"
          :class="'spark-' + index"
          :style="{
            '--spark-angle': spark.angle,
            '--spark-turn': spark.turn,
            '--spark-delay': spark.delay
          }"
          >⑨</span
        >
        <template v-if="isSuper">
          <span
            v-for="(flake, index) in superFlakes"
            :key="'flake-' + index"
            class="club-nine-spark club-nine-flake"
            :class="'super-spark-' + index"
            :style="{
              '--spark-angle': flake.angle,
              '--spark-turn': flake.turn,
              '--spark-delay': flake.delay
            }"
            >❄</span
          >
        </template>
        <span v-if="burst" class="club-nine-ripple" />
        <span v-if="burst" class="club-nine-ripple club-nine-ripple--late" />
        <span v-if="isSuper" class="club-nine-ripple club-nine-ripple--super" />
      </span>
      <span v-if="isSuper" class="club-nine-ribbon" aria-hidden="true"
        >见识下咱的厉害吧！</span
      >
    </button>
    <span
      v-if="isSpeaking"
      class="sr-only"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      >{{ dialogueGuide }}</span
    >
    <CirnoFreeze v-if="isFrozen" @complete="finishFreeze" />
  </div>
</template>

<style scoped>
.club-avatar-toy {
  --avatar-size: clamp(4.5rem, 12svh, 7rem);
  --nine-size: clamp(1.6rem, 4svh, 2.25rem);
  --jump-distance: clamp(1rem, 3vw, 2.5rem);
  padding: 2rem;
}
.club-toy-trigger {
  position: relative;
  display: block;
  width: var(--avatar-size);
  height: var(--avatar-size);
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.club-toy-halo {
  position: absolute;
  inset: -12px;
  z-index: 0;
  border: 1px solid rgb(186 230 253 / 0.35);
  border-radius: 50%;
  box-shadow: inset 0 0 22px rgb(125 211 252 / 0.16);
  pointer-events: none;
  animation: nine-halo 3.8s ease-out infinite;
}
.club-toy-avatar {
  position: relative;
  z-index: 1;
  width: 100%;
  height: 100%;
  border: 4px solid rgb(255 255 255 / 0.9);
  box-shadow: 0 12px 36px rgb(2 6 23 / 0.22);
  transition:
    transform 250ms ease,
    filter 350ms ease;
}
.club-toy-trigger.is-super .club-toy-avatar {
  filter: drop-shadow(0 0 20px rgb(125 211 252 / 0.9));
}
.club-toy-trigger:focus-visible {
  outline: 2px solid #bae6fd;
  outline-offset: 12px;
}
.club-toy-trigger:active .club-toy-avatar {
  transform: scale(0.95) rotate(-2deg);
}
.club-toy-trigger.is-popping .club-toy-avatar {
  animation: toy-pop 700ms cubic-bezier(0.2, 0.8, 0.2, 1);
}
.club-nine-hint {
  position: absolute;
  top: -0.5rem;
  right: 0.1rem;
  z-index: 4;
  padding: 0.38rem 0.62rem;
  color: #e0f2fe;
  background: rgb(8 47 73 / 0.72);
  border: 1px solid rgb(186 230 253 / 0.55);
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 500;
  letter-spacing: 0.08em;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transform: translateY(4px);
  transition:
    opacity 180ms ease,
    transform 180ms ease;
  backdrop-filter: blur(6px);
}
.club-nine-hint::after {
  content: '';
  position: absolute;
  bottom: -4px;
  left: 50%;
  width: 6px;
  height: 6px;
  background: inherit;
  border-right: 1px solid rgb(186 230 253 / 0.4);
  border-bottom: 1px solid rgb(186 230 253 / 0.4);
  transform: translateX(-50%) rotate(45deg);
}
.club-toy-trigger:hover .club-nine-hint,
.club-toy-trigger:focus-visible .club-nine-hint {
  opacity: 1;
  transform: translateY(0);
}
.club-nine-scene {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.club-nine-satellite {
  position: absolute;
  z-index: 2;
  width: var(--nine-size);
  height: var(--nine-size);
  animation: nine-bob 4.6s ease-in-out infinite;
  animation-delay: var(--nine-idle-delay, 0ms);
}
.club-nine-glyph {
  display: block;
  color: var(--nine-color, #e0f2fe);
  font-family: 'Segoe UI Symbol', 'Noto Sans Symbols 2', sans-serif;
  font-size: var(--nine-size);
  line-height: 1;
  font-weight: 700;
  text-shadow:
    0 2px 5px #075985,
    0 0 14px rgb(125 211 252 / 0.6);
  transform: rotate(var(--nine-turn));
  transition: transform 200ms ease;
  user-select: none;
}
.is-playing .club-nine-glyph {
  animation: nine-hop 1100ms var(--nine-delay) cubic-bezier(0.2, 0.7, 0.25, 1)
    both;
}
.club-nine-cry {
  position: absolute;
  bottom: calc(100% + 1.5rem);
  left: 50%;
  z-index: 5;
  width: max-content;
  max-width: min(18rem, calc(100vw - 3rem));
  padding: 0.42rem 0.85rem;
  color: #082f49;
  background: #f0f9ff;
  border: 2px solid #0c4a6e;
  border-radius: 0.4rem;
  box-shadow: 4px 4px 0 rgb(8 47 73 / 0.22);
  font-family: 'Arial Black', 'Segoe UI Black', 'Trebuchet MS', sans-serif;
  font-size: 0.9rem;
  font-weight: 900;
  letter-spacing: 0.08em;
  line-height: 1.2;
  text-align: center;
  white-space: normal;
  transform-origin: bottom center;
  animation: nine-cry 3400ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
}
.club-nine-cry-title {
  display: block;
}
.club-nine-cry-guide {
  display: block;
  margin-top: 0.4rem;
  font-family: system-ui, sans-serif;
  font-size: 0.72rem;
  font-weight: 500;
  line-height: 1.7;
  letter-spacing: 0.02em;
}
.club-nine-cry::after {
  content: '';
  position: absolute;
  bottom: -5px;
  left: 50%;
  width: 8px;
  height: 8px;
  background: inherit;
  border-right: 2px solid #0c4a6e;
  border-bottom: 2px solid #0c4a6e;
  transform: translateX(-50%) rotate(45deg);
}
.club-nine-cry.is-super {
  color: #f0f9ff;
  background: #0369a1;
  border-color: #7dd3fc;
  box-shadow:
    0 0 0 3px rgb(125 211 252 / 0.28),
    5px 5px 0 rgb(2 6 23 / 0.25);
  font-size: 1rem;
}
.club-nine-cry.is-super::after {
  border-color: #7dd3fc;
}
.club-nine-spark {
  position: absolute;
  top: 50%;
  left: 50%;
  z-index: 0;
  color: #bae6fd;
  font-family: 'Segoe UI Symbol', 'Noto Sans Symbols 2', sans-serif;
  font-size: calc(var(--nine-size) * 0.5);
  font-weight: 700;
  line-height: 1;
  text-shadow:
    0 1px 4px #075985,
    0 0 12px rgb(125 211 252 / 0.7);
  opacity: 0;
  pointer-events: none;
  user-select: none;
  transform: translate(-50%, -50%)
    rotate(calc(var(--spark-angle) + var(--spark-offset, 0deg)))
    translateY(-0.5rem) scale(0.4);
}
.is-playing .club-nine-spark {
  animation: nine-spark 920ms var(--spark-delay)
    cubic-bezier(0.17, 0.84, 0.34, 1) both;
}
.club-nine-flake {
  color: #e0f2fe;
  font-size: calc(var(--nine-size) * 0.38);
  text-shadow:
    0 0 8px #bae6fd,
    0 0 18px rgb(125 211 252 / 0.9);
}
.is-playing .club-nine-flake {
  animation-duration: 1500ms;
}
.spark-0 {
  --spark-distance: 9rem;
}
.spark-1 {
  --spark-distance: 7.5rem;
}
.spark-2 {
  --spark-distance: 10rem;
}
.spark-3 {
  --spark-distance: 8.5rem;
}
.spark-4 {
  --spark-distance: 7rem;
}
.spark-5 {
  --spark-distance: 9.5rem;
}
.super-spark-0 {
  --spark-distance: 11rem;
}
.super-spark-1 {
  --spark-distance: 9rem;
}
.super-spark-2 {
  --spark-distance: 12rem;
}
.super-spark-3 {
  --spark-distance: 8.5rem;
}
.super-spark-4 {
  --spark-distance: 10.5rem;
}
.super-spark-5 {
  --spark-distance: 9.5rem;
}
.super-spark-6 {
  --spark-distance: 11.5rem;
}
.super-spark-7 {
  --spark-distance: 8rem;
}
.super-spark-8 {
  --spark-distance: 10rem;
}
.club-nine-ripple {
  position: absolute;
  inset: -4px;
  border: 2px solid #bae6fd;
  border-radius: 50%;
  animation: nine-ripple 900ms ease-out both;
}
.club-nine-ripple--late {
  border-color: rgb(224 242 254 / 0.55);
  animation-delay: 120ms;
}
.club-nine-ripple--super {
  inset: -9px;
  border-width: 1px;
  border-color: rgb(224 242 254 / 0.9);
  animation: nine-super-ripple 1500ms ease-out both;
}
.club-nine-ribbon {
  position: absolute;
  bottom: -1.6rem;
  left: 50%;
  z-index: 6;
  padding: 0.25rem 0.55rem;
  color: #f0f9ff;
  background: #0369a1;
  border: 1px solid #7dd3fc;
  border-radius: 999px;
  box-shadow: 0 6px 18px rgb(2 6 23 / 0.25);
  font-family: ui-monospace, monospace;
  font-size: 0.55rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  white-space: nowrap;
  transform: translateX(-50%);
  animation: nine-ribbon 1800ms ease both;
}
@keyframes nine-bob {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-6px);
  }
}
@keyframes nine-halo {
  0% {
    opacity: 0.55;
    transform: scale(0.96);
    box-shadow: inset 0 0 22px rgb(125 211 252 / 0.16);
  }
  70% {
    opacity: 0.18;
  }
  100% {
    opacity: 0;
    transform: scale(1.18);
    box-shadow: 0 0 0 14px rgb(125 211 252 / 0);
  }
}
@keyframes nine-hop {
  0%,
  100% {
    transform: translate(0, 0) rotate(var(--nine-turn)) scale(1);
  }
  10% {
    transform: translate(0, 0.35rem) rotate(var(--nine-turn)) scale(0.82, 1.15);
  }
  32% {
    transform: translate(
        calc(var(--kick-x) * var(--jump-distance) * var(--kick-scale, 1)),
        calc(var(--kick-y) * var(--jump-distance) * var(--kick-scale, 1) - 1rem)
      )
      rotate(calc(var(--nine-turn) + 35deg)) scale(1.22);
  }
  62% {
    transform: translate(
        calc(var(--kick-x) * var(--jump-distance) * 0.4),
        0.4rem
      )
      rotate(calc(var(--nine-turn) - 15deg)) scale(0.92);
  }
  82% {
    transform: translate(0, -0.4rem) rotate(calc(var(--nine-turn) + 6deg))
      scale(1.04);
  }
}
@keyframes nine-spark {
  0% {
    opacity: 0;
    transform: translate(-50%, -50%)
      rotate(calc(var(--spark-angle) + var(--spark-offset, 0deg)))
      translateY(-0.5rem) scale(0.4) rotate(0deg);
  }
  18% {
    opacity: 1;
  }
  70% {
    opacity: 0.85;
  }
  100% {
    opacity: 0;
    transform: translate(-50%, -50%)
      rotate(calc(var(--spark-angle) + var(--spark-offset, 0deg)))
      translateY(calc(0rem - var(--spark-distance))) scale(1.05)
      rotate(var(--spark-turn));
  }
}
@keyframes nine-cry {
  0% {
    opacity: 0;
    transform: translate(-50%, 8px) scale(0.7) rotate(-6deg);
  }
  8% {
    opacity: 1;
    transform: translate(-50%, 0) scale(1.06) rotate(-2deg);
  }
  78% {
    opacity: 1;
    transform: translate(-50%, -2px) scale(1) rotate(-3deg);
  }
  100% {
    opacity: 0;
    transform: translate(-50%, -14px) scale(0.98) rotate(-2deg);
  }
}
@keyframes nine-ripple {
  from {
    opacity: 0.7;
    transform: scale(0.95);
  }
  to {
    opacity: 0;
    transform: scale(1.4);
  }
}
@keyframes nine-super-ripple {
  from {
    opacity: 0.9;
    transform: scale(0.96);
  }
  to {
    opacity: 0;
    transform: scale(1.55);
  }
}
@keyframes nine-ribbon {
  0% {
    opacity: 0;
    transform: translate(-50%, 6px) scale(0.9);
  }
  18% {
    opacity: 1;
    transform: translate(-50%, 0) scale(1);
  }
  80% {
    opacity: 1;
    transform: translate(-50%, 0) scale(1);
  }
  100% {
    opacity: 0;
    transform: translate(-50%, -4px) scale(0.98);
  }
}
@keyframes toy-pop {
  0% {
    transform: scale(1) rotate(0deg);
  }
  18% {
    transform: scale(0.93) rotate(-2deg);
  }
  45% {
    transform: scale(1.05) rotate(1.5deg);
  }
  70% {
    transform: scale(0.99) rotate(-0.5deg);
  }
  100% {
    transform: scale(1) rotate(0);
  }
}
@media (hover: hover) and (pointer: fine) {
  .club-toy-trigger:hover .club-toy-avatar {
    transform: rotate(1deg) scale(1.02);
  }
  .club-toy-trigger:hover .club-nine-satellite {
    animation-duration: 2.9s;
  }
  .club-toy-trigger:hover .club-nine-glyph {
    transform: rotate(var(--nine-turn)) scale(1.08);
  }
}
@media (min-width: 1024px) {
  .club-avatar-toy {
    --avatar-size: clamp(17rem, 26vw, 23rem);
    --nine-size: clamp(2.5rem, 4vw, 3.5rem);
  }
}
@media (max-width: 1023px) {
  .club-avatar-toy {
    --avatar-size: clamp(9rem, min(52vw, 25svh), 15rem);
    --nine-size: clamp(1.75rem, 6.5vw, 2.5rem);
    --jump-distance: 1.25rem;
    padding: 1.5rem 2rem;
  }
  .club-toy-avatar {
    border-width: 3px;
    box-shadow: 0 12px 36px rgb(2 6 23 / 0.24);
  }
  .club-nine-glyph {
    text-shadow: 0 1px 3px #075985;
  }
  .spark-0 {
    --spark-distance: calc(var(--avatar-size) * 0.72);
  }
  .spark-1 {
    --spark-distance: calc(var(--avatar-size) * 0.65);
  }
  .spark-2 {
    --spark-distance: calc(var(--avatar-size) * 0.78);
  }
  .spark-3 {
    --spark-distance: calc(var(--avatar-size) * 0.68);
  }
  .spark-4 {
    --spark-distance: calc(var(--avatar-size) * 0.64);
  }
  .spark-5 {
    --spark-distance: calc(var(--avatar-size) * 0.74);
  }
  .super-spark-0 {
    --spark-distance: calc(var(--avatar-size) * 0.8);
  }
  .super-spark-1 {
    --spark-distance: calc(var(--avatar-size) * 0.7);
  }
  .super-spark-2 {
    --spark-distance: calc(var(--avatar-size) * 0.86);
  }
  .super-spark-3 {
    --spark-distance: calc(var(--avatar-size) * 0.68);
  }
  .super-spark-4 {
    --spark-distance: calc(var(--avatar-size) * 0.78);
  }
  .super-spark-5 {
    --spark-distance: calc(var(--avatar-size) * 0.74);
  }
  .super-spark-6 {
    --spark-distance: calc(var(--avatar-size) * 0.84);
  }
  .super-spark-7 {
    --spark-distance: calc(var(--avatar-size) * 0.66);
  }
  .super-spark-8 {
    --spark-distance: calc(var(--avatar-size) * 0.76);
  }
  .club-nine-hint {
    display: none;
  }
  .club-nine-cry {
    bottom: calc(100% - 2.5rem);
    left: 50%;
    max-width: min(15rem, calc(100vw - 4rem));
    padding: 0.34rem 0.6rem;
    font-size: 0.78rem;
  }
  .club-nine-cry::after {
    left: 50%;
  }
  .club-nine-cry-guide {
    font-size: 0.65rem;
  }
  .club-nine-cry.is-super {
    font-size: 0.88rem;
  }
  .club-nine-ribbon {
    bottom: -1.25rem;
    font-size: 0.48rem;
  }
  .club-toy-halo {
    inset: -8px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .club-nine-satellite,
  .is-playing .club-nine-glyph,
  .is-playing .club-nine-spark,
  .club-nine-cry,
  .club-nine-ribbon,
  .club-toy-halo,
  .club-toy-trigger.is-popping .club-toy-avatar {
    animation: none;
  }
  .club-nine-satellite {
    transform: none;
  }
  .club-nine-spark,
  .club-nine-hint {
    display: none;
  }
  .club-nine-cry {
    transform: translateX(-50%);
  }
  .is-playing .club-nine-glyph {
    color: #fff;
  }
  .club-nine-ripple {
    display: none;
  }
  .club-toy-avatar {
    transition: none;
  }
  .club-toy-trigger:is(:hover, :active) .club-toy-avatar {
    transform: none;
  }
}
</style>
