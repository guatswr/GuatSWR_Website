<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { PropType } from 'vue'
import { useForm } from '@tanstack/vue-form'
import {
  EVENT_TYPES,
  buildEventPayload,
  createEventFormSchema,
  createEventFormState,
  getEventFields,
  getEventTypes,
  validateEventForm,
  type DraftSession,
  type EventFormField,
  type EventFormModel,
  type EventLike,
  type PublicEvent
} from '@guatswr/shared'
import { useEventApi } from '~/composables/useEventApi'
import { EventTransportError, isUploadableImage } from '~/utils/event-transport'

/**
 * Event create/edit form.
 *
 * TanStack Form drives state/validation with the shared Zod schema through the
 * native Standard Schema interface, so the UI model rules live in one place. The
 * transport keeps the guest draft → pending flow; the browser's `isAdmin` hint
 * only changes copy and which transport may publish, never authority.
 */
const props = defineProps({
  allowedTypes: { type: Array as PropType<string[]>, default: () => [...EVENT_TYPES] },
  isAdmin: { type: Boolean, default: false },
  submitLabel: { type: String, default: '提交审核' },
  eventId: { type: [Number, String], default: null },
  initialData: { type: Object as PropType<EventLike | null>, default: null }
})
const emit = defineEmits<{ submitted: [result: Record<string, unknown>] }>()

const transport = useEventApi({ canPublish: props.isAdmin })
const typeOptions = computed(() => getEventTypes(props.allowedTypes))
const schema = createEventFormSchema(typeOptions.value)
const editing = computed(() => Boolean(props.eventId || props.initialData?.id))

const originalEvent = ref<EventLike | null>(props.initialData)
const loading = ref(false)
const loadingInitial = ref(false)
const loadError = ref('')
const errorMessage = ref('')
const message = ref('')
const invalidField = ref('')
const uploadingTarget = ref('')
const uploadPercent = ref(0)
const fileInput = ref<HTMLInputElement | null>(null)
const formElement = ref<HTMLFormElement | null>(null)
const uploadTarget = ref('')
let draftSession: DraftSession = transport.draftSession()
let uploadController: AbortController | undefined
let loadVersion = 0

const form = useForm({
  defaultValues: createEventFormState(props.initialData, typeOptions.value),
  validators: { onChange: schema, onSubmit: schema },
  onSubmit: async ({ value }) => {
    await submit(value as EventFormModel)
  }
})

// `form.state` is a plain snapshot in @tanstack/vue-form 1.33.5, so a `computed`
// over it never invalidates: the pre-submit `validateEventForm` and the field
// catalogue would keep reading the initial defaults while the inputs (bound to
// the reactive `field.state`) show what the visitor typed. `useSelector` is the
// adapter's reactive read of the same store.
const values = form.useSelector((state) => state.values as EventFormModel)
const fields = computed<EventFormField[]>(() => getEventFields(values.value))
const busy = computed(
  () => loading.value || loadingInitial.value || Boolean(uploadingTarget.value)
)

function errorText(error: unknown): string {
  if (typeof error === 'string') return error
  if (error && typeof error === 'object' && 'message' in error)
    return String((error as { message: unknown }).message)
  return '请检查该项'
}

async function loadInitial(): Promise<void> {
  const version = ++loadVersion
  loadError.value = ''
  errorMessage.value = ''
  invalidField.value = ''
  draftSession = transport.draftSession()
  originalEvent.value = props.initialData
  form.reset(createEventFormState(props.initialData, typeOptions.value))
  loadingInitial.value = false
  if (!props.eventId || props.initialData) return
  loadingInitial.value = true
  try {
    // Public read of the event being edited; the admin batch passes protected
    // `initialData` for drafts, which public reads must never expose.
    const record = await $fetch<PublicEvent>(`/api/event/${props.eventId}`)
    if (version !== loadVersion) return
    originalEvent.value = record
    form.reset(createEventFormState(record, typeOptions.value))
  } catch {
    if (version === loadVersion) loadError.value = '活动读取失败，请重试'
  } finally {
    if (version === loadVersion) loadingInitial.value = false
  }
}

