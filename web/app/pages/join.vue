<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { normalizedGroupNumber, safeHttpUrl } from '~/utils/site-config'
import { vReveal } from '~/utils/motion'

const { config, pending: loading, error: errorMessage, retry, ready } = usePublicConfig()
await ready

usePublicSeo({ title: '加入我们', path: '/join' })

const qrFailed = ref(false)
const qrLoaded = ref(false)
const qrAttempt = ref(0)
const qrImage = ref<HTMLImageElement | null>(null)
const copying = ref(false)
const copyMessage = ref('')

const qrCode = computed(() => config.value.qq_qr_image || '')
const qrSrc = computed(() => {
  if (!qrAttempt.value || !qrCode.value) return qrCode.value
  const [path = '', hash] = qrCode.value.split('#')
  return `${path}${path.includes('?') ? '&' : '?'}retry=${qrAttempt.value}${hash ? `#${hash}` : ''}`
})
const groupNumber = computed(() => normalizedGroupNumber(config.value.qq_group_number))
const joinUrl = computed(() => safeHttpUrl(config.value.qq_join_url))
const joinQuestion = computed(() =>
  typeof config.value.join_question === 'string'
    ? config.value.join_question.trim()
    : ''
)

const retryQr = (): void => {
  qrFailed.value = false
  qrLoaded.value = false
  qrAttempt.value += 1
}

const copyGroupNumber = async (): Promise<void> => {
  copying.value = true
  copyMessage.value = ''
  try {
    await navigator.clipboard.writeText(groupNumber.value)
    copyMessage.value = '群号已复制，可以到 QQ 内搜索加入。'
  } catch {
    copyMessage.value = '无法自动复制，请长按或选中上方群号手动复制。'
  } finally {
    copying.value = false
  }
}

watch(qrCode, () => {
  qrFailed.value = false
  qrLoaded.value = false
  qrAttempt.value = 0
})
watch(groupNumber, () => {
  copyMessage.value = ''
})

/**
 * The server renders the QR image from the configuration it already fetched, so
 * the request can finish (successfully or not) before hydration attaches the
 * `load`/`error` handlers; the event is then never delivered and the archived
 * failure state never appears. Adopt the element's own state once the client
 * owns it. The archived page never hit this because it only rendered the image
 * after its client-side configuration fetch.
 */
onMounted(() => {
  const element = qrImage.value
  if (!element || !element.complete) return
  if (element.naturalWidth > 0) qrLoaded.value = true
  else qrFailed.value = true
})
</script>

