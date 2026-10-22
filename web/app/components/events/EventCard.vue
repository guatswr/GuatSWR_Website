<script setup lang="ts">
import { computed } from 'vue'
import type { PublicEvent } from '@guatswr/shared'
import ClubIcon from '~/components/ClubIcon.vue'
import ProgressiveImage from '~/components/ProgressiveImage.vue'
import { parseClubTime } from '~/utils/club-date'
import { eventCategory, eventAcceptingParticipants } from '~/utils/event-center'
import {
  eventCountdown,
  eventCoverUrl,
  eventDeadlineText,
  eventDeadlineValue,
  eventStatusText,
  eventTopResults,
} from '~/utils/event-display'
import { displayImageSource, displayThumbSource } from '~/utils/public-image'

const props = defineProps<{ event: PublicEvent; now: number }>()
const emit = defineEmits<{
  previewImage: [payload: { src: string; alt: string }]
}>()

const content = computed(() => props.event.content)
const category = computed(() => eventCategory(props.event.type))
const accepting = computed(() => eventAcceptingParticipants(props.event, props.now))
const status = computed(() =>
  !accepting.value && ['published', 'ongoing'].includes(props.event.status)
    ? '已截止'
    : eventStatusText(props.event)
)
const deadline = computed(() => eventDeadlineText(eventDeadlineValue(content.value)))
const countdown = computed(() =>
  accepting.value ? eventCountdown(eventDeadlineValue(content.value), props.now) : ''
)
const rawCover = computed(() => eventCoverUrl(content.value))
const cover = computed(() => displayImageSource(rawCover.value))
const coverThumb = computed(() => displayThumbSource(rawCover.value) || cover.value)
const topResults = computed(() => eventTopResults(content.value))
const dateParts = computed(() => {
  const timestamp = parseClubTime(eventDeadlineValue(content.value))
  if (!Number.isFinite(timestamp)) return null
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: 'numeric',
    day: '2-digit',
  }).formatToParts(new Date(timestamp))
  const part = (name: string) => parts.find(item => item.type === name)?.value ?? ''
  return { month: part('month'), day: part('day'), year: part('year') }
})

function handlePreviewImage(e: MouseEvent) {
  if (!cover.value) return
  e.preventDefault()
  emit('previewImage', {
    src: cover.value,
    alt: `${props.event.title || '活动'}配图`,
  })
}
</script>