watch(() => [props.eventId, props.initialData], loadInitial, { immediate: true })
onBeforeUnmount(() => {
  loadVersion += 1
  uploadController?.abort()
  uploadController = undefined
})

/** Older ISO timestamps and free-text schedules stay editable as text. */
const inputType = (item: EventFormField): string => {
  const value = String(values.value[item.key] ?? '')
  if (item.kind === 'datetime-local' && value && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value))
    return 'text'
  return item.kind
}

function chooseImage(key: string): void {
  if (busy.value || uploadLocked.value) return
  uploadTarget.value = key
  fileInput.value?.click()
}

const uploadLocked = computed(() => Boolean(loadError.value))

async function handleFileChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  const target = uploadTarget.value
  if (!file || !target || busy.value) return
  message.value = ''
  errorMessage.value = ''
  if (!isUploadableImage(file)) {
    errorMessage.value = '请选择 50 MB 以内的 JPG、PNG、GIF、WebP 或 SVG 图片'
    input.value = ''
    return
  }
  uploadingTarget.value = target
  uploadPercent.value = 0
  const version = loadVersion
  uploadController?.abort()
  uploadController = new AbortController()
  try {
    const { compressUploadImage } = await import('~/utils/compress-image')
    const image = await compressUploadImage(file)
    // Guests bind every upload to their one draft id (archived behaviour).
    const eid = props.isAdmin ? null : await draftSession.ensureId()
    const result = await transport.uploadContent(image, eid, {
      signal: uploadController.signal,
      onProgress: (progress) => {
        if (version === loadVersion) uploadPercent.value = progress.percent
      }
    })
    if (version !== loadVersion) return
    form.setFieldValue(target, result.url)
    invalidField.value = ''
  } catch (error) {
    if (version !== loadVersion) return
    errorMessage.value =
      error instanceof EventTransportError ? error.message : '图片上传失败，请重试'
  } finally {
    uploadingTarget.value = ''
    uploadPercent.value = 0
    uploadController = undefined
    input.value = ''
  }
}

async function submit(value: EventFormModel): Promise<void> {
  if (busy.value || loadError.value) return
  loading.value = true
  const version = loadVersion
  errorMessage.value = ''
  try {
    const result = await transport.submit(buildEventPayload(value, originalEvent.value), {
      eventId: props.eventId ? Number(props.eventId) : null,
      isAdmin: props.isAdmin,
      draftSession
    })
    if (version !== loadVersion) return
    message.value = editing.value
      ? '修改已保存'
      : props.isAdmin
        ? '活动已发布'
        : '提交成功，等待管理员审核'
    emit('submitted', result)
    if (!editing.value) {
      form.reset(createEventFormState(null, [value.type]))
      draftSession = transport.draftSession()
    }
  } catch (error) {
    // Never auto-retry a mutation: the user decides whether to submit again.
    if (version !== loadVersion) return
    errorMessage.value =
      error instanceof EventTransportError ? error.message : '提交失败，请重试'
  } finally {
    loading.value = false
  }
}

function handleSubmit(): void {
  if (busy.value || loadError.value) return
  const issue = validateEventForm(values.value, typeOptions.value)
  invalidField.value = issue?.field ?? ''
  errorMessage.value = issue?.message ?? ''
  if (issue) {
    const control = formElement.value?.elements.namedItem(issue.field)
    // `namedItem` may return a RadioNodeList; only a real element can take focus.
    if (control instanceof HTMLElement) control.focus()
    return
  }
  void form.handleSubmit()
}
</script>