<template>
  <div class="join-page club-paper relative isolate overflow-hidden">
    <div
      v-if="config.join_bg"
      class="absolute inset-0 -z-20 opacity-[0.04]"
      aria-hidden="true"
    >
      <img
        :src="config.join_bg"
        alt=""
        class="h-full w-full object-cover"
        decoding="async"
      />
    </div>
    <div class="join-wash absolute inset-0 -z-10" aria-hidden="true"></div>

    <div class="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-20 lg:py-24">
      <NuxtLink
        to="/"
        class="join-text-muted inline-flex min-h-11 items-center gap-2 text-sm font-medium transition-colors hover:text-sky-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-500"
      >
        <span aria-hidden="true">←</span> 返回首页
      </NuxtLink>

      <div
        class="mt-8 grid items-start gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-20"
      >
        <section v-reveal aria-labelledby="join-title" class="lg:pt-6">
          <p
            class="text-xs font-bold uppercase tracking-[0.2em] text-sky-600 dark:text-sky-400"
          >
            GuatSWR · 桂航绯想天
          </p>
          <h1
            id="join-title"
            class="join-text mt-5 text-4xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl"
          >
            一起，把热爱<br />变成日常。
          </h1>
          <p
            class="join-text-muted mt-6 max-w-md text-base leading-8 sm:text-lg"
          >
            这里是桂航的东方 Project
            同好会。弹幕、非想天则、音乐、二创，无论你从哪一份热爱出发，都欢迎来打个招呼。
          </p>
        </section>

        <section
          v-reveal="{ delay: 80, variant: 'scale' }"
          aria-labelledby="join-card-title"
          class="join-panel min-w-0 border-t pt-8 lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:border-l lg:border-t-0 lg:pl-10 lg:pt-0"
        >
          <div
            class="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-sky-600 dark:text-sky-400"
          >
            <span
              class="h-1.5 w-1.5 rounded-full bg-sky-500"
              aria-hidden="true"
            ></span>
            进入幻想乡
          </div>
          <h2 id="join-card-title" class="join-text mt-3 text-2xl font-bold">
            加入桂航绯想天
          </h2>
          <p class="join-text-muted mt-2 text-sm leading-6">
            用 QQ 扫一扫，认识下一位一起玩的朋友。
          </p>

          <div
            v-if="errorMessage"
            class="join-error mt-5 rounded-xl border p-4 text-sm"
            role="status"
          >
            <p>{{ errorMessage }}</p>
            <button
              type="button"
              :disabled="loading"
              class="mt-2 min-h-11 font-semibold underline underline-offset-4 disabled:opacity-50"
              @click="retry"
            >
              {{ loading ? '正在重试…' : '重新加载入群信息' }}
            </button>
          </div>

          <div
            class="join-qr-paper relative mx-auto mt-7 aspect-square w-full max-w-[17rem] border p-4"
            :aria-busy="
              (loading && !qrCode) || (!!qrCode && !qrLoaded && !qrFailed)
            "
          >
            <img
              v-if="qrCode && !qrFailed"
              ref="qrImage"
              :key="qrSrc"
              :src="qrSrc"
              alt="桂航绯想天 QQ 群二维码，请使用 QQ 扫码加入"
              width="640"
              height="640"
              class="block h-full w-full object-contain"
              decoding="async"
              @load="qrLoaded = true"
              @error="qrFailed = true"
            />
            <div
              v-else
              class="flex h-full flex-col items-center justify-center gap-3 text-center text-sm leading-6 text-slate-600"
            >
              <template v-if="loading && !qrCode"
                ><span
                  class="join-loading-dot h-3 w-3 rounded-full bg-sky-400"
                  aria-hidden="true"
                ></span>
                <p>正在加载二维码…</p></template
              >
              <template v-else-if="qrFailed"
                ><p>二维码暂时未能显示</p>
                <button
                  type="button"
                  class="min-h-11 rounded-lg px-4 font-semibold text-sky-700 underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500"
                  @click="retryQr"
                >
                  重新加载二维码
                </button></template
              >
              <template v-else
                ><p>
                  {{ errorMessage ? '入群信息暂时不可用' : '管理员尚未配置二维码' }}
                </p>
                <p class="text-xs">
                  {{
                    groupNumber || joinUrl
                      ? '可使用下方的入群方式'
                      : '请稍后再来看看'
                  }}
                </p></template
              >
            </div>
          </div>
          <p
            v-if="qrCode && !qrFailed"
            class="join-text-muted mt-3 text-center text-xs leading-5"
          >
            手机上可长按保存二维码，再使用 QQ 识别。
          </p>

          <div v-if="groupNumber" class="join-rules mt-6 border-t pt-4">
            <p class="join-text-muted text-xs">QQ群号</p>
            <div class="mt-1 flex flex-wrap items-center justify-between gap-2">
              <span
                class="join-text select-all break-all font-mono text-xl font-semibold"
                >{{ groupNumber }}</span
              >
              <button
                type="button"
                :disabled="copying"
                class="join-copy min-h-11 rounded-lg border px-4 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 disabled:opacity-50"
                @click="copyGroupNumber"
              >
                {{ copying ? '复制中…' : '复制群号' }}
              </button>
            </div>
          </div>
          <p
            class="join-text-muted mt-2 text-sm leading-6"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {{ copyMessage }}
          </p>

          <a
            v-if="joinUrl"
            :href="joinUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="mt-4 flex min-h-12 items-center justify-center gap-2 rounded-xl bg-sky-600 px-5 py-3 text-center text-sm font-bold text-white transition-colors hover:bg-sky-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-500"
            aria-label="打开 QQ 入群页面（新窗口）"
          >
            打开 QQ 入群页面 <span aria-hidden="true">↗</span>
          </a>

          <div v-if="joinQuestion" class="join-rules mt-6 border-t pt-4">
            <p class="text-xs font-semibold text-sky-600 dark:text-sky-400">
              入群问题
            </p>
            <p class="join-text mt-2 break-words text-sm leading-6">
              {{ joinQuestion }}
            </p>
          </div>
        </section>

        <section
          v-reveal="120"
          aria-label="加入步骤与入群须知"
          class="lg:col-start-1 lg:row-start-2"
        >
          <ol class="space-y-5" aria-label="加入步骤">
            <li class="flex items-start gap-4">
              <span
                class="join-step mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                >01</span
              >
              <div>
                <h2 class="join-text font-semibold">找到同好</h2>
                <p class="join-text-muted mt-1 text-sm leading-6">
                  使用 QQ 扫码；如已提供群号或链接，也可以直接加入。
                </p>
              </div>
            </li>
            <li class="flex items-start gap-4">
              <span
                class="join-step mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                >02</span
              >
              <div>
                <h2 class="join-text font-semibold">聊聊你的入坑故事</h2>
                <p class="join-text-muted mt-1 text-sm leading-6">
                  按入群提示填写申请，新人也不用紧张。
                </p>
              </div>
            </li>
            <li class="flex items-start gap-4">
              <span
                class="join-step mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                >03</span
              >
              <div>
                <h2 class="join-text font-semibold">从一句「你好」开始</h2>
                <p class="join-text-muted mt-1 text-sm leading-6">
                  进群后可以先和群友说一下从哪里找到的群哦～
                </p>
              </div>
            </li>
          </ol>

          <div class="join-rules mt-10 border-t pt-6">
            <h2 class="join-text text-sm font-bold">相遇之前，几句约定</h2>
            <ul
              class="join-text-muted mt-3 list-disc space-y-2 pl-4 text-sm leading-6"
            >
              <li>不管是否来自桂航 / 桂林高校，均欢迎加入！</li>
              <li>进群后可以先和群友说一下从哪里找到的群哦～</li>
              <li>禁止讨论政治敏感话题。</li>
            </ul>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.join-page {
  min-height: calc(100svh - 4rem);
}
.join-wash {
  background: transparent;
}
.join-text {
  color: #243440;
}
.join-text-muted {
  color: #64748b;
}
.join-panel,
.join-rules {
  border-color: #dce2e5;
}
.join-step {
  color: #0369a1;
  border: 1px solid #b9d2df;
}
.join-qr-paper {
  background: #fff;
  border-color: #e2e8f0;
}
.join-copy {
  border-color: #b9d2df;
  color: #0369a1;
}
.join-copy:hover {
  background: #edf4f6;
}
.join-error {
  background: #fff8ed;
  border-color: #f3dfb9;
  color: #78530c;
}
.join-loading-dot {
  animation: join-pulse 1.5s ease-in-out infinite;
}
:global(html.dark .join-text) {
  color: #e2e8f0;
}
:global(html.dark .join-text-muted) {
  color: #94a3b8;
}
:global(html.dark :is(.join-panel, .join-rules)) {
  border-color: #334155;
}
:global(html.dark :is(.join-step, .join-copy)) {
  color: #7dd3fc;
  border-color: #375363;
}
:global(html.dark .join-copy:hover) {
  background: #243440;
}
:global(html.dark .join-error) {
  background: #3b301d;
  border-color: #69552c;
  color: #f7ddab;
}
@keyframes join-pulse {
  50% {
    opacity: 0.4;
  }
}
@media (prefers-reduced-motion: reduce) {
  .join-loading-dot {
    animation: none;
  }
}
</style>
