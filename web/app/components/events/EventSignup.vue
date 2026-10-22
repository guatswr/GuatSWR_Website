<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  emptyEventSignup,
  eventSignupSchema,
  type EventSignupInput,
  type PublicEvent
} from '@guatswr/shared'
import { useEventApi } from '~/composables/useEventApi'
import { EventTransportError, isUploadableImage } from '~/utils/event-transport'
import { isEventSignupOpen } from '~/utils/event-display'

const props = defineProps({
  event: { type: Object as () => PublicEvent, required: true },
  disabled: { type: Boolean, default: false }
})

const transport = useEventApi()
const form = ref<EventSignupInput>(emptyEventSignup())
const loading = ref(false)
const deleting = ref(false)
const uploading = ref(false)
const uploadPercent = ref(0)
const message = ref('')
const errorMessage = ref('')
const invalidField = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
let uploadController: AbortController | undefined
let loadVersion = 0

const eventId = computed(() => Number(props.event.id))
const uploadLocked = computed(
  () => props.disabled || !isEventSignupOpen(props.event.content)
)

async function loadSignup(): Promise<void> {
  const version = ++loadVersion
  try {
    const record = await transport.readSignup(eventId.value)
    if (version !== loadVersion) return
    if (!record) return
    form.value = {
      common_id: record.common_id,
      qq: record.qq,
      avatar: record.avatar,
      machine_sign: record.machine_sign,
      pilot_source: record.pilot_source
    }
  } catch (error) {
    if (version !== loadVersion) return
    // A missing/expired session must not wipe the visible form or the theme.
    if (error instanceof EventTransportError && error.code === 'unauthenticated') return
    errorMessage.value = '报名信息读取失败，请重试'
  }
}

async function handleSubmit(): Promise<void> {
  if (loading.value || uploadLocked.value) return
  const parsed = eventSignupSchema.safeParse(form.value)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    invalidField.value = typeof issue?.path[0] === 'string' ? String(issue.path[0]) : ''
    errorMessage.value = issue?.message ?? '请检查报名信息'
    message.value = ''
    return
  }
  invalidField.value = ''
  errorMessage.value = ''
  loading.value = true
  try {
    await transport.saveSignup(eventId.value, parsed.data)
    message.value = '报名信息已保存'
  } catch (error) {
    errorMessage.value =
      error instanceof EventTransportError ? error.message : '报名信息保存失败，请重试'
  } finally {
    loading.value = false
  }
}

async function handleDelete(): Promise<void> {
  if (deleting.value || props.disabled) return
  deleting.value = true
  errorMessage.value = ''
  try {
    await transport.deleteSignup(eventId.value)
    form.value = emptyEventSignup()
    message.value = '报名已删除'
  } catch (error) {
    errorMessage.value =
      error instanceof EventTransportError ? error.message : '删除失败，请重试'
  } finally {
    deleting.value = false
  }
}

function chooseAvatar(): void {
  if (uploadLocked.value || uploading.value) return
  fileInput.value?.click()
}

async function handleFileChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  message.value = ''
  errorMessage.value = ''
  if (!isUploadableImage(file)) {
    errorMessage.value = '请选择 50 MB 以内的 JPG、PNG、GIF、WebP 或 SVG 图片'
    input.value = ''
    return
  }
  uploading.value = true
  uploadPercent.value = 0
  const version = loadVersion
  uploadController?.abort()
  uploadController = new AbortController()
  try {
    const { compressUploadImage } = await import('~/utils/compress-image')
    const image = await compressUploadImage(file)
    const result = await transport.uploadAvatar(image, eventId.value, {
      signal: uploadController.signal,
      onProgress: (progress) => {
        if (version === loadVersion) uploadPercent.value = progress.percent
      }
    })
    if (version !== loadVersion) return
    form.value.avatar = result.url
    message.value = '头像已上传'
  } catch (error) {
    if (version !== loadVersion) return
    if (error instanceof EventTransportError && error.code === 'network' && uploadController.signal.aborted)
      return
    errorMessage.value =
      error instanceof EventTransportError ? error.message : '图片上传失败，请重试'
  } finally {
    uploading.value = false
    uploadPercent.value = 0
    uploadController = undefined
    input.value = ''
  }
}

onMounted(() => {
  void loadSignup()
})

onBeforeUnmount(() => {
  loadVersion += 1
  uploadController?.abort()
  uploadController = undefined
})
</script>