<template>
  <form
    ref="formElement"
    class="event-form space-y-5 text-slate-800 dark:text-slate-100"
    novalidate
    @submit.prevent="handleSubmit"
  >
    <p class="text-sm text-slate-500 dark:text-slate-400">
      {{
        editing
          ? '修改活动信息；已有的活动状态、报名和比赛结果会保留。'
          : isAdmin
            ? '填写活动信息后即可发布。'
            : '填写活动信息，提交后由管理员审核。'
      }}
      标有 * 的项目为必填。
    </p>
    <p v-if="loadingInitial" role="status" class="text-sm">正在读取活动…</p>
    <div
      v-if="loadError"
      role="alert"
      class="rounded-lg bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-200"
    >
      {{ loadError }}
      <button type="button" class="ml-2 min-h-11 underline" @click="loadInitial">重新读取</button>
    </div>

    <fieldset :disabled="busy || uploadLocked" class="grid min-w-0 gap-4 sm:grid-cols-2 disabled:opacity-70">
      <legend class="sr-only">活动信息</legend>

      <label class="block space-y-1">
        <span class="text-sm font-medium">活动类型 *</span>
        <form.Field name="type">
          <template #default="{ field }">
            <select
              :name="field.name"
              :value="field.state.value"
              required
              :disabled="editing"
              :aria-invalid="invalidField === 'type'"
              @change="field.handleChange(($event.target as HTMLSelectElement).value)"
              @blur="field.handleBlur"
            >
              <option v-for="type in typeOptions" :key="type" :value="type">{{ type }}</option>
            </select>
          </template>
        </form.Field>
      </label>

      <label class="block space-y-1">
        <span class="text-sm font-medium">标题 *</span>
        <form.Field name="title">
          <template #default="{ field }">
            <input
              :name="field.name"
              :value="field.state.value"
              maxlength="200"
              required
              placeholder="给活动起一个名字"
              :aria-invalid="invalidField === 'title' || field.state.meta.errors.length > 0"
              @input="field.handleChange(($event.target as HTMLInputElement).value)"
              @blur="field.handleBlur"
            />
            <span
              v-if="field.state.meta.errors.length"
              class="block text-xs text-rose-600 dark:text-rose-300"
              role="alert"
              >{{ errorText(field.state.meta.errors[0]) }}</span
            >
          </template>
        </form.Field>
      </label>

      <fieldset v-if="values.type === '对赌协议'" class="flex min-w-0 flex-wrap gap-4 sm:col-span-2">
        <legend class="mb-1 text-sm font-medium">对赌方式</legend>
        <label class="inline-flex min-h-11 items-center gap-2">
          <form.Field name="betMode">
            <template #default="{ field }">
              <input
                type="radio"
                name="bet-mode"
                value="solo"
                :checked="field.state.value === 'solo'"
                @change="field.handleChange('solo')"
              />
            </template>
          </form.Field>
          单人赌约
        </label>
        <label class="inline-flex min-h-11 items-center gap-2">
          <form.Field name="betMode">
            <template #default="{ field }">
              <input
                type="radio"
                name="bet-mode"
                value="duo"
                :checked="field.state.value === 'duo'"
                @change="field.handleChange('duo')"
              />
            </template>
          </form.Field>
          双人对赌
        </label>
      </fieldset>

      <template v-for="item in fields" :key="item.key">
        <fieldset v-if="item.kind === 'image'" class="min-w-0 space-y-2 sm:col-span-2">
          <legend class="text-sm font-medium">{{ item.label }}{{ item.required ? ' *' : '' }}</legend>
          <form.Field :name="item.key">
            <template #default="{ field }">
              <div class="flex min-w-0 flex-wrap items-center gap-3">
                <img
                  v-if="field.state.value"
                  :src="String(field.state.value)"
                  :alt="item.label + '预览'"
                  class="h-16 w-16 rounded-lg border border-slate-200 object-cover dark:border-slate-700"
                />
                <button
                  type="button"
                  :name="item.key"
                  :aria-label="'上传' + item.label"
                  :aria-invalid="invalidField === item.key"
                  class="min-h-11 rounded-lg bg-sky-700 px-4 py-2 text-sm font-medium text-white hover:bg-sky-800"
                  @click="chooseImage(item.key)"
                >
                  {{
                    uploadingTarget === item.key
                      ? `上传中 ${uploadPercent}%`
                      : field.state.value
                        ? '更换图片'
                        : '选择图片'
                  }}
                </button>
                <button
                  v-if="field.state.value && !item.required"
                  type="button"
                  class="min-h-11 px-2 text-sm text-slate-500 underline dark:text-slate-300"
                  :aria-label="'移除' + item.label"
                  @click="field.handleChange('')"
                >
                  移除
                </button>
              </div>
              <p v-if="uploadingTarget === item.key" role="status" class="text-xs text-sky-700 dark:text-sky-300">
                图片上传中，请稍候… {{ uploadPercent }}%
              </p>
            </template>
          </form.Field>
        </fieldset>

        <label
          v-else
          class="block min-w-0 space-y-1"
          :class="item.kind === 'textarea' ? 'sm:col-span-2' : ''"
        >
          <span class="text-sm font-medium">{{ item.label }}{{ item.required ? ' *' : '' }}</span>
          <form.Field :name="item.key">
            <template #default="{ field }">
              <textarea
                v-if="item.kind === 'textarea'"
                :name="item.key"
                :value="String(field.state.value ?? '')"
                rows="3"
                maxlength="5000"
                :required="item.required"
                :aria-invalid="invalidField === item.key || field.state.meta.errors.length > 0"
                @input="field.handleChange(($event.target as HTMLTextAreaElement).value)"
                @blur="field.handleBlur"
              />
              <select
                v-else-if="item.kind === 'select'"
                :name="item.key"
                :value="String(field.state.value ?? '')"
                @change="field.handleChange(($event.target as HTMLSelectElement).value)"
                @blur="field.handleBlur"
              >
                <option value="">请选择</option>
                <option
                  v-if="field.state.value && !item.options?.includes(String(field.state.value))"
                  :value="String(field.state.value)"
                >
                  {{ field.state.value }}
                </option>
                <option v-for="option in item.options" :key="option" :value="option">{{ option }}</option>
              </select>
              <input
                v-else
                :name="item.key"
                :value="String(field.state.value ?? '')"
                :type="inputType(item)"
                maxlength="500"
                :required="item.required"
                :aria-invalid="invalidField === item.key || field.state.meta.errors.length > 0"
                @input="field.handleChange(($event.target as HTMLInputElement).value)"
                @blur="field.handleBlur"
              />
              <span v-if="item.hint" class="block text-xs text-slate-500 dark:text-slate-400">{{
                item.hint
              }}</span>
              <span
                v-if="field.state.meta.errors.length"
                class="block text-xs text-rose-600 dark:text-rose-300"
                role="alert"
                >{{ errorText(field.state.meta.errors[0]) }}</span
              >
            </template>
          </form.Field>
        </label>
      </template>
    </fieldset>

    <input
      ref="fileInput"
      type="file"
      class="hidden"
      accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml"
      tabindex="-1"
      @change="handleFileChange"
    />

    <p
      v-if="errorMessage"
      role="alert"
      class="rounded-lg bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-200"
    >
      {{ errorMessage }}
    </p>
    <p v-if="message" role="status" class="text-sm text-emerald-600 dark:text-emerald-300">
      {{ message }}
    </p>

    <button
      type="submit"
      :disabled="busy || uploadLocked || !typeOptions.length"
      :aria-busy="loading"
      class="min-h-11 w-full rounded-xl bg-sky-700 px-5 py-3 font-semibold text-white transition-colors hover:bg-sky-800 disabled:cursor-wait disabled:opacity-60"
    >
      {{
        loading
          ? '提交中…'
          : uploadingTarget
            ? '请等待图片上传完成'
            : submitLabel
      }}
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
.event-form [aria-invalid='true'] {
  border-color: #e11d48;
}
</style>
