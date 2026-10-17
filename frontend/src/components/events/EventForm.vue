<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import axios from 'axios'
import { ElMessage } from 'element-plus'
import { compressImage } from '../../utils/image'
import {
  EVENT_TYPES, buildEventPayload, createDraftSession, createEventFormState,
  getEventFields, getEventTypes, saveEventForm, validateEventForm
} from './eventFormModel.js'

const props = defineProps({
  allowedTypes: { type: Array, default: () => [...EVENT_TYPES] },
  isAdmin: { type: Boolean, default: false },
  submitLabel: { type: String, default: '提交审核' },
  eventId: { type: [Number, String], default: null },
  initialData: { type: Object, default: null }
})
const emit = defineEmits(['submitted'])

const typeOptions = computed(() => getEventTypes(props.allowedTypes))
const form = ref(createEventFormState(props.initialData, typeOptions.value))
const originalEvent = ref(props.initialData)
const fields = computed(() => getEventFields(form.value))
const editing = computed(() => Boolean(props.eventId || props.initialData?.id))
const loading = ref(false)
const loadingInitial = ref(false)
const loadError = ref('')
const errorMessage = ref('')
const invalidField = ref('')
const uploadingTarget = ref('')
const uploadPercent = ref(0)
const fileInput = ref(null)
const formElement = ref(null)
const uploadTarget = ref('')
const busy = computed(() => loading.value || loadingInitial.value || Boolean(uploadingTarget.value))
let draftSession = createDraftSession(axios)
let loadVersion = 0

const loadInitial = async () => {
  const version = ++loadVersion
  loadError.value = ''
  errorMessage.value = ''
  invalidField.value = ''
  draftSession = createDraftSession(axios)
  originalEvent.value = props.initialData
  form.value = createEventFormState(props.initialData, typeOptions.value)
  loadingInitial.value = false
  if (!props.eventId || props.initialData) return
  loadingInitial.value = true
  try {
    const response = await axios.get(`/api/event/${props.eventId}`)
    if (version !== loadVersion) return
    originalEvent.value = response.data
    form.value = createEventFormState(response.data, typeOptions.value)
  } catch (error) {
    if (version === loadVersion) loadError.value = error.response?.data?.message || '活动读取失败，请重试'
  } finally {
    if (version === loadVersion) loadingInitial.value = false
  }
}

watch(() => [props.eventId, props.initialData], loadInitial, { immediate: true })
onBeforeUnmount(() => { loadVersion += 1 })

const inputType = (item) => {
  // Keep older ISO timestamps and free-text schedules instead of silently clearing them.
  if (item.kind === 'datetime-local' && form.value[item.key]
      && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(form.value[item.key])) return 'text'
  return item.kind
}

const chooseImage = (key) => {
  if (busy.value) return
  uploadTarget.value = key
  fileInput.value?.click()
}

const handleFileChange = async (event) => {
  const file = event.target.files?.[0]
  const target = uploadTarget.value
  if (!file || !target || busy.value) return
  errorMessage.value = ''
  if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'].includes(file.type)
      || file.size > 50 * 1024 * 1024) {
    errorMessage.value = '请选择 50 MB 以内的 JPG、PNG、GIF、WebP 或 SVG 图片'
    event.target.value = ''
    return
  }
  uploadingTarget.value = target
  uploadPercent.value = 0
  const version = loadVersion
  try {
    const data = new FormData()
    const image = ['image/gif', 'image/svg+xml'].includes(file.type) ? file : await compressImage(file)
    data.append('file', image)
    if (!props.isAdmin) data.append('eid', await draftSession.ensureId())
    const response = await axios.post(props.isAdmin ? '/api/upload' : '/api/upload/visitor', data, {
      onUploadProgress: ({ loaded, total }) => {
        if (version === loadVersion && total) uploadPercent.value = Math.round(loaded / total * 100)
      }
    })
    if (version !== loadVersion) return
    if (!response.data?.url) throw new Error('图片上传未返回地址，请重试')
    form.value[target] = response.data.url
    invalidField.value = ''
  } catch (error) {
    if (version === loadVersion) errorMessage.value = error.response?.data?.message || error.message || '图片上传失败，请重试'
  } finally {
    uploadingTarget.value = ''
    uploadPercent.value = 0
    event.target.value = ''
  }
}