<template>
  <article
    class="event-card"
    :data-kind="category.kind"
    :data-ended="!accepting"
    :style="{
      '--kind-color': category.color,
      '--kind-dark-color': category.darkColor,
    }"
  >
    <!-- 左侧传统历书牌 -->
    <div class="event-date-block" aria-hidden="true">
      <span class="event-date-seal">{{ category.seal }}</span>
      <template v-if="dateParts">
        <span class="event-date-month">{{ dateParts.month }}月</span>
        <strong>{{ dateParts.day }}</strong>
        <span class="event-date-year">{{ dateParts.year }}</span>
      </template>
      <div v-else class="event-date-fallback">
        <ClubIcon name="calendar" />
        <span>待定</span>
      </div>
    </div>

    <!-- 右侧档案主体 -->
    <div class="event-card-body">
      <div class="event-card-topline">
        <div class="event-card-meta-group">
          <NuxtLink :to="category.path" class="event-card-category">
            <span class="event-card-category-dot" aria-hidden="true" />{{ category.label }}
          </NuxtLink>
          <p v-if="deadline" class="event-card-date">
            <span class="event-card-date-label">{{ event.type === '线下聚会' ? '活动时间' : '截止时间' }}</span>
            <span class="event-card-date-sep" aria-hidden="true">·</span>
            <span>{{ deadline }}</span>
          </p>
        </div>

        <span class="event-card-status" :class="{ 'is-open': accepting }">
          <span aria-hidden="true" />{{ status }}
        </span>
      </div>

      <div class="event-card-heading">
        <h3>{{ event.title || '未命名活动' }}</h3>
      </div>

      <!-- 1. 悬赏令专属版式 -->
      <template v-if="event.type === '悬赏令'">
        <div class="event-bounty-layout">
          <div class="event-bounty-main">
            <div v-if="content.initiator?.id" class="event-person">
              <img
                v-if="content.initiator.avatar"
                :src="content.initiator.avatar"
                alt=""
                loading="lazy"
              >
              <span v-else class="event-person-placeholder" aria-hidden="true">悬</span>
              <span class="event-person-text">
                <strong>{{ content.initiator.id }}</strong>
                <span class="event-person-note">悬赏发起</span>
              </span>
            </div>
            <dl class="event-data">
              <div v-if="content.challenge">
                <dt>挑战</dt>
                <dd>{{ content.challenge }}</dd>
              </div>
              <div v-if="content.requirements && content.requirements !== content.challenge">
                <dt>要求</dt>
                <dd>{{ content.requirements }}</dd>
              </div>
              <div v-if="content.limit">
                <dt>对象</dt>
                <dd>{{ content.limit }}</dd>
              </div>
            </dl>
          </div>

          <div class="event-reward">
            <span class="event-reward-stamp" aria-hidden="true">赏</span>
            <span class="event-reward-label">悬赏奖励</span>
            <strong>{{ content.reward || '待公布' }}</strong>
          </div>
        </div>
        <p v-if="content.completion?.id" class="event-result">
          <span class="event-result-seal" aria-hidden="true">达成</span>
          已验收 · {{ content.completion.id }}
        </p>
      </template>

      <!-- 2. 对赌协议专属版式 -->
      <template v-else-if="event.type === '对赌协议'">
        <div class="event-contract">
          <div
            v-for="(person, index) in [content.a, content.b]"
            :key="index"
            class="event-contract-person"
            :data-party="index === 0 ? 'a' : 'b'"
          >
            <div class="event-contract-header">
              <span class="event-contract-role" aria-hidden="true">{{ index === 0 ? '立约甲方' : '立约乙方' }}</span>
              <div class="event-person">
                <img v-if="person?.avatar" :src="person.avatar" alt="" loading="lazy">
                <span v-else class="event-person-placeholder" aria-hidden="true">{{ index === 0 ? '甲' : '乙' }}</span>
                <strong>{{ person?.id || (index === 0 ? '甲方' : '乙方') }}</strong>
              </div>
            </div>
            <p class="event-contract-goal">{{ person?.goal || '目标待公布' }}</p>
          </div>
          <div class="event-contract-vs" aria-hidden="true">
            <span>契</span>
          </div>
        </div>

        <dl v-if="content.penalty" class="event-data event-penalty-box">
          <div>
            <dt>约定</dt>
            <dd>{{ content.penalty }}</dd>
          </div>
        </dl>
        <p v-if="content.result" class="event-result">
          <span class="event-result-seal" aria-hidden="true">裁定</span>
          结果：{{ content.result }}
        </p>
      </template>

      <!-- 3. 东方弹幕 / 非想天则 赛事版式 -->
      <template v-else-if="event.type === 'STG' || event.type === '则则'">
        <p v-if="content.copy" class="event-card-description">{{ content.copy }}</p>
        <dl v-if="content.rules || content.prizes" class="event-data event-data-grid">
          <div v-if="content.rules">
            <dt>规则</dt>
            <dd>{{ content.rules }}</dd>
          </div>
          <div v-if="content.prizes">
            <dt>奖品</dt>
            <dd>{{ content.prizes }}</dd>
          </div>
        </dl>
        <div v-if="topResults.length" class="event-results">
          <h4>赛事成绩</h4>
          <ol>
            <li v-for="(row, index) in topResults" :key="index" :data-rank="row.rank || index + 1">
              <span class="event-rank-badge">{{ row.rank || index + 1 }}</span>
              <img v-if="row.avatar" :src="row.avatar" alt="" loading="lazy">
              <span class="event-rank-name">{{ row.id || row.player_id }}</span>
            </li>
          </ol>
        </div>
      </template>

      <!-- 4. 线下聚会版式 -->
      <template v-else-if="event.type === '线下聚会'">
        <p v-if="content.copy" class="event-card-description">{{ content.copy }}</p>
        <dl class="event-data event-data-grid">
          <div>
            <dt>地点</dt>
            <dd>{{ content.location || '待公布' }}</dd>
          </div>
          <div v-if="content.gather_type">
            <dt>类型</dt>
            <dd>{{ content.gather_type }}</dd>
          </div>
          <div v-if="content.notes">
            <dt>备注</dt>
            <dd>{{ content.notes }}</dd>
          </div>
        </dl>
      </template>

      <!-- 影像凭证与配图（直接可视化预览，点击可放大检视） -->
      <div v-if="cover" class="event-media">
        <a
          :href="cover"
          target="_blank"
          rel="noopener noreferrer"
          class="event-media-frame"
          :aria-label="event.title + '配图（点击放大）'"
          @click="handlePreviewImage"
        >
          <ProgressiveImage
            :src="coverThumb || cover"
            :fallback-src="cover"
            :alt="event.title + '配图'"
            wrapper-class="event-media-image"
            img-class="h-full w-full object-cover"
          />
          <span class="event-media-caption" aria-hidden="true">
            <span class="event-media-tag">附带影像</span>
            <span>点击放大检视 ↗</span>
          </span>
        </a>
      </div>

      <!-- 底部倒计时与操作栏 -->
      <footer v-if="countdown || $slots.actions" class="event-card-footer">
        <div v-if="countdown" class="event-countdown">
          <span class="event-countdown-dot" aria-hidden="true" />
          距截止还有 {{ countdown }}
        </div>
        <div v-if="$slots.actions" class="event-card-actions">
          <slot name="actions" />
        </div>
      </footer>
    </div>
  </article>
</template>