<template>
  <div
    class="border border-slate-200 border-t-2 border-t-sky-700 bg-white/70 p-4 sm:p-5 dark:border-slate-800 dark:border-t-sky-400 dark:bg-slate-900/40"
  >
    <div class="flex items-center justify-between mb-4 border-b border-dashed border-slate-200 pb-3 dark:border-slate-700">
      <div>
        <h4 class="font-serif text-base font-bold text-slate-900 dark:text-white">报名信息</h4>
        <p class="text-xs text-slate-500 dark:text-slate-400">
          保存后会记忆该设备上的填写内容
        </p>
      </div>
      <button
        type="button"
        class="text-xs text-rose-500 hover:text-rose-600 dark:text-rose-400 dark:hover:text-rose-300"
        :disabled="deleting || disabled"
        @click="handleDelete"
      >
        {{ deleting ? '删除中...' : '删除报名' }}
      </button>
    </div>

    <p
      v-if="uploadLocked"
      class="mb-3 border-l-2 border-slate-400 bg-slate-100 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300"
      role="status"
    >
      报名已截止
    </p>

    <form class="grid md:grid-cols-2 gap-3 sm:gap-4 text-sm" novalidate @submit.prevent="handleSubmit">
      <!--
        `space-y-1` is kept for the archived class list, but Tailwind 4 implements
        it as `margin-block-end` on the inline <span>, and a vertical margin on an
        inline box has no effect. Tailwind 3 put the same 4px on the *control*
        (`> :not([hidden]) ~ :not([hidden])` -> `margin-top`), so the explicit
        `mt-1` restores the archived 70px label box.
      -->
      <label class="space-y-1">
        <span class="text-xs text-slate-500 dark:text-slate-400">常用ID</span>
        <input
          v-model="form.common_id"
          name="common_id"
          :aria-invalid="invalidField === 'common_id'"
          class="mt-1 w-full rounded-sm border border-slate-300/80 bg-white px-3 py-2.5 text-base text-slate-900 md:text-sm dark:border-white/10 dark:bg-slate-900/40 dark:text-slate-100"
          :disabled="disabled"
        >
      </label>
      <label class="space-y-1">
        <span class="text-xs text-slate-500 dark:text-slate-400">机签</span>
        <input
          v-model="form.machine_sign"
          name="machine_sign"
          class="mt-1 w-full rounded-sm border border-slate-300/80 bg-white px-3 py-2.5 text-base text-slate-900 md:text-sm dark:border-white/10 dark:bg-slate-900/40 dark:text-slate-100"
          :disabled="disabled"
        >
      </label>
      <label class="space-y-1">
        <span class="text-xs text-slate-500 dark:text-slate-400">机师来源</span>
        <select
          v-model="form.pilot_source"
          name="pilot_source"
          class="mt-1 w-full rounded-sm border border-slate-300/80 bg-white px-3 py-2.5 text-base text-slate-900 md:text-sm dark:border-white/10 dark:bg-slate-900/40 dark:text-slate-100"
          :disabled="disabled"
        >
          <option value="">请选择</option>
          <option value="桂电">桂电</option>
          <option value="桂航">桂航</option>
          <option value="师大">师大</option>
          <option value="桂工">桂工</option>
          <option value="桂旅">桂旅</option>
          <option value="漓院">漓院</option>
          <option value="桂信">桂信</option>
          <option value="桂师">桂师</option>
          <option value="桂医">桂医</option>
          <option value="其他">其他</option>
        </select>
      </label>
      <label class="space-y-1">
        <span class="text-xs text-slate-500 dark:text-slate-400">QQ</span>
        <input
          v-model="form.qq"
          name="qq"
          :aria-invalid="invalidField === 'qq'"
          class="mt-1 w-full rounded-sm border border-slate-300/80 bg-white px-3 py-2.5 text-base text-slate-900 md:text-sm dark:border-white/10 dark:bg-slate-900/40 dark:text-slate-100"
          :disabled="disabled"
        >
      </label>
    </form>

    <!--
      The avatar / progress / preview / submit rows sit outside the field grid,
      exactly as in the archived component: the archive spaced them with
      `mt-3` / `mt-2` / `mt-3` / `mt-4`, and the visual parity spec compares this
      body box pixel for pixel.
    -->
    <div
      class="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3 text-xs text-slate-500 dark:text-slate-400"
    >
      <button
        type="button"
        class="w-full sm:w-auto px-3 py-2 border border-slate-300 bg-white text-slate-700 text-xs font-medium hover:border-sky-600 hover:text-sky-700 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-sky-400 dark:hover:text-sky-300"
        :disabled="uploading || uploadLocked"
        @click="chooseAvatar"
      >
        {{ uploading ? '上传中...' : '上传头像' }}
      </button>
      <span
        v-if="form.avatar"
        class="break-all sm:break-normal sm:truncate sm:flex-1"
        :aria-invalid="invalidField === 'avatar'"
        >{{ form.avatar }}</span
      >
      <span
        v-else
        class="break-all sm:break-normal sm:truncate sm:flex-1"
        :aria-invalid="invalidField === 'avatar'"
        >未上传</span
      >
    </div>

    <div
      v-if="uploading"
      class="mt-2 h-1 bg-slate-200 overflow-hidden dark:bg-slate-800"
      role="progressbar"
      :aria-valuenow="uploadPercent"
      aria-valuemin="0"
      aria-valuemax="100"
      aria-label="头像上传进度"
    >
      <div class="h-full bg-emerald-500 transition-all" :style="{ width: uploadPercent + '%' }" />
    </div>

    <div
      v-if="form.avatar"
      class="mt-3 flex flex-col sm:flex-row sm:items-center gap-3 text-xs text-slate-500 dark:text-slate-400"
    >
      <img :src="form.avatar" alt="头像预览" class="w-10 h-10 rounded-full object-cover" >
      <span>已上传头像</span>
    </div>

    <div class="mt-4 flex flex-wrap gap-3">
      <button
        type="button"
        class="w-full sm:w-auto px-5 py-2 border border-sky-700 bg-sky-700 text-white text-sm font-semibold hover:bg-sky-800 disabled:opacity-60 dark:border-sky-500 dark:bg-sky-600 dark:hover:bg-sky-700"
        :disabled="loading || uploadLocked"
        :aria-busy="loading"
        @click="handleSubmit"
      >
        {{ loading ? '提交中...' : '保存报名' }}
      </button>
    </div>

    <p
      v-if="message"
      class="mt-3 text-sm text-emerald-600 dark:text-emerald-300"
      role="status"
      aria-live="polite"
    >
      {{ message }}
    </p>
    <p
      v-if="errorMessage"
      class="mt-3 border-l-2 border-rose-500 bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-200"
      role="alert"
    >
      {{ errorMessage }}
    </p>

    <input
      ref="fileInput"
      type="file"
      class="hidden"
      accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml"
      tabindex="-1"
      @change="handleFileChange"
    >
  </div>
</template>