const handleSubmit = async () => {
  if (busy.value || loadError.value) return
  const validation = validateEventForm(form.value, typeOptions.value)
  invalidField.value = validation?.field || ''
  errorMessage.value = validation?.message || ''
  if (validation) {
    formElement.value?.elements.namedItem(validation.field)?.focus()
    return
  }
  loading.value = true
  const version = loadVersion
  try {
    const result = await saveEventForm(axios, buildEventPayload(form.value, originalEvent.value), {
      eventId: props.eventId || props.initialData?.id,
      isAdmin: props.isAdmin,
      draftSession
    })
    if (version !== loadVersion) return
    ElMessage.success(editing.value ? '修改已保存' : props.isAdmin ? '活动已发布' : '提交成功，等待管理员审核')
    emit('submitted', result)
    if (!editing.value) {
      form.value = createEventFormState(null, [form.value.type])
      draftSession = createDraftSession(axios)
    }
  } catch (error) {
    if (version === loadVersion) errorMessage.value = error.response?.data?.message || error.message || '提交失败，请重试'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <form ref="formElement" class="event-form space-y-5 text-slate-800 dark:text-slate-100" novalidate @submit.prevent="handleSubmit">
    <p class="text-sm text-slate-500 dark:text-slate-400">
      {{ editing ? '修改活动信息；已有的活动状态、报名和比赛结果会保留。' : isAdmin ? '填写活动信息后即可发布。' : '填写活动信息，提交后由管理员审核。' }}
      标有 * 的项目为必填。
    </p>
    <p v-if="loadingInitial" role="status" class="text-sm">正在读取活动…</p>
    <div v-if="loadError" role="alert" class="rounded-lg bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-200">
      {{ loadError }}
      <button type="button" class="ml-2 min-h-11 underline" @click="loadInitial">重新读取</button>
    </div>
    <fieldset :disabled="busy || Boolean(loadError)" class="grid min-w-0 gap-4 sm:grid-cols-2 disabled:opacity-70">
      <legend class="sr-only">活动信息</legend>
      <label class="block space-y-1">
        <span class="text-sm font-medium">活动类型 *</span>
        <select v-model="form.type" name="type" :disabled="editing" required :aria-invalid="invalidField === 'type'">
          <option v-for="type in typeOptions" :key="type" :value="type">{{ type }}</option>
        </select>
      </label>
      <label class="block space-y-1">
        <span class="text-sm font-medium">标题 *</span>
        <input v-model="form.title" name="title" maxlength="200" required :aria-invalid="invalidField === 'title'" placeholder="给活动起一个名字" />
      </label>
      <fieldset v-if="form.type === '对赌协议'" class="flex min-w-0 flex-wrap gap-4 sm:col-span-2">
        <legend class="mb-1 text-sm font-medium">对赌方式</legend>
        <label class="inline-flex min-h-11 items-center gap-2"><input v-model="form.betMode" type="radio" name="bet-mode" value="solo" />单人赌约</label>
        <label class="inline-flex min-h-11 items-center gap-2"><input v-model="form.betMode" type="radio" name="bet-mode" value="duo" />双人对赌</label>
      </fieldset>
      <template v-for="item in fields" :key="item.key">
        <fieldset v-if="item.kind === 'image'" class="min-w-0 space-y-2 sm:col-span-2">
          <legend class="text-sm font-medium">{{ item.label }}{{ item.required ? ' *' : '' }}</legend>
          <div class="flex min-w-0 flex-wrap items-center gap-3">
            <img v-if="form[item.key]" :src="form[item.key]" :alt="item.label + '预览'" class="h-16 w-16 rounded-lg border border-slate-200 object-cover dark:border-slate-700" />
            <button type="button" :name="item.key" :aria-label="'上传' + item.label" :aria-invalid="invalidField === item.key" class="min-h-11 rounded-lg bg-sky-700 px-4 py-2 text-sm font-medium text-white hover:bg-sky-800" @click="chooseImage(item.key)">
              {{ uploadingTarget === item.key ? `上传中 ${uploadPercent}%` : form[item.key] ? '更换图片' : '选择图片' }}
            </button>
            <button v-if="form[item.key] && !item.required" type="button" class="min-h-11 px-2 text-sm text-slate-500 underline dark:text-slate-300" :aria-label="'移除' + item.label" @click="form[item.key] = ''">移除</button>
          </div>
          <p v-if="uploadingTarget === item.key" role="status" class="text-xs text-sky-700 dark:text-sky-300">图片上传中，请稍候… {{ uploadPercent }}%</p>
        </fieldset>
        <label v-else class="block min-w-0 space-y-1" :class="item.kind === 'textarea' ? 'sm:col-span-2' : ''">
          <span class="text-sm font-medium">{{ item.label }}{{ item.required ? ' *' : '' }}</span>
          <textarea v-if="item.kind === 'textarea'" v-model="form[item.key]" :name="item.key" rows="3" maxlength="5000" :required="item.required" :aria-invalid="invalidField === item.key" />
          <select v-else-if="item.kind === 'select'" v-model="form[item.key]" :name="item.key">
            <option value="">请选择</option>
            <option v-if="form[item.key] && !item.options.includes(form[item.key])" :value="form[item.key]">{{ form[item.key] }}</option>
            <option v-for="option in item.options" :key="option" :value="option">{{ option }}</option>
          </select>
          <input v-else v-model="form[item.key]" :name="item.key" :type="inputType(item)" :maxlength="500" :required="item.required" :aria-invalid="invalidField === item.key" />
          <span v-if="item.hint" class="block text-xs text-slate-500 dark:text-slate-400">{{ item.hint }}</span>
        </label>
      </template>
    </fieldset>
    <input ref="fileInput" type="file" class="hidden" accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml" tabindex="-1" @change="handleFileChange" />
    <p v-if="errorMessage" role="alert" class="rounded-lg bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-200">{{ errorMessage }}</p>
    <button type="submit" :disabled="busy || Boolean(loadError) || !typeOptions.length" :aria-busy="loading" class="min-h-11 w-full rounded-xl bg-sky-700 px-5 py-3 font-semibold text-white transition-colors hover:bg-sky-800 disabled:cursor-wait disabled:opacity-60">
      {{ loading ? '提交中…' : uploadingTarget ? '请等待图片上传完成' : submitLabel }}
    </button>
  </form>
</template>

<style scoped>
.event-form input:not([type='radio']):not([type='file']),
.event-form textarea,
.event-form select {
  width: 100%;
  min-height: 44px;
  border: 1px solid #cbd5e1;
  border-radius: 0.5rem;
  padding: 0.625rem 0.75rem;
  background: #fff;
  color: #0f172a;
}
.event-form :is(input, textarea, select, button):focus-visible {
  outline: 2px solid #0284c7;
  outline-offset: 2px;
}
html.dark .event-form :is(input, textarea, select):not([type='radio']) {
  background: #0f172a;
  color: #e2e8f0;
  border-color: #475569;
}
.event-form [aria-invalid='true'] { border-color: #e11d48; }
</style>
